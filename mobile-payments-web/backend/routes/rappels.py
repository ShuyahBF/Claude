"""Résumé des rappels du jour (lot 36) : pastilles du menu latéral.

    GET /api/rappels/resume → {anniversaires, paiements, medicaments, meteo: 0, total}
Les trois comptes sont lus EN PARALLÈLE (règle 7) ; chaque nombre = ce qui demande une action maintenant.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from routes import anniversaires, rappels_medicaments, rappels_paiements
from securite import get_current_user

router = APIRouter(prefix="/rappels", tags=["Rappels"])


@router.get("/resume")
async def resume(user: dict = Depends(get_current_user)):
    ann, pai, med = await asyncio.gather(anniversaires.a_souhaiter(user["id"]), rappels_paiements.a_traiter(user["id"]),
                                         rappels_medicaments.a_prendre(user["id"]))
    return {"anniversaires": ann, "paiements": pai, "medicaments": med, "total": ann + pai + med}
