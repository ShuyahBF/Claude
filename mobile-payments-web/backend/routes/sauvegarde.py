"""Sauvegarde en ligne CHIFFRÉE d'auRor (lot 168) : journal intime, carnet de contacts et lignes de paiement des SMS.

Demande du propriétaire (16/11/2026) : un téléphone peut être volé ou perdu ; l'utilisateur choisit au premier lancement (puis dans le bloc sécurisé de son
profil) entre la sauvegarde EN LIGNE et « ce téléphone seulement » ; sur un nouveau téléphone, il remet sa phrase secrète (ou son code) et ses données reviennent,
comme sur WhatsApp.

Pour un développeur WinDev :
  - ce serveur ne reçoit que des OCTETS ILLISIBLES : le site chiffre tout (AES-256-GCM) avec la clé du « coffre » de l'utilisateur, la même que celle de ses
    archives, protégée par sa phrase secrète / son code (+ code de secours, + application d'authentification) ; la clé et la phrase ne quittent JAMAIS le téléphone.
    Ni auRor ni SAWALI ne peuvent lire une sauvegarde ;
  - une seule sauvegarde par utilisateur : la courante et la précédente (retour arrière si une sauvegarde est abîmée) ;
  - taille bornée, écritures espacées, connexion obligatoire ; la sauvegarde est effacée avec le compte (collection rattachée à `user_id`) ;
  - le mode choisi (« cloud » ou « local ») est gardé ici pour qu'un NOUVEAU téléphone sache qu'une sauvegarde existe.

Routes (utilisateur connecté) :
    GET    /api/sauvegarde/etat  → {mode, existe, maj_le, taille, versions}
    PUT    /api/sauvegarde/mode  {mode: cloud | local}
    PUT    /api/sauvegarde       {contenu, app}  → {maj_le, taille}   (mode « cloud » exigé)
    GET    /api/sauvegarde[?precedente=1] → {contenu, maj_le, taille}
    DELETE /api/sauvegarde       → efface les sauvegardes en ligne (le mode est remis à « local »)
"""
from __future__ import annotations

import base64
import binascii
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db import SANS_ID, db
from limiteur import limiter_appels_publics
from securite import get_current_user

TAILLE_MAX = 6_000_000          # caractères base64 (≈ 4,5 Mo de données chiffrées) : journal + carnet + lignes de SMS
TAILLE_MIN = 40                 # vecteur (12) + marque d'authentification (16) en octets, au moins
INTERVALLE_MIN_S = 20           # deux écritures de la même personne : 20 secondes au moins
VERSIONS_GARDEES = 2            # la courante et la précédente

router = APIRouter(prefix="/sauvegarde", tags=["Sauvegarde en ligne"])


class Mode(BaseModel):
    mode: str = Field(pattern="^(cloud|local)$")


class Sauvegarde(BaseModel):
    contenu: str = Field(min_length=TAILLE_MIN, max_length=TAILLE_MAX)
    app: str = Field("", max_length=16)           # version de l'application qui a fait la sauvegarde (aide à la restauration)


async def _doc(user: dict) -> Dict[str, Any]:
    return await db.sauvegardes.find_one({"user_id": user["id"]}, SANS_ID) or {"user_id": user["id"], "mode": None, "versions": []}


def _resume(d: Dict[str, Any]) -> Dict[str, Any]:
    v = d.get("versions") or []
    return {"mode": d.get("mode"), "existe": bool(v), "maj_le": v[0]["maj_le"] if v else None, "taille": v[0]["taille"] if v else 0, "versions": len(v)}


@router.get("/etat", dependencies=[Depends(limiter_appels_publics)])
async def etat(user: dict = Depends(get_current_user)):
    return _resume(await _doc(user))


@router.put("/mode", dependencies=[Depends(limiter_appels_publics)])
async def definir_mode(data: Mode, user: dict = Depends(get_current_user)):
    await db.sauvegardes.update_one({"user_id": user["id"]}, {"$set": {"mode": data.mode}, "$setOnInsert": {"versions": []}}, upsert=True)
    return _resume(await _doc(user))


@router.put("", dependencies=[Depends(limiter_appels_publics)])
async def enregistrer(data: Sauvegarde, user: dict = Depends(get_current_user)):
    d = await _doc(user)
    if d.get("mode") != "cloud":
        raise HTTPException(409, "La sauvegarde en ligne n'est pas activée pour ce compte.")
    try:
        octets = base64.b64decode(data.contenu, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "Sauvegarde illisible.")
    if len(octets) < 28:
        raise HTTPException(422, "Sauvegarde illisible.")
    maintenant = datetime.now(timezone.utc)
    v = d.get("versions") or []
    if v and v[0]["maj_le"] > (maintenant - timedelta(seconds=INTERVALLE_MIN_S)).isoformat():
        raise HTTPException(429, "Sauvegarde trop rapprochée : réessayez dans un instant.")
    nouvelle = {"contenu": data.contenu, "taille": len(octets), "maj_le": maintenant.isoformat(), "app": data.app}
    await db.sauvegardes.update_one({"user_id": user["id"]}, {"$set": {"versions": ([nouvelle] + v)[:VERSIONS_GARDEES]}})
    return {"maj_le": nouvelle["maj_le"], "taille": nouvelle["taille"]}


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def lire(precedente: bool = Query(False), user: dict = Depends(get_current_user)):
    v = (await _doc(user)).get("versions") or []
    i = 1 if precedente else 0
    if len(v) <= i:
        raise HTTPException(404, "Aucune sauvegarde en ligne.")
    return {"contenu": v[i]["contenu"], "maj_le": v[i]["maj_le"], "taille": v[i]["taille"], "app": v[i].get("app", "")}


@router.delete("", dependencies=[Depends(limiter_appels_publics)])
async def effacer(user: dict = Depends(get_current_user)):
    await db.sauvegardes.update_one({"user_id": user["id"]}, {"$set": {"versions": [], "mode": "local"}}, upsert=True)
    return {"ok": True}
