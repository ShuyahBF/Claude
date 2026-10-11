"""Routes PUBLIQUES de l'application Android « Raccourcis Paiement Mobile » (lot 13).

Une seule API pour le site ET l'app : l'app Android n'a plus son propre serveur
Node. Elle lit et écrit les MÊMES données que le site :
  - le catalogue des services USSD (collection mpw_services, géré par l'administrateur du site) ;
  - l'annuaire partagé des codes marchands (collection mpw_marchands) ;
  - les profils saisis à l'accueil de l'app (collection mpw_profils_android, à part des comptes
    du site : un profil Android n'a pas de mot de passe et ne permet pas de se connecter au site).

Préfixe dédié « /api/android/… » : les routes du site (/api/services, /api/marchands…) exigent
une session, et /api/services y existe déjà avec un autre format. Le préfixe évite tout conflit.

Le JSON renvoyé suit EXACTEMENT les noms de champs de l'app (Models.kt, en camelCase anglais) :
  Service  { _id, operator, country, name, category, ussdTemplate, fields[], description }
  Merchant { _id, code, operator, label }

Pour un développeur WinDev : chaque fonction ci-dessous est un « point d'entrée » de webservice
REST ; les fonctions _vers_service / _vers_marchand font la correspondance des rubriques
(nom interne français → nom attendu par l'app).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

import signal_connexion
from db import SANS_ID, db
from limiteur import limiter_appels_publics
from ussd import ErreurSaisie, email_valide, normaliser_email, normaliser_telephone

router = APIRouter(prefix="/android", tags=["Application Android"], dependencies=[Depends(limiter_appels_publics)])

# Caractères admis dans l'intitulé d'un marchand (mêmes que sur le site : lettres accentuées comprises)
CARACTERES_INTERDITS_LIBELLE = re.compile(r"[^0-9A-Za-zÀ-ÖØ-öø-ÿ ._'-]")


# ---------------------------------------------------------------------------
# Correspondance des données (format interne du site → format de l'app)
# ---------------------------------------------------------------------------
def _vers_service(doc: dict) -> dict:
    """Service du catalogue → objet « Service » de l'app Android."""
    return {
        "_id": doc.get("id"),
        "operator": doc.get("operateur"),
        "country": doc.get("pays", "BF"),
        "name": doc.get("nom"),
        "category": doc.get("categorie", "other"),
        "ussdTemplate": doc.get("gabarit_ussd"),
        # Les champs sont déjà stockés avec les noms de l'app (key, label, type, isMerchantCode)
        "fields": [{"key": c.get("key"), "label": c.get("label", c.get("key")), "type": c.get("type", "numeric"),
                    "isMerchantCode": bool(c.get("isMerchantCode", False))} for c in doc.get("champs", [])],
        "description": doc.get("description", ""),
    }


def _vers_marchand(doc: dict) -> dict:
    """Marchand de l'annuaire → objet « Merchant » de l'app Android.
    L'annuaire n'a pas d'identifiant propre : « opérateur:code » est unique et stable."""
    return {"_id": f"{doc['operateur']}:{doc['code']}", "code": doc["code"], "operator": doc["operateur"],
            "label": doc.get("libelle", "")}


def _nettoyer_libelle(libelle: str) -> str:
    """Retire les caractères non admis et les espaces en trop. Plutôt que de refuser, on nettoie :
    l'app réessaie en boucle un marchand refusé, ce qui le bloquerait pour toujours."""
    return re.sub(r"\s+", " ", CARACTERES_INTERDITS_LIBELLE.sub("", libelle or "")).strip()[:60]


async def _operateur_connu(operateur: str) -> bool:
    """Vrai si l'opérateur figure dans le catalogue (évite de remplir l'annuaire de valeurs fantaisistes)."""
    return await db.services.count_documents({"operateur": operateur}, limit=1) > 0


# ---------------------------------------------------------------------------
# Catalogue des services
# ---------------------------------------------------------------------------
@router.get("/operators")
async def operateurs(country: Optional[str] = Query(None, min_length=2, max_length=2)) -> list[str]:
    """Liste des opérateurs ayant au moins un service actif (triée)."""
    filtre = {"actif": True, **({"pays": country.upper()} if country else {})}
    return sorted(await db.services.distinct("operateur", filtre))


