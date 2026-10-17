"""Annonces publicitaires de SAWALI affichées dans Paiement Mobile (lot 30).

Demande du propriétaire (17/10/2026) : afficher les bannières et le carrousel envoyés par la régie publicitaire
de SAWALI, en haut de l'écran Payer. Côté SAWALI : emplacement « Paiement Mobile » (lot 226).

En résumé (pour un développeur WinDev) :
  - le NAVIGATEUR ne parle jamais directement à SAWALI : il appelle CE serveur ;
  - la liste des annonces est lue chez SAWALI EN ARRIÈRE-PLAN (règle 7) et gardée en mémoire 60 s : la page
    reçoit tout de suite la dernière liste connue (vide au tout premier appel, puis remplie quelques secondes plus tard) ;
  - impressions et clics sont relayés à SAWALI en arrière-plan (jamais bloquants), sans doublon abusif :
    une impression par annonce, par utilisateur et par heure ; un clic par annonce, par utilisateur et par 10 minutes ;
  - l'adresse ouverte au clic est celle connue du serveur (jamais celle envoyée par le navigateur) ;
  - aucun secret : les routes publiques de SAWALI n'en demandent pas.

Routes (utilisateur connecté) :
    GET  /api/publicites                  → {annonces: [...], en_cours: bool}
    POST /api/publicites/{id}/impression  → {ok}
    POST /api/publicites/{id}/clic        → {ok, url}
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Set

import httpx
from fastapi import APIRouter, Depends, HTTPException

from config import get_settings
from limiteur import limiter_appels_publics
from securite import get_current_user

logger = logging.getLogger("paiement_mobile.publicites")

DUREE_CACHE = 60.0           # secondes : durée de vie de la liste gardée en mémoire
DELAI_SAWALI = 5.0           # secondes : délai réseau maximal d'un appel à SAWALI (en arrière-plan)
DELAI_IMPRESSION = 3600.0    # une impression par annonce, utilisateur et heure
DELAI_CLIC = 600.0           # un clic par annonce, utilisateur et 10 minutes
MAX_ANNONCES = 8

# Transport HTTP de remplacement (tests) : None en production
_transport: Optional[httpx.AsyncBaseTransport] = None

# Cache : liste des annonces, heure de la dernière lecture réussie (0 = jamais lue)
_annonces: List[Dict[str, Any]] = []
_lu_a: float = 0.0
_actualisation: Optional[asyncio.Task] = None
# Dernier relais par (utilisateur, annonce, type) : évite de gonfler les chiffres facturés
_derniers: Dict[tuple, float] = {}
_taches: Set[asyncio.Task] = set()

router = APIRouter(prefix="/publicites", tags=["Publicités SAWALI"])


def _base() -> str:
    return get_settings().sawali_url.rstrip("/")


def _absolue(adresse: str) -> str:
    """Adresse complète d'un média ou d'un lien d'annonce. SAWALI enregistre ses fichiers téléversés en adresse RELATIVE
    (« /api/files/<id> ») : lue telle quelle par ce site, elle pointerait vers Paiement Mobile (vidéo introuvable, clic sur une
    autre page de Paiement Mobile). Les adresses « /api/… » sont donc rattachées au serveur de SAWALI, les autres pages « /… » au
    site de SAWALI (même adresse sans « api. »)."""
    a = (adresse or "").strip()
    if a.startswith("//"):
        return "https:" + a
    if not a.startswith("/"):
        return a                                               # déjà complète (https://…) ou vide
    if a.startswith("/api/"):
        return _base() + a
    return _base().replace("://api.", "://", 1) + a


def _vue(b: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Champs d'une annonce utiles à l'affichage ; None si elle est inutilisable (pas d'image ni d'identifiant)."""
    if not b.get("id") or not b.get("image_url"):
        return None
    return {"id": str(b["id"]), "image": _absolue(b["image_url"]), "url": _absolue(b.get("target_url") or ""),
            "video": b.get("media_kind") == "video", "nom": b.get("name") or "", "annonceur": b.get("advertiser_name") or "",
            "variante": b.get("active_variant") if b.get("active_variant") in ("a", "b") else "a"}


