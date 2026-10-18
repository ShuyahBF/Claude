"""Pharmacies de garde dans auRor (lot 43) : affiche le contenu de sawalismartsystems.com/garde.

Pour un développeur WinDev :
  - le NAVIGATEUR ne parle jamais à SAWALI : il appelle CE serveur ;
  - règle 7 : la requête de la page n'attend JAMAIS SAWALI. Liste en mémoire (5 min) → renvoyée aussitôt ;
    sinon la lecture part en ARRIÈRE-PLAN et la réponse est « en_cours » (la page redemande 1,5 s plus tard) ;
  - AFFICHER la liste est libre ; RECHERCHER (filtre par nom, quartier, ville) est limité à 10 par jour et par
    utilisateur (compteur « garde_recherches », une ligne par utilisateur et par jour, jour en UTC = heure du Burkina).

Routes (utilisateur connecté) :
    GET  /api/garde                  → liste complète de la semaine {garde:{...}, recherches_restantes} | {en_cours}
    POST /api/garde/recherche {q}    → liste filtrée + recherches_restantes ; 429 au-delà de 10 par jour
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from db import db
from limiteur import limiter_appels_publics
from securite import get_current_user

logger = logging.getLogger("paiement_mobile.garde")

RECHERCHES_PAR_JOUR = 10
DUREE_CACHE = 300.0      # 5 minutes
DELAI_SAWALI = 8.0

_transport: Optional[httpx.AsyncBaseTransport] = None
_cache: Dict[str, tuple] = {}
_en_vol: Set[str] = set()
_taches: Set[asyncio.Task] = set()

router = APIRouter(prefix="/garde", tags=["Pharmacies de garde"])


def vider_cache() -> None:
    _cache.clear()
    _en_vol.clear()


async def _lire() -> None:
    """Lecture de la liste chez SAWALI (arrière-plan) ; jamais d'exception."""
    try:
        base = get_settings().sawali_url.rstrip("/")
        async with httpx.AsyncClient(timeout=DELAI_SAWALI, transport=_transport) as client:
            r = await client.get(f"{base}/api/public/officines/garde/current")
        if r.status_code == 200:
            _cache["garde"] = (time.monotonic(), r.json())
        else:
            logger.warning("Liste de garde refusée par SAWALI (HTTP %s)", r.status_code)
    except Exception as exc:  # noqa: BLE001 — une liste manquante ne doit rien gêner
        logger.warning("Liste de garde non lue (%s)", type(exc).__name__)
    finally:
        _en_vol.discard("garde")


def _liste() -> Optional[Dict[str, Any]]:
    """Liste en mémoire si elle a moins de 5 minutes ; sinon lance la lecture et renvoie None.
    Si une ancienne liste existe, elle reste affichée pendant l'actualisation."""
    e = _cache.get("garde")
    if e and time.monotonic() - e[0] < DUREE_CACHE:
        return e[1]
    if "garde" not in _en_vol:
        _en_vol.add("garde")
        t = asyncio.get_running_loop().create_task(_lire())
        _taches.add(t)
        t.add_done_callback(_taches.discard)
    return e[1] if e else None


def _jour() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _deja_faites(uid: str) -> int:
    ligne = await db.garde_recherches.find_one({"user_id": uid, "jour": _jour()})
    return int(ligne["n"]) if ligne else 0


def _contient(o: Dict[str, Any], q: str) -> bool:
    champs = ("name", "intitule", "address", "city", "location_hint")
    return any(q in (o.get(c) or "").lower() for c in champs)


def _public(d: Dict[str, Any], q: str = "") -> Dict[str, Any]:
    """Contenu de la page /garde (avec filtre éventuel sur les deux listes)."""
    def filtre(liste):
        return [o for o in (liste or []) if not q or _contient(o, q)]
    return {"ok": d.get("ok", False), "semaine": d.get("week_number"), "groupe": d.get("groupe_garde"),
            "du": d.get("monday"), "au": d.get("sunday"), "entete": d.get("cms_header") or "",
            "pied": d.get("cms_footer") or "", "raison": d.get("reason"),
            "officines": filtre(d.get("officines")), "appui": filtre(d.get("assist_officines"))}


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def liste(user: dict = Depends(get_current_user)):
    d = _liste()
    if d is None:
        return {"en_cours": True}
    faites = await _deja_faites(user["id"])
    return {"garde": _public(d), "recherches_restantes": max(0, RECHERCHES_PAR_JOUR - faites)}


class Recherche(BaseModel):
    q: str = Field(min_length=2, max_length=60)


# Pas de limiteur par minute ici : la recherche exige une connexion et est déjà plafonnée à 10 par jour
@router.post("/recherche")
async def rechercher(corps: Recherche, user: dict = Depends(get_current_user)):
    d = _liste()
    if d is None:
        return {"en_cours": True}      # rien n'est décompté tant que la liste n'est pas là
    # Décompte atomique : +1 puis contrôle (deux clics simultanés ne dépassent jamais la limite)
    ligne = await db.garde_recherches.find_one_and_update(
        {"user_id": user["id"], "jour": _jour()}, {"$inc": {"n": 1}}, upsert=True, return_document=True)
    n = int(ligne["n"])
    if n > RECHERCHES_PAR_JOUR:
        await db.garde_recherches.update_one({"user_id": user["id"], "jour": _jour()}, {"$set": {"n": RECHERCHES_PAR_JOUR}})
        raise HTTPException(429, f"Limite atteinte : {RECHERCHES_PAR_JOUR} recherches de pharmacies de garde par jour. Réessayez demain.")
    return {"garde": _public(d, corps.q.strip().lower()), "recherches_restantes": RECHERCHES_PAR_JOUR - n}
