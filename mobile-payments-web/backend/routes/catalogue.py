"""Catalogue des services USSD : consultation (utilisateurs connectés) et
gestion (administrateur)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from db import SANS_ID, db
from securite import get_current_user, require_admin
from ussd import gabarit_valide, placeholders

router = APIRouter(tags=["Catalogue"])

Categorie = Literal["merchant_payment", "bill_payment", "money_transfer", "airtime_topup", "internet_bundle", "other"]


class Champ(BaseModel):
    key: str = Field(pattern=r"^[a-zA-Z0-9_]+$", max_length=30)
    label: str = Field(min_length=1, max_length=60)
    type: Literal["numeric", "text"] = "numeric"
    isMerchantCode: bool = False


class ServiceEntree(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    pays: str = Field(default="BF", min_length=2, max_length=2)
    nom: str = Field(min_length=1, max_length=80)
    categorie: Categorie
    gabarit_ussd: str = Field(min_length=3, max_length=80)
    champs: list[Champ] = Field(default_factory=list)
    description: str = Field(default="", max_length=300)
    actif: bool = True


def _verifier(data: ServiceEntree) -> None:
    """Le gabarit doit être bien formé et chaque placeholder avoir son champ (et inversement)."""
    if not gabarit_valide(data.gabarit_ussd):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Gabarit USSD invalide : il commence par *, finit par # et ne contient que des chiffres, * et {champ}")
    cles_gabarit = set(placeholders(data.gabarit_ussd))
    cles_champs = [c.key for c in data.champs]
    if len(set(cles_champs)) != len(cles_champs):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deux champs ont la même clé")
    if cles_gabarit != set(cles_champs):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Les champs doivent correspondre aux placeholders du gabarit : {', '.join(sorted(cles_gabarit)) or 'aucun'}")
    if sum(1 for c in data.champs if c.isMerchantCode) > 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Un seul champ peut être un code marchand")


@router.get("/operateurs")
async def operateurs(pays: Optional[str] = None, _: dict = Depends(get_current_user)):
    filtre = {"actif": True, **({"pays": pays.upper()} if pays else {})}
    return sorted(await db.services.distinct("operateur", filtre))


@router.get("/services")
async def services(operateur: Optional[str] = None, pays: Optional[str] = None, _: dict = Depends(get_current_user)):
    filtre: dict = {"actif": True}
    if operateur:
        filtre["operateur"] = operateur
    if pays:
        filtre["pays"] = pays.upper()
    return await db.services.find(filtre, SANS_ID).sort("nom", 1).to_list(500)


@router.get("/services/{service_id}")
async def service(service_id: str, _: dict = Depends(get_current_user)):
    doc = await db.services.find_one({"id": service_id}, SANS_ID)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable")
    return doc


# --- Administration du catalogue ---
@router.get("/admin/services")
async def tous_les_services(_: dict = Depends(require_admin)):
    """Tous les services, y compris désactivés."""
    return await db.services.find({}, SANS_ID).sort([("operateur", 1), ("nom", 1)]).to_list(1000)


@router.post("/admin/services", status_code=status.HTTP_201_CREATED)
async def creer_service(data: ServiceEntree, _: dict = Depends(require_admin)):
    _verifier(data)
    maintenant = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), **data.model_dump(), "pays": data.pays.upper(), "cree_le": maintenant,
           "modifie_le": maintenant}
    try:
        await db.services.insert_one(doc.copy())
    except DuplicateKeyError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce service existe déjà pour cet opérateur") from exc
    return doc


@router.put("/admin/services/{service_id}")
async def modifier_service(service_id: str, data: ServiceEntree, _: dict = Depends(require_admin)):
    _verifier(data)
    maj = {**data.model_dump(), "pays": data.pays.upper(), "modifie_le": datetime.now(timezone.utc).isoformat()}
    try:
        res = await db.services.update_one({"id": service_id}, {"$set": maj})
    except DuplicateKeyError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce service existe déjà pour cet opérateur") from exc
    if not res.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable")
    return await db.services.find_one({"id": service_id}, SANS_ID)