@router.get("/services")
async def services(operator: str = Query(..., min_length=1, max_length=40),
                   country: Optional[str] = Query(None, min_length=2, max_length=2)) -> list[dict]:
    """Services actifs d'un opérateur, au format de l'app."""
    filtre: dict = {"actif": True, "operateur": operator}
    if country:
        filtre["pays"] = country.upper()
    docs = await db.services.find(filtre, SANS_ID).sort("nom", 1).to_list(500)
    return [_vers_service(d) for d in docs]


# ---------------------------------------------------------------------------
# Annuaire partagé des codes marchands
# ---------------------------------------------------------------------------
class NouveauMarchand(BaseModel):
    """Corps de POST /api/android/merchants (NewMerchantRequest de l'app)."""
    code: str = Field(pattern=r"^[0-9]{1,20}$")          # entièrement numérique
    operator: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=120)


@router.get("/merchants/{operator}/{code}")
async def trouver_marchand(operator: str, code: str) -> dict:
    """Marchand connu, ou 404 : l'app demande alors un intitulé à l'utilisateur."""
    if len(operator) > 40 or not re.fullmatch(r"[0-9]{1,20}", code):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Marchand introuvable")
    doc = await db.marchands.find_one({"operateur": operator, "code": code}, SANS_ID)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Marchand introuvable")
    return _vers_marchand(doc)


@router.post("/merchants", status_code=status.HTTP_201_CREATED)
async def creer_marchand(data: NouveauMarchand) -> dict:
    """Enregistre un code marchand dans l'annuaire partagé (le même que celui du site).
    Un intitulé déjà enregistré n'est PAS écrasé (même règle que sur le site) : on renvoie
    alors le marchand existant. Appel répété sans risque (l'app le rejoue après une coupure)."""
    libelle = _nettoyer_libelle(data.label)
    if not libelle:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Intitulé invalide")
    if not await _operateur_connu(data.operator):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Opérateur inconnu")
    existant = await db.marchands.find_one({"operateur": data.operator, "code": data.code}, SANS_ID)
    if existant:
        return _vers_marchand(existant)
    maintenant = datetime.now(timezone.utc).isoformat()
    doc = {"operateur": data.operator, "code": data.code, "libelle": libelle, "cree_par": "android",
           "cree_le": maintenant, "modifie_le": maintenant}
    try:
        await db.marchands.insert_one(doc.copy())
    except DuplicateKeyError:
        # Créé au même instant par quelqu'un d'autre : on renvoie celui qui est en base
        doc = await db.marchands.find_one({"operateur": data.operator, "code": data.code}, SANS_ID) or doc
    return _vers_marchand(doc)


# ---------------------------------------------------------------------------
# Profil saisi à l'accueil de l'app (upsert par numéro de téléphone)
# ---------------------------------------------------------------------------
class ProfilAndroid(BaseModel):
    """Corps de POST /api/android/users (UserProfileRequest de l'app)."""
    nom: str = Field(min_length=1, max_length=80)
    prenom: str = Field(min_length=1, max_length=80)
    email: Optional[str] = Field(default=None, max_length=120)
    telephone: str = Field(min_length=6, max_length=25)


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def enregistrer_profil(data: ProfilAndroid, request: Request) -> dict:
    """Crée ou met à jour le profil (clé = téléphone au format international), puis signale
    la « connexion » à SAWALI (alerte WhatsApp du propriétaire), en arrière-plan."""
    try:
        telephone = normaliser_telephone(data.telephone)
    except ErreurSaisie as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    # E-mail facultatif : une adresse mal formée est ignorée (l'app réessaierait sinon sans fin)
    email = normaliser_email(data.email) if data.email and data.email.strip() else None
    if email and not email_valide(email):
        email = None
    maintenant = datetime.now(timezone.utc).isoformat()
    await db.profils_android.update_one(
        {"telephone": telephone},
        {"$set": {"nom": data.nom.strip(), "prenom": data.prenom.strip(), "email": email, "modifie_le": maintenant},
         "$setOnInsert": {"telephone": telephone, "cree_le": maintenant}},
        upsert=True)
    signal_connexion.signaler("connexion", request, utilisateur=f"{data.prenom.strip()} {data.nom.strip()}",
                              telephone=telephone, role="app Android", page="app-android")
    return {"ok": True, "telephone": telephone}
