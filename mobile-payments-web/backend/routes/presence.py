"""Visites du site par des personnes NON connectées (lot 13, alerte WhatsApp du propriétaire).

Le site appelle POST /api/presence/visite au chargement, au plus une fois toutes
les 30 minutes par navigateur, et seulement si personne n'est connecté. Le serveur
transmet alors un signal « visite » à SAWALI (en arrière-plan, jamais bloquant).

Route publique : limitée par adresse IP (limiteur.py) ; les robots évidents
(moteurs de recherche, aperçus de liens) ne sont jamais signalés.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

import signal_connexion
from limiteur import limiter_appels_publics

router = APIRouter(prefix="/presence", tags=["Présence"])


class Visite(BaseModel):
    # Identifiant aléatoire tiré par le navigateur (localStorage) : aucune donnée personnelle
    visiteur: str = Field(min_length=4, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    # Page ouverte (sans le « ?… », retiré aussi côté serveur)
    page: Optional[str] = Field(default=None, max_length=200)


@router.post("/visite", dependencies=[Depends(limiter_appels_publics)])
async def visite(data: Visite, request: Request):
    """Toujours { ok: true } : la réponse ne dit jamais si le signal est parti (rien à exploiter)."""
    if not signal_connexion.est_robot(request.headers.get("user-agent")):
        signal_connexion.signaler("visite", request, visiteur=data.visiteur, page=data.page)
    return {"ok": True}
