"""Modération : liste des signalements pour le SUPER-ADMINISTRATEUR (messages à Liluvine hors du cadre légal ou des règles du service).
Chaque signalement porte la catégorie, la date et le compte ; jamais le texte du message (voir moderation.py)."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

import moderation
from db import SANS_ID, db
from securite import require_admin

router = APIRouter(prefix="/moderation", tags=["Modération"], dependencies=[Depends(require_admin)])


@router.get("")
async def liste() -> Dict[str, Any]:
    """Derniers signalements (les non traités d'abord), totaux par catégorie, et nombre de signalements à traiter."""
    lignes = await db.moderation.find({}, SANS_ID).sort("cree_le", -1).to_list(300)
    lignes.sort(key=lambda s: s.get("traite", False))                 # tri stable : les non traités en premier, chacun du plus récent au plus ancien
    par_categorie: Dict[str, int] = {}
    for s in lignes:
        par_categorie[s["categorie"]] = par_categorie.get(s["categorie"], 0) + 1
    return {"signalements": [{**s, "libelle": moderation.CATEGORIES.get(s["categorie"], s["categorie"])} for s in lignes],
            "par_categorie": par_categorie, "a_traiter": sum(1 for s in lignes if not s.get("traite"))}


@router.post("/{signalement_id}/traiter")
async def traiter(signalement_id: str) -> Dict[str, Any]:
    """Marque un signalement comme examiné (l'administrateur a décidé ; rien n'est sanctionné automatiquement)."""
    res = await db.moderation.update_one({"id": signalement_id}, {"$set": {"traite": True}})
    if not res.matched_count:
        raise HTTPException(404, "Signalement introuvable")
    return {"ok": True}
