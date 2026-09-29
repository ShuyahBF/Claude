"""Annuaire des codes marchands (partagé entre utilisateurs, comme dans l'app
Android) : un code numérique par opérateur, avec l'intitulé choisi par le
premier utilisateur qui l'a rencontré."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user

router = APIRouter(prefix="/marchands", tags=["Marchands"])


class Marchand(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    code: str = Field(pattern=r"^[0-9]{1,20}$")  # entièrement numérique
    # Intitulé alphanumérique (lettres accentuées acceptées), comme l'app Android
    libelle: str = Field(min_length=2, max_length=60, pattern=r"^[0-9A-Za-zÀ-ÖØ-öø-ÿ ._'-]+$")


@router.get("")
async def rechercher(operateur: Optional[str] = None, q: Optional[str] = None, _: dict = Depends(get_current_user)):
    """Marchands connus (100 au plus), filtrés par opérateur et par texte (code ou intitulé)."""
    filtre: dict = {}
    if operateur:
        filtre["operateur"] = operateur
    if q and q.strip():
        motif = re.escape(q.strip())
        filtre["$or"] = [{"code": {"$regex": f"^{motif}"}}, {"libelle": {"$regex": motif, "$options": "i"}}]
    return await db.marchands.find(filtre, SANS_ID).sort("modifie_le", -1).to_list(100)


@router.get("/{operateur}/{code}")
async def trouver(operateur: str, code: str, _: dict = Depends(get_current_user)):
    """404 si le code est inconnu : le site propose alors de lui donner un intitulé."""
    doc = await db.marchands.find_one({"operateur": operateur, "code": code}, SANS_ID)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Marchand introuvable")
    return doc


@router.post("", status_code=status.HTTP_201_CREATED)
async def enregistrer(data: Marchand, user: dict = Depends(get_current_user)):
    """Crée le marchand s'il n'existe pas. Un intitulé déjà enregistré n'est pas
    écrasé par un autre utilisateur (seul son auteur peut le corriger)."""
    maintenant = datetime.now(timezone.utc).isoformat()
    existant = await db.marchands.find_one({"operateur": data.operateur, "code": data.code}, SANS_ID)
    if existant:
        if existant.get("cree_par") == user["id"] or user.get("role") == "admin":
            await db.marchands.update_one({"operateur": data.operateur, "code": data.code},
                                          {"$set": {"libelle": data.libelle.strip(), "modifie_le": maintenant}})
            existant = {**existant, "libelle": data.libelle.strip(), "modifie_le": maintenant}
        return existant
    doc = {"operateur": data.operateur, "code": data.code, "libelle": data.libelle.strip(), "cree_par": user["id"],
           "cree_le": maintenant, "modifie_le": maintenant}
    await db.marchands.insert_one(doc.copy())
    return doc
