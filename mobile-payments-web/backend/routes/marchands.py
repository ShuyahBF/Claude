"""Annuaire des codes marchands (partagé entre utilisateurs, comme dans l'app
Android) : un code numérique par opérateur, avec l'intitulé choisi par le
premier utilisateur qui l'a rencontré."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

import lieux_marchands
import reglages_securite
from db import SANS_ID, db
from securite import get_current_user

router = APIRouter(prefix="/marchands", tags=["Marchands"])


class Marchand(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    code: str = Field(pattern=r"^[0-9]{1,20}$")  # entièrement numérique
    # Intitulé alphanumérique (lettres accentuées acceptées), comme l'app Android
    libelle: str = Field(min_length=2, max_length=60, pattern=r"^[0-9A-Za-zÀ-ÖØ-öø-ÿ ._'-]+$")


class Modification(BaseModel):
    """Lot 106 : modifier un marchand déjà enregistré (le code, lui, ne change jamais).
    libelle : nouveau nom (absent = inchangé) ; service_id : service de paiement du marchand (absent = inchangé, "" = service par défaut)."""
    libelle: Optional[str] = Field(None, min_length=2, max_length=60, pattern=r"^[0-9A-Za-zÀ-ÖØ-öø-ÿ ._'-]+$")
    service_id: Optional[str] = Field(None, max_length=64)


def modifiable_par(doc: dict, user: dict) -> bool:
    """Seul l'auteur d'un marchand (ou l'administrateur) peut le modifier : l'annuaire est partagé entre tous les utilisateurs."""
    return doc.get("cree_par") == user["id"] or user.get("role") == "admin"


def _vue(doc: dict, user: dict) -> dict:
    return {**doc, "modifiable": modifiable_par(doc, user)}


@router.get("")
async def rechercher(operateur: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Marchands connus (100 au plus), filtrés par opérateur et par texte (code ou intitulé)."""
    filtre: dict = {}
    if operateur:
        filtre["operateur"] = operateur
    if q and q.strip():
        motif = re.escape(q.strip())
        filtre["$or"] = [{"code": {"$regex": f"^{motif}"}}, {"libelle": {"$regex": motif, "$options": "i"}}]
    return [_vue(m, user) for m in await db.marchands.find(filtre, SANS_ID).sort("modifie_le", -1).to_list(100)]


@router.get("/proches")
async def proches(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), user: dict = Depends(get_current_user)):
    """Marchands proches (lots 49 et 102) : TOUS ceux du rayon réglé par l'administrateur (50 m par défaut), à choisir dans une liste.
    Réservé aux comptes qui ont activé leur géolocalisation ; la position demandée n'est jamais enregistrée."""
    if not user.get("geoloc"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Géolocalisation désactivée sur ce compte")
    rayon = await reglages_securite.metres_rayon_marchands()          # lot 102 : rayon réglé par l'administrateur
    return {"marchands": await lieux_marchands.proches(lat, lon, rayon), "rayon_m": rayon}


@router.get("/{operateur}/{code}")
async def trouver(operateur: str, code: str, user: dict = Depends(get_current_user)):
    """404 si le code est inconnu : le site propose alors de lui donner un intitulé."""
    doc = await db.marchands.find_one({"operateur": operateur, "code": code}, SANS_ID)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Marchand introuvable")
    return _vue(doc, user)


@router.put("/{operateur}/{code}")
async def modifier(operateur: str, code: str, data: Modification, user: dict = Depends(get_current_user)):
    """Lot 106 — modifie le NOM et / ou le SERVICE de paiement d'un marchand (ex. « Paiement marchand » *144*10*… au lieu de
    « Paiement de facture » *144*4*… quand le marchand change de mode d'encaissement). Le code ne se modifie pas."""
    doc = await db.marchands.find_one({"operateur": operateur, "code": code}, SANS_ID)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Marchand introuvable")
    if not modifiable_par(doc, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul l'auteur de ce marchand (ou l'administrateur) peut le modifier")
    maj: dict = {"modifie_le": datetime.now(timezone.utc).isoformat()}
    if data.libelle is not None:
        maj["libelle"] = data.libelle.strip()
    if "service_id" in data.model_fields_set:
        sid = (data.service_id or "").strip()
        if sid:
            svc = await db.services.find_one({"id": sid, "actif": True}, SANS_ID)
            if not svc or svc.get("operateur") != operateur or not any(c.get("isMerchantCode") for c in svc.get("champs", [])):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Service inconnu pour cet opérateur (il doit demander un code marchand)")
        maj["service_id"] = sid or None
    await db.marchands.update_one({"operateur": operateur, "code": code}, {"$set": maj})
    return _vue({**doc, **maj}, user)


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
