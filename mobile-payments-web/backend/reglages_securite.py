"""Réglage de sécurité fixé par l'administrateur (lot 46) : durée d'inactivité avant fermeture de la session.

Pour un développeur WinDev : un seul réglage, gardé en base (collection « reglages_plateforme », document « inactivite »),
modifiable depuis Admin → Comptes (liste déroulante, aucune manipulation technique). Le serveur le relit au plus toutes les 30 s.
Le site de l'utilisateur lit la même valeur (GET /api/auth/inactivite) pour sa minuterie et son avertissement.
"""
from __future__ import annotations

import time
from typing import Tuple

from db import db

# Durées proposées (secondes) : pas de « jamais » — un téléphone laissé aux enfants ne doit pas rester ouvert
CHOIX_SECONDES: Tuple[int, ...] = (60, 120, 180, 300, 600, 900, 1800)
DEFAUT_SECONDES = 180          # 3 minutes
AVERTISSEMENT_SECONDES = 30    # compte à rebours « Rester connecté » avant la fermeture
DUREE_CACHE = 30.0

_cache = {"valeur": DEFAUT_SECONDES, "lu_le": 0.0}


async def secondes_inactivite() -> int:
    if time.monotonic() - _cache["lu_le"] > DUREE_CACHE:
        doc = await db.reglages_plateforme.find_one({"_id": "inactivite"}) or {}
        v = int(doc.get("secondes") or DEFAUT_SECONDES)
        _cache.update(valeur=v if v in CHOIX_SECONDES else DEFAUT_SECONDES, lu_le=time.monotonic())
    return _cache["valeur"]


async def definir_secondes_inactivite(secondes: int) -> int:
    await db.reglages_plateforme.update_one({"_id": "inactivite"}, {"$set": {"secondes": secondes}}, upsert=True)
    _cache.update(valeur=secondes, lu_le=time.monotonic())
    return secondes


def vider_cache() -> None:
    _cache.update(valeur=DEFAUT_SECONDES, lu_le=0.0)


# ---------------------------------------------------------------------------
# Verrou de l'écran (lot 64) : après combien de secondes passées HORS de la page (autre onglet, autre application, écran éteint)
# le mot de passe du compte est redemandé pour retirer le flou. 0 = toujours (dès le moindre départ de la page).
# Retour plus rapide que ce délai : simple retrait du flou, sans mot de passe (appel, notification…).
# ---------------------------------------------------------------------------
CHOIX_VERROU: Tuple[int, ...] = (0, 10, 30, 60, 120, 300)
DEFAUT_VERROU = 30
_cache_verrou = {"valeur": DEFAUT_VERROU, "lu_le": 0.0}


async def secondes_verrou() -> int:
    if time.monotonic() - _cache_verrou["lu_le"] > DUREE_CACHE:
        doc = await db.reglages_plateforme.find_one({"_id": "verrou"}) or {}
        v = doc.get("secondes")
        _cache_verrou.update(valeur=v if v in CHOIX_VERROU else DEFAUT_VERROU, lu_le=time.monotonic())
    return _cache_verrou["valeur"]


async def definir_secondes_verrou(secondes: int) -> int:
    await db.reglages_plateforme.update_one({"_id": "verrou"}, {"$set": {"secondes": secondes}}, upsert=True)
    _cache_verrou.update(valeur=secondes, lu_le=time.monotonic())
    return secondes


def vider_cache_verrou() -> None:
    _cache_verrou.update(valeur=DEFAUT_VERROU, lu_le=0.0)


# ---------------------------------------------------------------------------
# Rayon de recherche des marchands (lot 102) : avec la géolocalisation des paiements, l'utilisateur voit la liste de TOUS les marchands
# connus dans ce rayon autour de lui (liste déroulante réservée à l'administrateur, Admin → Comptes). 50 m par défaut.
# ---------------------------------------------------------------------------
CHOIX_RAYON_MARCHANDS: Tuple[int, ...] = (20, 30, 50, 75, 100, 150, 200)
DEFAUT_RAYON_MARCHANDS = 50
_cache_rayon = {"valeur": DEFAUT_RAYON_MARCHANDS, "lu_le": 0.0}


async def metres_rayon_marchands() -> int:
    """Rayon (en mètres) de la liste des marchands proches ; relu au plus toutes les 30 s."""
    if time.monotonic() - _cache_rayon["lu_le"] > DUREE_CACHE:
        doc = await db.reglages_plateforme.find_one({"_id": "rayon_marchands"}) or {}
        v = doc.get("metres")
        _cache_rayon.update(valeur=v if v in CHOIX_RAYON_MARCHANDS else DEFAUT_RAYON_MARCHANDS, lu_le=time.monotonic())
    return _cache_rayon["valeur"]


async def definir_metres_rayon_marchands(metres: int) -> int:
    await db.reglages_plateforme.update_one({"_id": "rayon_marchands"}, {"$set": {"metres": metres}}, upsert=True)
    _cache_rayon.update(valeur=metres, lu_le=time.monotonic())
    return metres


def vider_cache_rayon() -> None:
    _cache_rayon.update(valeur=DEFAUT_RAYON_MARCHANDS, lu_le=0.0)
