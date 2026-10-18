"""Cartes virtuelles (lot 79) : voeux illustrés par l'IA, envoyés au destinataire par WhatsApp (Liluvine joue le facteur).

Demande du propriétaire (18/10/2026) : pour les anniversaires et les heureux événements, l'utilisateur saisit un THÈME et un MESSAGE ;
l'IA propose jusqu'à 3 variantes ; quand l'une lui plaît, Liluvine l'envoie au destinataire. Le coût est celui d'une formule
d'abonnement réglée dans SAWALI (fonction « Cartes virtuelles »).

Pour un développeur WinDev :
  - fichier `cartes` : une carte = utilisateur, thème, message, destinataire (nom + téléphone), jusqu'à 3 variantes (images JPEG),
    statut « brouillon » ou « envoyee » ;
  - la GÉNÉRATION est faite par SAWALI (requête signée habituelle) : c'est lui qui contrôle l'abonnement (402 avec le nom et le
    prix de la formule) et le plafond d'images par jour. Une carte n'est enregistrée ici qu'APRÈS une première génération réussie ;
  - la limite de 3 variantes par carte est tenue ICI ;
  - l'ENVOI passe par la transmission universelle de Liluvine (/api/webhook/liluvine-send, requête signée) : modèle Meta, respect du
    STOP du destinataire, quotas et journal sont gérés par SAWALI. L'expéditeur doit déclarer qu'il a l'accord du destinataire
    (case à cocher, gardée avec la carte) ; une carte envoyée perd ses images (seul le texte est conservé) ;
  - au plus 10 cartes envoyées par jour et par utilisateur (anti-abus).

Routes (utilisateur connecté) :
    GET    /api/cartes                         → mes cartes (sans images) + cartes envoyées aujourd'hui
    POST   /api/cartes                         {theme, message, destinataire, telephone} → carte + 1re variante
    GET    /api/cartes/{id}                    → la carte avec ses variantes (images)
    POST   /api/cartes/{id}/variante           → une variante de plus (3 au maximum)
    POST   /api/cartes/{id}/envoyer            {variante_id, accord: true} → envoi WhatsApp
    DELETE /api/cartes/{id}
"""
from __future__ import annotations

import base64
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import signal_connexion
import support_sawali
from config import get_settings
from db import SANS_ID, db
from limiteur import limiter_appels_publics
from routes.abonnement import utilisateur_sawali
from securite import get_current_user
from support_sawali import appeler_sawali
from ussd import ErreurSaisie, normaliser_telephone

logger = logging.getLogger("paiement_mobile.cartes")

SERVICE = "Le service de cartes virtuelles"
VARIANTES_MAX = 3          # variantes proposées par carte (demande du propriétaire)
BROUILLONS_MAX = 20        # cartes non envoyées gardées par utilisateur
ENVOIS_PAR_JOUR = 10       # cartes envoyées par jour et par utilisateur

# Formes artistiques et moteurs IA proposés (clés identiques à celles de SAWALI, voir routes/cartes_plateformes.py) : listes fermées.
STYLES = {"illustration": "Illustration / dessin", "photo": "Photo réaliste", "huile": "Peinture à l'huile", "aquarelle": "Aquarelle",
          "pastel": "Pastel", "gouache": "Gouache / art naïf", "3d": "Rendu 3D", "papier": "Papier découpé", "vintage": "Affiche rétro",
          "fusain": "Fusain / encre"}
MOTEURS = {"eco": "Économique", "standard": "Standard", "premium": "Premium (haute qualité)", "dalle3": "DALL·E 3", "dalle3hd": "DALL·E 3 haute définition"}

router = APIRouter(prefix="/cartes", tags=["Cartes virtuelles"])


class NouvelleCarte(BaseModel):
    theme: str = Field(..., min_length=3, max_length=100)
    message: str = Field(..., min_length=2, max_length=300)
    destinataire: str = Field(..., min_length=1, max_length=60)
    telephone: str = Field(..., min_length=6, max_length=30)
    style: str = Field("illustration", max_length=20)     # forme artistique (clé de STYLES)
    moteur: str = Field("standard", max_length=20)        # type d'IA (clé de MOTEURS)


class Envoi(BaseModel):
    variante_id: str = Field(..., min_length=8, max_length=64)
    accord: bool = False       # « j'ai l'accord du destinataire pour lui écrire sur WhatsApp »


def maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


