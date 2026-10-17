"""Anniversaires à souhaiter (lot 34) : liste personnelle de 30 personnes au plus par utilisateur.

Pour un développeur WinDev : c'est une table « Anniversaire » filtrée sur l'utilisateur connecté.
  - chaque fiche : nom, jour, mois, année (facultative), téléphone (facultatif, pour écrire sur WhatsApp), note ;
  - le serveur calcule pour chaque fiche la PROCHAINE date (aujourd'hui compris), le nombre de jours restants
    et l'âge qu'aura la personne ; la liste est triée du plus proche au plus lointain ;
  - le 29 février est fêté le 28 février les années non bissextiles ;
  - 30 fiches au maximum par utilisateur (409 au-delà) ;
  - chaque utilisateur ne voit et ne modifie que SES fiches.

Routes :
    GET    /api/anniversaires         → {fiches: [...], total, maximum, aujourdhui}
    POST   /api/anniversaires         → crée une fiche
    PUT    /api/anniversaires/{id}    → modifie une fiche
    DELETE /api/anniversaires/{id}    → supprime une fiche
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user
from ussd import ErreurSaisie, normaliser_telephone

MAXIMUM = 30   # fiches par utilisateur (demande du propriétaire)

router = APIRouter(prefix="/anniversaires", tags=["Anniversaires"])


class Fiche(BaseModel):
    nom: str = Field(min_length=1, max_length=60)
    jour: int = Field(ge=1, le=31)
    mois: int = Field(ge=1, le=12)
    annee: Optional[int] = Field(default=None, ge=1900, le=2100)   # année de naissance, facultative
    telephone: Optional[str] = Field(default=None, max_length=30)  # facultatif : permet « Souhaiter » par WhatsApp
    note: Optional[str] = Field(default=None, max_length=120)


def _aujourdhui() -> date:
    return datetime.now(timezone.utc).date()   # heure de Ouagadougou = UTC


def _valider(f: Fiche) -> dict:
    """Date réelle (31/04 refusé ; 29/02 accepté, et refusé si l'année donnée n'est pas bissextile) et téléphone normalisé."""
    try:
        date(f.annee or 2000, f.mois, f.jour)   # 2000 est bissextile : 29/02 sans année est accepté
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Date invalide")
    if f.annee and f.annee > _aujourdhui().year:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Année de naissance dans le futur")
    donnees = {"nom": f.nom.strip(), "jour": f.jour, "mois": f.mois, "annee": f.annee,
               "note": (f.note or "").strip() or None, "telephone": None}
    if not donnees["nom"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nom requis")
    if (f.telephone or "").strip():
        try:
            donnees["telephone"] = normaliser_telephone(f.telephone)   # règle du Burkina Faso (8 chiffres → +226)
        except ErreurSaisie:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Numéro invalide : 8 chiffres au Burkina Faso (ex. 70 00 00 00)")
    return donnees


def prochain_anniversaire(jour: int, mois: int, aujourdhui: date) -> date:
    """Prochaine date (aujourd'hui compris) ; le 29 février devient le 28 février les années non bissextiles."""
    for annee in (aujourdhui.year, aujourdhui.year + 1):
        try:
            d = date(annee, mois, jour)
        except ValueError:
            d = date(annee, 2, 28)
        if d >= aujourdhui:
            return d
    return date(aujourdhui.year + 1, mois, min(jour, 28))   # inatteignable, garde-fou


def enrichir(fiche: dict, aujourdhui: date) -> dict:
    """Ajoute prochain (ISO), dans_jours et age (âge qu'aura la personne, si l'année est connue)."""
    d = prochain_anniversaire(fiche["jour"], fiche["mois"], aujourdhui)
    return {**fiche, "prochain": d.isoformat(), "dans_jours": (d - aujourdhui).days,
            "age": d.year - fiche["annee"] if fiche.get("annee") else None}


async def a_souhaiter(user_id: str) -> int:
    """Nombre d'anniversaires aujourd'hui (pastille du menu)."""
    auj = _aujourdhui()
    docs = await db.anniversaires.find({"user_id": user_id}, SANS_ID).to_list(MAXIMUM + 5)
    return sum(1 for d in docs if prochain_anniversaire(d["jour"], d["mois"], auj) == auj)


@router.get("")
async def lister(user: dict = Depends(get_current_user)):
    docs = await db.anniversaires.find({"user_id": user["id"]}, SANS_ID).to_list(MAXIMUM + 5)
    auj = _aujourdhui()
    fiches = sorted((enrichir({k: v for k, v in d.items() if k != "user_id"}, auj) for d in docs),
                    key=lambda f: (f["dans_jours"], f["nom"].lower()))
    return {"fiches": fiches, "total": len(fiches), "maximum": MAXIMUM,
            "aujourdhui": sum(1 for f in fiches if f["dans_jours"] == 0)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer(data: Fiche, user: dict = Depends(get_current_user)):
    donnees = _valider(data)
    if await db.anniversaires.count_documents({"user_id": user["id"]}) >= MAXIMUM:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Liste complète : {MAXIMUM} personnes au maximum")
    fiche = {"id": str(uuid.uuid4()), "user_id": user["id"], **donnees, "cree_le": datetime.now(timezone.utc).isoformat()}
    await db.anniversaires.insert_one(fiche.copy())
    return enrichir({k: v for k, v in fiche.items() if k != "user_id"}, _aujourdhui())


@router.put("/{fiche_id}")
async def modifier(fiche_id: str, data: Fiche, user: dict = Depends(get_current_user)):
    donnees = _valider(data)
    res = await db.anniversaires.update_one({"id": fiche_id, "user_id": user["id"]}, {"$set": donnees})
    if not res.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    fiche = await db.anniversaires.find_one({"id": fiche_id}, SANS_ID)
    return enrichir({k: v for k, v in fiche.items() if k != "user_id"}, _aujourdhui())


@router.delete("/{fiche_id}")
async def supprimer(fiche_id: str, user: dict = Depends(get_current_user)):
    res = await db.anniversaires.delete_one({"id": fiche_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    return {"ok": True}
