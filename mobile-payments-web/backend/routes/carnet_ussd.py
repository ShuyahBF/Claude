"""Carnet de codes USSD pratiques (lot 66) : recharges Internet, connaître son numéro, solde, Mobile Money…

Demande du propriétaire (17/10/2026) : « carnet de codes USSD pratiques : recharges Internet, connaître son numéro, etc. »
pour les opérateurs du Burkina Faso (Orange, Moov Africa, Telecel Faso).

Pour un développeur WinDev (équivalent d'un seul fichier de données) :
  - fichier `ussd_codes` : un code = opérateur + catégorie + titre + code + description (optionnelle) + actif ;
  - les utilisateurs CONSULTENT (recherche, copie, appel direct) ; seul l'administrateur ajoute, corrige, désactive ou supprime ;
  - IMPORT EN BLOC : l'administrateur colle du texte, une ligne par code, sous la forme
        Opérateur | Catégorie | Titre | Code | Description (facultative) | Usage (facultatif : solde, releve, renvoi_notification)
    (les lignes déjà présentes — même opérateur et même code — sont ignorées, les lignes mal formées sont listées avec leur numéro) ;
  - AUCUN code n'est inventé ici : le carnet est vide tant que l'administrateur n'a pas saisi ou importé des codes vérifiés.

Routes (utilisateur connecté) :
    GET  /api/ussd                          → {operateurs: [{nom, categories: [{nom, codes: [{id, titre, code, description, appelable}]}]}]}
Routes PUBLIQUES (lot 110, lecture seule, sans session — pour Concentration et les autres plateformes de paiement du propriétaire) :
    GET  /api/android/ussd-codes?operateur=&usage=  → {version, codes: [{id, operateur, categorie, titre, code, description, usage, appelable, demande_pin}]}
         « version » = empreinte du contenu, reprise dans l'en-tête ETag : le client la garde en cache LOCAL et ne retélécharge que
         si elle change (réponse 304 sinon) ; connexion perdue → il continue avec sa copie locale.
         « usage » : rôle fonctionnel du code (solde, relevé, renvoi de notification) pour qu'une autre plateforme retrouve LE bon code sans en
         connaître le texte ; modifier le code ici suffit à corriger toutes les plateformes. Un code qui contient le mot PIN demande le code secret
         à l'utilisateur au moment de l'appel (jamais stocké ailleurs).
Routes (administrateur) :
    GET/POST /api/admin/ussd/codes · PUT/DELETE /api/admin/ussd/codes/{id}
    POST     /api/admin/ussd/importer       {texte}  → {ajoutes, ignores, erreurs: [{ligne, motif}]}
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from db import SANS_ID, db
from limiteur import limiter_appels_publics
from securite import get_current_user, require_admin

router = APIRouter(tags=["Codes USSD"])
# Lecture publique (lot 110) : même préfixe que les routes de l'application Android, limitée en nombre d'appels
router_public = APIRouter(prefix="/android", tags=["Codes USSD (lecture publique)"], dependencies=[Depends(limiter_appels_publics)])

# Rôles fonctionnels d'un code (liste finie, règle 10) : permettent aux autres plateformes de retrouver le bon code
USAGES = {"": "Aucun usage particulier", "solde": "Connaître le solde", "releve": "Mini relevé des dernières opérations",
          "renvoi_notification": "Renvoi de la notification (SMS) d'une opération"}

# Listes finies (règle 10) : opérateurs du Burkina Faso, catégories proposées (« Autre… » reste possible côté écran)
OPERATEURS = ["Orange", "Moov", "Telecel"]
CATEGORIES_DEFAUT = ["Mon numéro", "Solde et crédit", "Internet et forfaits", "Appels et SMS", "Mobile Money", "Services"]
MAX_CODES = 600
# Un code USSD commence par * et finit par # ; il peut contenir des chiffres, * et # (et, pour un modèle à compléter, des lettres : *144*1*NUMERO#)
MOTIF_CODE = re.compile(r"^\*[0-9A-Za-z*#_ ]{1,40}#$")
MOTIF_APPELABLE = re.compile(r"^\*[0-9*#]{1,40}#$")


def normaliser_operateur(texte: str) -> str | None:
    """« orange », « Moov Africa », « TELECEL Faso »… → nom de la liste ; None si inconnu."""
    t = texte.strip().lower()
    for nom in OPERATEURS:
        if t.startswith(nom.lower()):
            return nom
    return None


def code_valide(code: str) -> bool:
    return bool(MOTIF_CODE.match(code.strip().replace(" ", "")))


def lire_lignes(texte: str) -> tuple[list[dict], list[dict]]:
    """Découpe un texte collé en codes valides + erreurs numérotées. Fonction pure (testée sans base)."""
    valides, erreurs = [], []
    for n, brut in enumerate(texte.splitlines(), start=1):
        ligne = brut.strip()
        if not ligne:
            continue
        parts = [p.strip() for p in ligne.split("|")]
        if len(parts) < 4:
            erreurs.append({"ligne": n, "motif": "4 champs séparés par | attendus : Opérateur | Catégorie | Titre | Code"})
            continue
        operateur = normaliser_operateur(parts[0])
        code = parts[3].replace(" ", "")
        if not operateur:
            erreurs.append({"ligne": n, "motif": f"Opérateur inconnu : {parts[0]} (Orange, Moov ou Telecel)"})
        elif not parts[1] or len(parts[1]) > 40 or len(parts[2]) < 2 or len(parts[2]) > 80:
            erreurs.append({"ligne": n, "motif": "Catégorie (≤ 40 caractères) ou titre (2 à 80 caractères) invalide"})
        elif not code_valide(code):
            erreurs.append({"ligne": n, "motif": f"Code invalide : {parts[3]} (il commence par * et finit par #)"})
        else:
            usage = parts[5].strip().lower() if len(parts) > 5 else ""
            if usage not in USAGES:
                erreurs.append({"ligne": n, "motif": f"Usage inconnu : {parts[5]} (" + ", ".join(k for k in USAGES if k) + ")"})
                continue
            if usage and secret_probable(code):
                erreurs.append({"ligne": n, "motif": "Le code se termine par 4 à 6 chiffres : code secret ? Écrivez le mot PIN à sa place (ex. *400*9*4*PIN#)."})
                continue
            valides.append({"operateur": operateur, "categorie": parts[1], "titre": parts[2], "code": code,
                            "description": (parts[4] if len(parts) > 4 else "")[:200], "usage": usage})
    return valides, erreurs


def demande_pin(code: str) -> bool:
    """Vrai si le code contient le mot PIN (ex. *144*4*PIN#) : le code secret est demandé à l'utilisateur au moment de l'appel."""
    return "PIN" in code.upper()


def secret_probable(code: str) -> bool:
    """Vrai si le code ressemble à un code qui CONTIENT un code secret écrit en clair (ex. *400*9*4*1708# : le dernier segment fait 4 à 6 chiffres)
    au lieu du mot PIN (ex. *400*9*4*PIN#). Un code secret écrit dans la base serait lisible par tous (adresse publique) : on le refuse ou on ne le publie pas.
    Fonction pure (testée sans base)."""
    segments = code.strip().rstrip("#").split("*")[1:]
    return len(segments) >= 3 and "PIN" not in code.upper() and bool(re.fullmatch(r"\d{4,6}", segments[-1]))


def exposable(doc: dict) -> bool:
    """Un code d'usage (solde, relevé, renvoi de notification) qui semble contenir un code secret n'est JAMAIS publié, sauf confirmation explicite de l'administrateur."""
    return not (doc.get("usage") and secret_probable(doc["code"]) and not doc.get("sans_code_secret"))


def publier(doc: dict) -> dict:
    """Code prêt à afficher : « appelable » = composable tel quel (que des chiffres, * et #) ; « demande_pin » = il faut saisir le code secret."""
    return {**doc, "usage": doc.get("usage", ""), "appelable": bool(MOTIF_APPELABLE.match(doc["code"])),
            "demande_pin": demande_pin(doc["code"])}


class CodeIn(BaseModel):
    operateur: str = Field(..., min_length=2, max_length=20)
    categorie: str = Field(..., min_length=2, max_length=40)
    titre: str = Field(..., min_length=2, max_length=80)
    code: str = Field(..., min_length=3, max_length=44)
    description: str = Field("", max_length=200)
    usage: str = Field("", max_length=30)
    sans_code_secret: bool = False        # l'administrateur confirme que les derniers chiffres du code ne sont PAS un code secret
    actif: bool = True


class ImportIn(BaseModel):
    texte: str = Field(..., min_length=3, max_length=60000)


def preparer(d: CodeIn) -> dict:
    operateur = normaliser_operateur(d.operateur)
    if not operateur:
        raise HTTPException(status_code=422, detail="Opérateur : Orange, Moov ou Telecel")
    code = d.code.strip().replace(" ", "")
    if not code_valide(code):
        raise HTTPException(status_code=422, detail="Un code USSD commence par * et finit par # (ex. *123#)")
    if d.usage not in USAGES:
        raise HTTPException(status_code=422, detail="Usage inconnu : " + ", ".join(k for k in USAGES if k))
    if d.usage and secret_probable(code) and not d.sans_code_secret:
        raise HTTPException(status_code=422, detail="Ce code se termine par 4 à 6 chiffres : est-ce votre code secret ? Un code secret ne doit JAMAIS être écrit ici (cette liste est lisible par "
                            "les autres logiciels). Remplacez-le par le mot PIN (ex. *400*9*4*PIN#). Si ce n'est pas un code secret, cochez « Ce n'est pas un code secret ».")
    return {"operateur": operateur, "categorie": d.categorie.strip(), "titre": d.titre.strip(), "code": code,
            "description": d.description.strip(), "usage": d.usage, "sans_code_secret": d.sans_code_secret, "actif": d.actif,
            "modifie_le": datetime.now(timezone.utc).isoformat()}


@router.get("/ussd")
async def lire(_: dict = Depends(get_current_user)):
    """Carnet visible des utilisateurs : codes ACTIFS rangés par opérateur puis par catégorie."""
    lignes = await db.ussd_codes.find({"actif": True}, SANS_ID).sort("ordre", 1).to_list(MAX_CODES)
    sortie = []
    for nom in OPERATEURS:
        cats: dict[str, list] = {}
        for c in lignes:
            if c["operateur"] == nom:
                cats.setdefault(c["categorie"], []).append(publier({k: c[k] for k in ("id", "titre", "code", "description")}))
        if cats:
            sortie.append({"nom": nom, "categories": [{"nom": k, "codes": v} for k, v in cats.items()]})
    return {"operateurs": sortie}


@router.get("/admin/ussd/codes")
async def liste(_: dict = Depends(require_admin)):
    lignes = await db.ussd_codes.find({}, SANS_ID).sort("ordre", 1).to_list(MAX_CODES)
    cats = sorted({c["categorie"] for c in lignes} | set(CATEGORIES_DEFAUT))
    return {"codes": [publier(c) for c in lignes], "operateurs": OPERATEURS, "categories": cats, "usages": USAGES}


async def prochain_ordre() -> int:
    return await db.ussd_codes.count_documents({})


@router.post("/admin/ussd/codes", status_code=201)
async def ajouter(d: CodeIn, _: dict = Depends(require_admin)):
    doc = preparer(d)
    if await db.ussd_codes.count_documents({}) >= MAX_CODES:
        raise HTTPException(status_code=409, detail=f"{MAX_CODES} codes au plus")
    if await db.ussd_codes.find_one({"operateur": doc["operateur"], "code": doc["code"]}):
        raise HTTPException(status_code=409, detail="Ce code existe déjà pour cet opérateur")
    doc.update({"id": str(uuid.uuid4()), "ordre": await prochain_ordre()})
    await db.ussd_codes.insert_one(doc.copy())
    return publier(doc)


@router.put("/admin/ussd/codes/{code_id}")
async def modifier(code_id: str, d: CodeIn, _: dict = Depends(require_admin)):
    doc = preparer(d)
    autre = await db.ussd_codes.find_one({"operateur": doc["operateur"], "code": doc["code"], "id": {"$ne": code_id}})
    if autre:
        raise HTTPException(status_code=409, detail="Ce code existe déjà pour cet opérateur")
    r = await db.ussd_codes.update_one({"id": code_id}, {"$set": doc})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Code introuvable")
    return {"ok": True}


@router.delete("/admin/ussd/codes/{code_id}")
async def supprimer(code_id: str, _: dict = Depends(require_admin)):
    r = await db.ussd_codes.delete_one({"id": code_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Code introuvable")
    return {"ok": True}


@router.post("/admin/ussd/importer")
async def importer(d: ImportIn, _: dict = Depends(require_admin)):
    """Import en bloc d'un texte collé (une ligne par code). Les doublons (même opérateur + même code) sont ignorés."""
    valides, erreurs = lire_lignes(d.texte)
    existants = {(c["operateur"], c["code"]) for c in await db.ussd_codes.find({}, SANS_ID).to_list(MAX_CODES)}
    ordre, ajoutes, ignores = await prochain_ordre(), 0, 0
    for v in valides:
        cle = (v["operateur"], v["code"])
        if cle in existants or ordre >= MAX_CODES:
            ignores += 1
            continue
        existants.add(cle)
        await db.ussd_codes.insert_one({**v, "id": str(uuid.uuid4()), "ordre": ordre, "actif": True,
                                        "modifie_le": datetime.now(timezone.utc).isoformat()})
        ordre += 1
        ajoutes += 1
    return {"ajoutes": ajoutes, "ignores": ignores, "erreurs": erreurs}


# ---------------------------------------------------------------------------
# Lecture PUBLIQUE (lot 110) — base centrale des codes USSD, consultable par les autres plateformes et applications
# ---------------------------------------------------------------------------
def empreinte(codes: list[dict]) -> str:
    """Empreinte (16 caractères) du contenu publié : change dès qu'un code est ajouté, modifié, désactivé ou supprimé.
    Fonction pure (testée sans base). Sert de « version » et d'ETag : le client compare et ne retélécharge qu'au changement."""
    brut = json.dumps(codes, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(brut.encode("utf-8")).hexdigest()[:16]


@router_public.get("/ussd-codes")
async def codes_publics(request: Request, response: Response, operateur: Optional[str] = Query(None, max_length=20),
                        usage: Optional[str] = Query(None, max_length=30)):
    """Codes USSD ACTIFS, au format des autres plateformes. Réponse 304 (sans corps) si le client envoie l'ETag déjà reçu :
    économise les données mobiles et permet de vivre avec une connexion Internet intermittente."""
    filtre: dict = {"actif": True}
    if operateur:
        nom = normaliser_operateur(operateur)
        if not nom:
            raise HTTPException(status_code=422, detail="Opérateur : Orange, Moov ou Telecel")
        filtre["operateur"] = nom
    if usage:
        if usage not in USAGES:
            raise HTTPException(status_code=422, detail="Usage inconnu")
        filtre["usage"] = usage
    lignes = [c for c in await db.ussd_codes.find(filtre, SANS_ID).sort("ordre", 1).to_list(MAX_CODES) if exposable(c)]
    codes = [{k: v for k, v in publier(c).items() if k in ("id", "operateur", "categorie", "titre", "code", "description", "usage",
                                                           "appelable", "demande_pin")} for c in lignes]
    version = empreinte(codes)
    etag = f'"{version}"'
    entetes = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match", "").strip() == etag:
        return Response(status_code=304, headers=entetes)
    response.headers.update(entetes)
    return {"version": version, "codes": codes}
