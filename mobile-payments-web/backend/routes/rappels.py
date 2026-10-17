"""Résumé des rappels du jour (lot 36) : pastilles du menu latéral.

    GET /api/rappels/resume → {anniversaires, paiements, medicaments, total, evenements: [...]}
Les comptes et les événements sont lus EN PARALLÈLE (règle 7). Chaque nombre = ce qui demande une action maintenant.
`evenements` (lot 40) : ce qui doit déclencher un SON et une notification dans le navigateur ouvert ; chaque événement a une `cle`
unique (le navigateur n'alerte qu'une fois par clé et par jour) : {cle, type, titre, texte, lien}.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from routes import anniversaires, rappels_medicaments, rappels_paiements
from securite import get_current_user

router = APIRouter(prefix="/rappels", tags=["Rappels"])


@router.get("/resume")
async def resume(user: dict = Depends(get_current_user)):
    uid = user["id"]
    ann, pai, med, e_ann, e_pai, e_med = await asyncio.gather(
        anniversaires.a_souhaiter(uid), rappels_paiements.a_traiter(uid), rappels_medicaments.a_prendre(uid),
        anniversaires.evenements(uid), rappels_paiements.evenements(uid), rappels_medicaments.evenements(uid))
    # Les prises (urgentes) d'abord, puis les paiements, puis les anniversaires
    return {"anniversaires": ann, "paiements": pai, "medicaments": med, "total": ann + pai + med, "evenements": e_med + e_pai + e_ann}
