"""Synchronisation EN TEMPS RÉEL entre les appareils d'un même compte (lot 223) : flux de changements chiffrés.

Pour un développeur WinDev : chaque appareil envoie les CHANGEMENTS de ses données (une fiche créée, modifiée ou supprimée = un changement) sous forme d'octets
chiffrés (AES-256-GCM, clé du coffre de l'utilisateur : le serveur ne lit JAMAIS rien) ; le serveur les range dans l'ordre (numéro de séquence) et les redistribue
aux autres appareils, qui les rejouent sur leurs propres données (règle : le plus récent l'emporte, fiche par fiche). La sauvegarde en ligne chiffrée existante
reste le « cliché » de départ d'un appareil neuf ; le flux ne remplace pas la sauvegarde, il maintient les appareils d'accord entre deux sauvegardes.

Routes (utilisateur connecté) :
    POST /api/flux                         {appareil, changements:[contenu base64…]} → {seq}      envoie des changements (100 au plus par appel)
    GET  /api/flux?apres=N[&attente=S]     → {changements:[{seq, appareil, contenu}], seq, reinitialiser}
         « attente » : le serveur attend jusqu'à S secondes (25 au plus) un nouveau changement avant de répondre : la livraison est quasi instantanée
         « reinitialiser » : vrai si des changements plus anciens que « apres » ont été purgés : l'appareil doit d'abord relire la sauvegarde en ligne.
    GET  /api/flux/etat                    → {seq, nombre}
    DELETE /api/flux                       efface le flux de ce compte (désactivation)
Bornes : 200 Ko par changement, 5000 changements gardés par compte (les plus anciens sont purgés), écritures limitées par adresse IP.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db import SANS_ID, db
from limiteur import limiter_appels_publics
from securite import get_current_user

TAILLE_CHANGEMENT_MAX = 270_000        # caractères base64 (≈ 200 Ko chiffrés) par changement
CHANGEMENTS_PAR_APPEL = 100
CHANGEMENTS_GARDES = 5000
LECTURE_MAX = 200
ATTENTE_MAX_S = 25
PAS_ATTENTE_S = 1.0

router = APIRouter(prefix="/flux", tags=["Synchronisation en temps réel"])


# Modèle au NIVEAU DU MODULE : FastAPI ne retrouve pas les modèles déclarés dans une fonction
class Envoi(BaseModel):
    appareil: str = Field(min_length=8, max_length=64, pattern="^[0-9a-fA-F-]+$")    # identifiant ALÉATOIRE de l'installation (rien de personnel)
    changements: List[str] = Field(min_length=1, max_length=CHANGEMENTS_PAR_APPEL)


def _octets_valides(contenu: str) -> bool:
    try:
        return len(base64.b64decode(contenu, validate=True)) >= 28 and len(contenu) <= TAILLE_CHANGEMENT_MAX
    except (binascii.Error, ValueError):
        return False


async def _seq_courante(user_id: str) -> int:
    d = await db.sauvegardes.find_one({"user_id": user_id}, {"_id": 0, "flux_seq": 1}) or {}
    return int(d.get("flux_seq") or 0)


async def _plus_ancienne(user_id: str) -> int:
    """Plus petit numéro encore gardé (0 si aucun changement)."""
    ligne = await db.flux.find({"user_id": user_id}, {"_id": 0, "seq": 1}).sort("seq", 1).limit(1).to_list(1)
    return int(ligne[0]["seq"]) if ligne else 0


@router.post("", dependencies=[Depends(limiter_appels_publics)])
async def envoyer(data: Envoi, user: dict = Depends(get_current_user)):
    for c in data.changements:
        if not _octets_valides(c):
            raise HTTPException(422, "Changement illisible ou trop gros.")
    n = len(data.changements)
    # Numéros réservés d'un coup, atomiquement (deux appareils qui envoient en même temps ne se marchent pas dessus)
    doc = await db.sauvegardes.find_one_and_update({"user_id": user["id"]}, {"$inc": {"flux_seq": n}, "$setOnInsert": {"mode": None, "versions": []}},
                                                   upsert=True, return_document=True, projection={"_id": 0, "flux_seq": 1})
    fin = int(doc["flux_seq"])
    debut = fin - n + 1
    maintenant = datetime.now(timezone.utc).isoformat()
    await db.flux.insert_many([{"user_id": user["id"], "seq": debut + i, "appareil": data.appareil, "contenu": c, "cree_le": maintenant}
                               for i, c in enumerate(data.changements)])
    # Purge : on ne garde que les derniers changements (un appareil resté absent trop longtemps repart de la sauvegarde en ligne)
    if fin > CHANGEMENTS_GARDES:
        await db.flux.delete_many({"user_id": user["id"], "seq": {"$lte": fin - CHANGEMENTS_GARDES}})
    return {"seq": fin}


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def lire(apres: int = Query(0, ge=0), attente: int = Query(0, ge=0, le=ATTENTE_MAX_S), user: dict = Depends(get_current_user)):
    debut = time.monotonic()
    while True:
        lignes = await db.flux.find({"user_id": user["id"], "seq": {"$gt": apres}}, SANS_ID).sort("seq", 1).limit(LECTURE_MAX).to_list(LECTURE_MAX)
        if lignes or attente <= 0 or time.monotonic() - debut >= attente:
            break
        await asyncio.sleep(PAS_ATTENTE_S)               # attente longue : livraison quasi instantanée sans que le téléphone interroge sans cesse
    seq = await _seq_courante(user["id"])
    ancien = await _plus_ancienne(user["id"])
    # Des changements entre « apres » et le plus ancien gardé ont été purgés : cet appareil ne peut plus se tenir à jour avec le seul flux
    reinitialiser = bool(seq > 0 and apres < (ancien - 1 if ancien else seq))
    return {"changements": [{"seq": l["seq"], "appareil": l["appareil"], "contenu": l["contenu"]} for l in lignes], "seq": seq, "reinitialiser": reinitialiser}


@router.get("/etat", dependencies=[Depends(limiter_appels_publics)])
async def etat(user: dict = Depends(get_current_user)):
    return {"seq": await _seq_courante(user["id"]), "nombre": await db.flux.count_documents({"user_id": user["id"]})}


@router.delete("", dependencies=[Depends(limiter_appels_publics)])
async def effacer(user: dict = Depends(get_current_user)):
    await db.flux.delete_many({"user_id": user["id"]})
    return {"ok": True}
