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