def vue(carte: dict, avec_images: bool) -> dict:
    """Carte renvoyée à l'écran ; les images (lourdes) seulement quand elles sont demandées."""
    sortie = {k: carte.get(k) for k in ("id", "theme", "message", "destinataire", "telephone", "statut", "cree_le", "envoyee_le", "style", "moteur")}
    sortie["nb_variantes"] = len(carte.get("variantes") or [])
    sortie["variantes_max"] = VARIANTES_MAX
    if avec_images:
        sortie["variantes"] = [{"id": v["id"], "image": v["image"]} for v in carte.get("variantes") or []]
    return sortie


async def generer_image(user: dict, carte: dict) -> Dict[str, Any]:
    """Demande une image à SAWALI (abonnement et plafond du jour contrôlés là-bas). Renvoie {id, image}."""
    rep = await appeler_sawali("/cartes-plateformes/generer", {
        "utilisateur": utilisateur_sawali(user), "theme": carte["theme"], "message": carte["message"],
        "destinataire": carte["destinataire"], "style": carte.get("style") or "illustration", "moteur": carte.get("moteur") or "standard"}, service=SERVICE, delai=120)
    image = rep.get("image") or ""
    if not image.startswith("data:image/"):
        raise HTTPException(502, f"{SERVICE} a renvoyé une image illisible")
    return {"id": str(uuid.uuid4()), "image": image}


async def mienne(carte_id: str, user: dict) -> dict:
    carte = await db.cartes.find_one({"id": carte_id, "user_id": user["id"]}, SANS_ID)
    if not carte:
        raise HTTPException(404, "Carte introuvable")
    return carte


async def envoyees_aujourdhui(user_id: str) -> int:
    debut = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    return await db.cartes.count_documents({"user_id": user_id, "statut": "envoyee", "envoyee_le": {"$gte": debut}})


async def poster_a_liluvine(corps: Dict[str, Any]) -> Dict[str, Any]:
    """POST signé vers la transmission WhatsApp de Liluvine (SAWALI). Lève une HTTPException lisible."""
    if not signal_connexion.configure():
        raise HTTPException(503, "L'envoi de cartes n'est pas configuré sur cette plateforme")
    s = get_settings()
    brut = json.dumps(corps, ensure_ascii=False)
    ts = str(int(time.time()))
    entetes = {"Content-Type": "application/json", "X-Emetteur": s.liluvine_wa_emetteur or "paiementmobile", "X-Timestamp": ts,
               "X-Signature": signal_connexion.signer(signal_connexion.cle(), ts, brut)}
    try:
        async with httpx.AsyncClient(timeout=60, transport=support_sawali._transport) as client:
            r = await client.post(f"{s.sawali_url.rstrip('/')}/api/webhook/liluvine-send", content=brut.encode("utf-8"), headers=entetes)
    except httpx.HTTPError:
        raise HTTPException(502, "L'envoi n'a pas pu être fait pour le moment, réessayez dans un instant")
    if r.status_code == 409:
        raise HTTPException(409, "Ce numéro a demandé à ne plus recevoir de messages : la carte ne peut pas lui être envoyée")
    if r.status_code == 429:
        raise HTTPException(429, "Trop de messages envoyés à ce numéro pour le moment : réessayez plus tard")
    if r.status_code >= 400:
        logger.warning("Carte refusée par Liluvine (HTTP %s)", r.status_code)
        raise HTTPException(502, "La carte n'a pas pu être envoyée : réessayez dans un instant")
    try:
        return r.json()
    except ValueError:
        return {}


@router.get("")
async def lister(user: dict = Depends(get_current_user)):
    docs = await db.cartes.find({"user_id": user["id"]}, SANS_ID).sort("cree_le", -1).to_list(60)
    return {"styles": STYLES, "moteurs": MOTEURS, "cartes": [vue(c, False) for c in docs], "envoyees_aujourdhui": await envoyees_aujourdhui(user["id"]),
            "envois_par_jour": ENVOIS_PAR_JOUR, "variantes_max": VARIANTES_MAX}


