"""QR codes des plaques d'opérateurs (Orange Money…) reliés au code marchand (lot 38).

Constat (photos de la plaque Orange Money, 17/10/2026) : le QR imprimé par l'opérateur contient seulement un
identifiant interne (`OBF_$` + base64 d'un numéro, ex. 000002011167) : PAS le code marchand, qui est écrit à la main sur
la plaque (ex. 3366444). Paiement Mobile ne peut donc pas composer le paiement à partir de ce QR seul.

Solution : la PREMIÈRE fois, l'utilisateur saisit le code marchand de la plaque ; le site MÉMORISE le lien
« identifiant du QR → code marchand ». Aux scans suivants, le code est proposé et il ne reste que le montant.

Pour un développeur WinDev : un fichier « LienQr » (opérateur, identifiant du QR, utilisateur, code marchand), UNE ligne par
utilisateur et par QR. Comme un mauvais lien partagé enverrait un paiement au mauvais marchand, le code proposé est :
  1. celui que CET utilisateur a lui-même enregistré, sinon
  2. le code choisi par le plus grand nombre d'utilisateurs différents (« confirmations ») ;
et l'application demande toujours à l'utilisateur de CONFIRMER (« Utiliser ce code ») avant de continuer.

Routes (utilisateur connecté) :
    GET  /api/qr-operateurs/{operateur}/{identifiant}  → {trouve, code, libelle, confirmations, source: moi | communaute}
    POST /api/qr-operateurs  {operateur, identifiant, code, libelle?} → enregistre / confirme le lien ; même réponse
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from db import SANS_ID, db
from limiteur import limiter_appels_publics
from securite import get_current_user

router = APIRouter(prefix="/qr-operateurs", tags=["QR des opérateurs"])


class Lien(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    identifiant: str = Field(pattern=r"^[0-9]{4,30}$")                 # numéro lu dans le QR de l'opérateur
    code: str = Field(pattern=r"^[0-9]{3,12}$")                        # code marchand écrit sur la plaque
    libelle: Optional[str] = Field(default=None, max_length=60, pattern=r"^[0-9A-Za-zÀ-ÖØ-öø-ÿ ._'-]*$")


async def meilleur_lien(operateur: str, identifiant: str, user_id: str) -> dict:
    """Code proposé pour ce QR : le sien d'abord, sinon celui qui a le plus de confirmations distinctes."""
    liens = await db.qr_operateurs.find({"operateur": operateur, "identifiant": identifiant}, SANS_ID).to_list(500)
    if not liens:
        return {"trouve": False}
    votes = Counter(l["code"] for l in liens)               # une ligne par utilisateur : chaque vote compte une fois
    mien = next((l for l in liens if l["user_id"] == user_id), None)
    if mien:
        code, source = mien["code"], "moi"
    else:
        derniers = {}
        for l in sorted(liens, key=lambda x: x["maj_le"]):
            derniers[l["code"]] = l["maj_le"]
        code = max(votes, key=lambda c: (votes[c], derniers[c]))          # égalité : le plus récent
        source = "communaute"
    marchand = await db.marchands.find_one({"operateur": operateur, "code": code}, SANS_ID)
    return {"trouve": True, "code": code, "libelle": (marchand or {}).get("libelle"), "confirmations": votes[code], "source": source}


@router.get("/{operateur}/{identifiant}", dependencies=[Depends(limiter_appels_publics)])
async def chercher(operateur: str, identifiant: str, user: dict = Depends(get_current_user)):
    if not identifiant.isdigit():
        return {"trouve": False}
    return await meilleur_lien(operateur, identifiant, user["id"])


@router.post("", dependencies=[Depends(limiter_appels_publics)])
async def enregistrer(data: Lien, user: dict = Depends(get_current_user)):
    maintenant = datetime.now(timezone.utc).isoformat()
    cle = {"operateur": data.operateur, "identifiant": data.identifiant, "user_id": user["id"]}
    await db.qr_operateurs.update_one(cle, {"$set": {**cle, "code": data.code, "maj_le": maintenant}}, upsert=True)
    # Un intitulé donné pour un marchand encore inconnu entre dans l'annuaire partagé (jamais d'écrasement)
    libelle = (data.libelle or "").strip()
    if len(libelle) >= 2 and not await db.marchands.find_one({"operateur": data.operateur, "code": data.code}, SANS_ID):
        await db.marchands.insert_one({"operateur": data.operateur, "code": data.code, "libelle": libelle, "cree_par": user["id"],
                                       "cree_le": maintenant, "modifie_le": maintenant})
    return await meilleur_lien(data.operateur, data.identifiant, user["id"])
