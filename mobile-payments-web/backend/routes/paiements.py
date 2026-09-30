"""Préparation des paiements : le serveur construit le code USSD à partir du
service choisi et des valeurs saisies, puis le range dans l'historique de
l'utilisateur. Le site l'affiche en QR code (lien « tel: ») à scanner avec le
téléphone, qui ouvre alors son composeur avec le code pré-rempli.

⚠️ Le site ne sait pas si l'opérateur a validé la transaction (c'est le
téléphone qui dialogue avec l'opérateur) : l'utilisateur indique lui-même
« payé » ou « abandonné ».
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user
from ussd import ErreurSaisie, construire_code, lien_tel

router = APIRouter(prefix="/paiements", tags=["Paiements"])


class Preparation(BaseModel):
    service_id: str = Field(min_length=1, max_length=64)
    valeurs: dict[str, str] = Field(default_factory=dict)


class Statut(BaseModel):
    statut: Literal["prepare", "effectue", "abandonne"]


def _avec_lien(p: dict) -> dict:
    """Ajoute le lien « tel: » (calculé, jamais stocké)."""
    return {**p, "lien_tel": lien_tel(p["code_ussd"])}


@router.post("", status_code=status.HTTP_201_CREATED)
async def preparer(data: Preparation, user: dict = Depends(get_current_user)):
    service = await db.services.find_one({"id": data.service_id, "actif": True}, SANS_ID)
    if not service:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable ou désactivé")
    champs = service.get("champs", [])
    try:
        code = construire_code(service["gabarit_ussd"], champs, data.valeurs)
    except ErreurSaisie as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    # Seules les valeurs des champs du service sont gardées (rien d'autre n'est stocké)
    valeurs = {c["key"]: str(data.valeurs.get(c["key"], "")).strip().replace(" ", "") for c in champs}
    # Marchand concerné (si le service a un champ « code marchand »)
    marchand = None
    champ_marchand = next((c for c in champs if c.get("isMerchantCode")), None)
    if champ_marchand:
        doc = await db.marchands.find_one({"operateur": service["operateur"], "code": valeurs[champ_marchand["key"]]},
                                          SANS_ID)
        marchand = {"code": valeurs[champ_marchand["key"]], "libelle": (doc or {}).get("libelle")}
    montant = int(valeurs["amount"]) if valeurs.get("amount", "").isdigit() else None
    paiement = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "service_id": service["id"],
        "operateur": service["operateur"], "service_nom": service["nom"], "categorie": service["categorie"],
        "valeurs": valeurs, "marchand": marchand, "montant": montant, "code_ussd": code, "statut": "prepare",
        "cree_le": datetime.now(timezone.utc).isoformat(),
    }
    await db.paiements.insert_one(paiement.copy())
    return _avec_lien(paiement)


@router.get("")
async def historique(limite: int = Query(50, ge=1, le=200), user: dict = Depends(get_current_user)):
    """Paiements préparés par l'utilisateur connecté, du plus récent au plus ancien."""
    docs = await db.paiements.find({"user_id": user["id"]}, SANS_ID).sort("cree_le", -1).to_list(limite)
    return [_avec_lien(p) for p in docs]


@router.put("/{paiement_id}/statut")
async def changer_statut(paiement_id: str, data: Statut, user: dict = Depends(get_current_user)):
    # Le filtre user_id garantit qu'on ne modifie que SES paiements
    res = await db.paiements.update_one({"id": paiement_id, "user_id": user["id"]},
                                        {"$set": {"statut": data.statut,
                                                  "statut_le": datetime.now(timezone.utc).isoformat()}})
    if not res.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement introuvable")
    return _avec_lien(await db.paiements.find_one({"id": paiement_id}, SANS_ID))


@router.delete("/{paiement_id}")
async def supprimer(paiement_id: str, user: dict = Depends(get_current_user)):
    res = await db.paiements.delete_one({"id": paiement_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement introuvable")
    return {"ok": True}