async def actualiser() -> None:
    """Relit la liste chez SAWALI (jamais d'exception : en cas d'échec on garde l'ancienne liste)."""
    global _annonces, _lu_a
    try:
        async with httpx.AsyncClient(timeout=DELAI_SAWALI, transport=_transport) as client:
            r = await client.get(f"{_base()}/api/public/ad-banners/liste",
                                 params={"placement": "paiementmobile", "limite": MAX_ANNONCES})
        if r.status_code != 200:
            logger.warning("Liste des annonces refusée par SAWALI (HTTP %s)", r.status_code)
            return
        vues = [v for v in (_vue(b) for b in (r.json().get("banners") or [])) if v]
        _annonces, _lu_a = vues[:MAX_ANNONCES], time.monotonic()
    except Exception as exc:  # noqa: BLE001 — une annonce manquante ne doit jamais gêner le paiement
        logger.warning("Liste des annonces non lue (%s)", type(exc).__name__)


def lancer_actualisation() -> None:
    """Démarre la relecture en arrière-plan si la liste est périmée et qu'aucune relecture n'est en cours."""
    global _actualisation
    if _actualisation and not _actualisation.done():
        return
    if _lu_a and time.monotonic() - _lu_a < DUREE_CACHE:
        return
    _actualisation = asyncio.get_running_loop().create_task(actualiser())


def vider_cache() -> None:
    """Remet la mémoire à zéro (tests)."""
    global _annonces, _lu_a, _actualisation
    _annonces, _lu_a, _actualisation = [], 0.0, None
    _derniers.clear()


async def _relayer(identifiant: str, type_evenement: str, variante: str) -> None:
    """Compte l'impression ou le clic chez SAWALI (arrière-plan ; erreurs ignorées)."""
    try:
        async with httpx.AsyncClient(timeout=DELAI_SAWALI, transport=_transport) as client:
            await client.post(f"{_base()}/api/public/ad-banners/{identifiant}/{type_evenement}", params={"variant": variante})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Relais %s non transmis à SAWALI (%s)", type_evenement, type(exc).__name__)


def _annonce(identifiant: str) -> Dict[str, Any]:
    trouvee = next((a for a in _annonces if a["id"] == identifiant), None)
    if not trouvee:
        raise HTTPException(404, "Annonce introuvable")
    return trouvee


def _a_relayer(user: dict, identifiant: str, type_evenement: str, delai: float) -> bool:
    """Vrai si le dernier relais identique date de plus de `delai` secondes (et le note)."""
    cle, maintenant = (user["id"], identifiant, type_evenement), time.monotonic()
    if maintenant - _derniers.get(cle, -delai) < delai:
        return False
    if len(_derniers) > 20_000:
        _derniers.clear()
    _derniers[cle] = maintenant
    return True


def _en_arriere_plan(coro) -> None:
    tache = asyncio.get_running_loop().create_task(coro)
    _taches.add(tache)
    tache.add_done_callback(_taches.discard)


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def lister(user: dict = Depends(get_current_user)):
    """Dernière liste connue, tout de suite ; `en_cours` vrai tant qu'elle n'a jamais été lue (le site réessaie)."""
    lancer_actualisation()
    return {"annonces": _annonces, "en_cours": not _lu_a}


@router.post("/{identifiant}/impression", dependencies=[Depends(limiter_appels_publics)])
async def impression(identifiant: str, user: dict = Depends(get_current_user)):
    annonce = _annonce(identifiant)
    if _a_relayer(user, identifiant, "impression", DELAI_IMPRESSION):
        _en_arriere_plan(_relayer(identifiant, "impression", annonce["variante"]))
    return {"ok": True}


@router.post("/{identifiant}/clic", dependencies=[Depends(limiter_appels_publics)])
async def clic(identifiant: str, user: dict = Depends(get_current_user)):
    annonce = _annonce(identifiant)
    if _a_relayer(user, identifiant, "click", DELAI_CLIC):
        _en_arriere_plan(_relayer(identifiant, "click", annonce["variante"]))
    return {"ok": True, "url": annonce["url"]}