@router.post("", status_code=201, dependencies=[Depends(limiter_appels_publics)])
async def creer(data: NouvelleCarte, user: dict = Depends(get_current_user)):
    if data.style not in STYLES or data.moteur not in MOTEURS:
        raise HTTPException(422, "Forme artistique ou type d'IA inconnu")
    try:
        telephone = normaliser_telephone(data.telephone)    # règle du Burkina Faso (8 chiffres → +226)
    except ErreurSaisie:
        raise HTTPException(422, "Numéro invalide : 8 chiffres au Burkina Faso (ex. 70 00 00 00) ou numéro international")
    if await db.cartes.count_documents({"user_id": user["id"], "statut": "brouillon"}) >= BROUILLONS_MAX:
        raise HTTPException(409, f"{BROUILLONS_MAX} cartes en cours au maximum : supprimez-en une avant d'en créer une autre")
    carte = {"id": str(uuid.uuid4()), "user_id": user["id"], "theme": data.theme.strip(), "message": data.message.strip(),
             "destinataire": data.destinataire.strip(), "telephone": telephone, "statut": "brouillon", "variantes": [],
             "style": data.style, "moteur": data.moteur, "cree_le": maintenant(), "envoyee_le": None}
    # Première image : si SAWALI refuse (abonnement, plafond…), rien n'est enregistré
    carte["variantes"].append(await generer_image(user, carte))
    await db.cartes.insert_one(carte.copy())
    return vue(carte, True)


@router.get("/{carte_id}")
async def lire(carte_id: str, user: dict = Depends(get_current_user)):
    return vue(await mienne(carte_id, user), True)


@router.post("/{carte_id}/variante", dependencies=[Depends(limiter_appels_publics)])
async def variante(carte_id: str, user: dict = Depends(get_current_user)):
    carte = await mienne(carte_id, user)
    if carte["statut"] != "brouillon":
        raise HTTPException(409, "Cette carte est déjà envoyée")
    if len(carte.get("variantes") or []) >= VARIANTES_MAX:
        raise HTTPException(409, f"{VARIANTES_MAX} variantes au maximum : choisissez-en une ou créez une nouvelle carte")
    nouvelle = await generer_image(user, carte)
    # Ajout conditionnel : deux clics simultanés ne dépassent jamais la limite
    r = await db.cartes.update_one({"id": carte_id, "user_id": user["id"], "statut": "brouillon",
                                    f"variantes.{VARIANTES_MAX - 1}": {"$exists": False}}, {"$push": {"variantes": nouvelle}})
    if not r.modified_count:
        raise HTTPException(409, f"{VARIANTES_MAX} variantes au maximum")
    return vue(await mienne(carte_id, user), True)


@router.post("/{carte_id}/envoyer", dependencies=[Depends(limiter_appels_publics)])
async def envoyer(carte_id: str, data: Envoi, user: dict = Depends(get_current_user)):
    carte = await mienne(carte_id, user)
    if carte["statut"] != "brouillon":
        raise HTTPException(409, "Cette carte est déjà envoyée")
    if not data.accord:
        raise HTTPException(422, "Confirmez que le destinataire est d'accord pour recevoir un message sur WhatsApp")
    choisie = next((v for v in carte.get("variantes") or [] if v["id"] == data.variante_id), None)
    if not choisie:
        raise HTTPException(404, "Variante introuvable")
    if await envoyees_aujourdhui(user["id"]) >= ENVOIS_PAR_JOUR:
        raise HTTPException(429, f"Limite atteinte : {ENVOIS_PAR_JOUR} cartes envoyées par jour. Réessayez demain.")
    expediteur = f"{user.get('prenom') or ''} {user.get('nom') or ''}".strip() or "un proche"
    entete, _, b64 = choisie["image"].partition(",")
    mime = entete[5:].split(";")[0] if entete.startswith("data:") else "image/jpeg"
    # L'identifiant de la carte sert d'idempotence : un nouvel essai réseau ne renvoie jamais la carte deux fois
    await poster_a_liluvine({
        "id": f"carte-{carte['id']}", "to": carte["telephone"], "source": f"auRor — {expediteur}"[:60],
        "message": f"💌 {expediteur} vous envoie une carte via auRor.",
        "media": {"type": "image", "contenu_base64": b64, "mime": mime, "nom_fichier": "carte.jpg",
                  "legende": f"💌 Une carte de la part de {expediteur}"}})
    # Envoyée : on garde le texte, on libère les images
    await db.cartes.update_one({"id": carte_id, "user_id": user["id"]},
                               {"$set": {"statut": "envoyee", "envoyee_le": maintenant(), "accord_declare": True, "variantes": []}})
    return {"ok": True, "carte": vue(await mienne(carte_id, user), False)}


@router.delete("/{carte_id}")
async def supprimer(carte_id: str, user: dict = Depends(get_current_user)):
    r = await db.cartes.delete_one({"id": carte_id, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(404, "Carte introuvable")
    return {"ok": True}
