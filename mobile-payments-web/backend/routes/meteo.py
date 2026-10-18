"""Météo dans auRor (lot 36), lue chez SAWALI (météo déjà disponible : Open-Meteo, cache 10 min).

Pour un développeur WinDev :
  - le NAVIGATEUR ne parle jamais à SAWALI : il appelle CE serveur ;
  - règle 7 : la requête de la page n'attend JAMAIS SAWALI. Si la valeur est en mémoire (10 min), elle est
    renvoyée aussitôt ; sinon la lecture part en ARRIÈRE-PLAN et la réponse est « en_cours » : la page
    redemande 1,5 s plus tard ;
  - une ville introuvable est mémorisée aussi (pas de réessai inutile).

Routes (utilisateur connecté) :
    GET /api/meteo/ville?q=Bobo-Dioulasso      → {ville: {nom, lat, lon, pays, region}} | {en_cours} | 404
    GET /api/meteo?lat=12.37&lon=-1.52         → {meteo: {...}} | {en_cours} | {indisponible}
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional, Set

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from config import get_settings
from limiteur import limiter_appels_publics
from securite import get_current_user

logger = logging.getLogger("paiement_mobile.meteo")

DUREE_CACHE = 600.0     # 10 minutes (comme chez SAWALI)
DELAI_SAWALI = 8.0

_transport: Optional[httpx.AsyncBaseTransport] = None
_cache: Dict[str, tuple] = {}          # clé → (heure de lecture, valeur)
_en_vol: Set[str] = set()              # lectures en cours
_taches: Set[asyncio.Task] = set()

router = APIRouter(prefix="/meteo", tags=["Météo"])


def vider_cache() -> None:
    _cache.clear()
    _en_vol.clear()


def _lu(cle: str) -> Optional[Any]:
    """Valeur en mémoire si elle a moins de 10 minutes, sinon None."""
    e = _cache.get(cle)
    return e[1] if e and time.monotonic() - e[0] < DUREE_CACHE else None


async def _lire(cle: str, chemin: str, params: Dict[str, Any]) -> None:
    """Lecture chez SAWALI (arrière-plan) ; le résultat est mémorisé, jamais d'exception."""
    try:
        base = get_settings().sawali_url.rstrip("/")
        async with httpx.AsyncClient(timeout=DELAI_SAWALI, transport=_transport) as client:
            r = await client.get(f"{base}/api/public/weather/{chemin}", params=params)
        if r.status_code == 404:
            _cache[cle] = (time.monotonic(), {"introuvable": True})
        elif r.status_code == 200:
            _cache[cle] = (time.monotonic(), r.json())
        else:
            logger.warning("Météo refusée par SAWALI (HTTP %s)", r.status_code)
    except Exception as exc:  # noqa: BLE001 — une météo manquante ne doit rien gêner
        logger.warning("Météo non lue (%s)", type(exc).__name__)
    finally:
        _en_vol.discard(cle)


def _demander(cle: str, chemin: str, params: Dict[str, Any]) -> Optional[Any]:
    """Valeur connue, ou None après avoir lancé la lecture en arrière-plan (une seule à la fois par clé)."""
    valeur = _lu(cle)
    if valeur is not None:
        return valeur
    if cle not in _en_vol:
        _en_vol.add(cle)
        tache = asyncio.get_running_loop().create_task(_lire(cle, chemin, params))
        _taches.add(tache)
        tache.add_done_callback(_taches.discard)
    return None


@router.get("/ville", dependencies=[Depends(limiter_appels_publics)])
async def ville(q: str = Query(..., min_length=2, max_length=80), _: dict = Depends(get_current_user)):
    texte = q.strip()
    v = _demander(f"ville:{texte.lower()}", "geocode", {"q": texte})
    if v is None:
        return {"en_cours": True}
    if v.get("introuvable"):
        raise HTTPException(404, "Ville introuvable")
    return {"ville": {"nom": v.get("name"), "lat": v.get("lat"), "lon": v.get("lon"),
                      "pays": v.get("country_name"), "region": v.get("admin1")}}


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def meteo(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
                _: dict = Depends(get_current_user)):
    m = _demander(f"meteo:{round(lat, 2)}:{round(lon, 2)}", "current", {"lat": lat, "lon": lon})
    if m is None:
        return {"en_cours": True}
    if m.get("available") is False or m.get("temperature") is None:
        return {"indisponible": True}
    return {"meteo": {"temperature": m.get("temperature"), "ressenti": m.get("feels_like"),
                      "humidite": m.get("humidity_pct"), "vent_kmh": m.get("wind_kmh"), "jour": bool(m.get("is_day", True)),
                      "libelle": m.get("label_fr"), "icone": m.get("icon"), "mis_a_jour": m.get("fetched_at")}}
