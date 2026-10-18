"""Notifications push (lot 41) : abonnement des appareils et boucle d'envoi, application fermée.

Pour un développeur WinDev :
  - chaque appareil qui active les notifications s'ABONNE (adresse du service de notification + clés de chiffrement) :
    une ligne « AbonnementPush » par appareil (5 appareils au plus par utilisateur) ;
  - une BOUCLE d'arrière-plan passe toutes les minutes : pour chaque utilisateur abonné, elle calcule les événements du moment
    (prise de médicament à l'heure, paiement à régler, anniversaire — mêmes règles que les alertes de l'écran) et envoie une
    notification pour chacun, UNE seule fois par clé et par jour (table « PushEnvoye ») ;
  - un appareil désabonné (le service répond 404/410) est supprimé automatiquement ;
  - aucun envoi en tâche de requête : tout part en arrière-plan (règle 7).

Routes (utilisateur connecté) :
    GET    /api/push/cle        → {cle_publique} (clé VAPID publique, pour s'abonner dans le navigateur)
    POST   /api/push/abonner    {endpoint, keys: {p256dh, auth}}
    POST   /api/push/desabonner {endpoint}
    POST   /api/push/test       → envoie une notification d'essai à MES appareils
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import push_web
from db import SANS_ID, db
from limiteur import limiter_appels_publics
from routes import rappels
from securite import get_current_user

logger = logging.getLogger("paiement_mobile.push")
MAX_APPAREILS = 5
INTERVALLE = 60            # secondes entre deux passages
SIMULTANES = 8             # utilisateurs traités en parallèle

router = APIRouter(prefix="/push", tags=["Notifications push"])


class Cles(BaseModel):
    p256dh: str = Field(min_length=80, max_length=120)
    auth: str = Field(min_length=16, max_length=40)


class Abonnement(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000, pattern=r"^https://")
    keys: Cles


class Desabonnement(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000)


@router.get("/cle", dependencies=[Depends(limiter_appels_publics)])
async def cle(_: dict = Depends(get_current_user)):
    _, publique = await push_web.cles_vapid()
    return {"cle_publique": publique}


@router.post("/abonner", dependencies=[Depends(limiter_appels_publics)])
async def abonner(data: Abonnement, user: dict = Depends(get_current_user)):
    maintenant = datetime.now(timezone.utc).isoformat()
    # Un même appareil (même adresse) change de compte : l'ancienne ligne est reprise par l'utilisateur courant
    await db.push_abonnements.update_one({"endpoint": data.endpoint}, {"$set": {
        "endpoint": data.endpoint, "p256dh": data.keys.p256dh, "auth": data.keys.auth, "user_id": user["id"], "maj_le": maintenant}}, upsert=True)
    # 5 appareils au plus par utilisateur : les plus anciens sont retirés
    lignes = await db.push_abonnements.find({"user_id": user["id"]}, SANS_ID).sort("maj_le", -1).to_list(50)
    for vieille in lignes[MAX_APPAREILS:]:
        await db.push_abonnements.delete_one({"endpoint": vieille["endpoint"]})
    return {"ok": True, "appareils": min(len(lignes), MAX_APPAREILS)}


@router.post("/desabonner", dependencies=[Depends(limiter_appels_publics)])
async def desabonner(data: Desabonnement, user: dict = Depends(get_current_user)):
    await db.push_abonnements.delete_one({"endpoint": data.endpoint, "user_id": user["id"]})   # seulement SES appareils
    return {"ok": True}


async def envoyer_a_utilisateur(user_id: str, message: Dict[str, Any]) -> int:
    """Envoie `message` à tous les appareils de l'utilisateur ; renvoie le nombre d'envois réussis. Supprime les appareils morts."""
    ok = 0
    for ab in await db.push_abonnements.find({"user_id": user_id}, SANS_ID).to_list(MAX_APPAREILS + 5):
        try:
            await push_web.envoyer(ab, message)
            ok += 1
        except push_web.AbonnementMort:
            await db.push_abonnements.delete_one({"endpoint": ab["endpoint"]})
        except Exception as exc:  # noqa: BLE001 — panne passagère : on réessaiera à la prochaine occasion
            logger.warning("Push non envoyé (%s)", type(exc).__name__)
    return ok


@router.post("/test", dependencies=[Depends(limiter_appels_publics)])
async def tester(user: dict = Depends(get_current_user)):
    envoyes = await envoyer_a_utilisateur(user["id"], {"titre": "🔔 auRor", "texte": "Les notifications fonctionnent sur cet appareil.",
                                                        "lien": "/profil", "cle": f"test:{datetime.now(timezone.utc).timestamp()}"})
    if not envoyes:
        raise HTTPException(409, "Aucun appareil joignable : activez d'abord les notifications sur cet appareil.")
    return {"ok": True, "envoyes": envoyes}


# ---------------------------------------------------------------------------
# Boucle d'envoi (arrière-plan)
# ---------------------------------------------------------------------------
async def _traiter_utilisateur(user_id: str, jour: str) -> int:
    envoyes = 0
    for e in await rappels.evenements_utilisateur(user_id):
        # « Premier arrivé » : la ligne (utilisateur, clé) est posée AVANT l'envoi ; si elle existe déjà, on ne renvoie pas
        r = await db.push_envoyes.update_one({"user_id": user_id, "cle": e["cle"], "jour": jour},
                                             {"$setOnInsert": {"user_id": user_id, "cle": e["cle"], "jour": jour}}, upsert=True)
        if r.upserted_id is None:
            continue
        if await envoyer_a_utilisateur(user_id, {"titre": e["titre"], "texte": e["texte"], "lien": e["lien"], "cle": e["cle"]}):
            envoyes += 1
    return envoyes


async def passer_une_fois() -> int:
    """Un passage : événements nouveaux de tous les utilisateurs abonnés. Renvoie le nombre de notifications envoyées."""
    jour = datetime.now(timezone.utc).date().isoformat()
    await db.push_envoyes.delete_many({"jour": {"$ne": jour}})        # ménage : on ne garde que le jour courant
    utilisateurs: List[str] = await db.push_abonnements.distinct("user_id")
    file = asyncio.Semaphore(SIMULTANES)

    async def un(uid: str) -> int:
        async with file:
            try:
                return await _traiter_utilisateur(uid, jour)
            except Exception:  # noqa: BLE001 — un utilisateur en échec ne bloque pas les autres
                logger.exception("Passage push en échec pour un utilisateur")
                return 0

    return sum(await asyncio.gather(*(un(u) for u in utilisateurs)))


async def boucle_push() -> None:
    """Passe toutes les minutes, sans jamais s'arrêter."""
    while True:
        try:
            await passer_une_fois()
        except Exception:  # noqa: BLE001
            logger.exception("Passage push en échec")
        await asyncio.sleep(INTERVALLE)
