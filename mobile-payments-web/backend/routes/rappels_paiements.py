"""Rappels de paiements récurrents (lot 36) : loyer, électricité, abonnement… 30 rappels au plus par utilisateur.

Pour un développeur WinDev : une table « RappelPaiement » filtrée sur l'utilisateur connecté.
  - chaque rappel : libellé, montant et opérateur (facultatifs), fréquence (liste fermée), PROCHAINE échéance,
    nombre de jours à l'avance où le rappel devient « à traiter » (0, 1, 3 ou 7) ;
  - état calculé par le serveur : « retard » (échéance passée), « aujourdhui », « a_venir » ;
  - « Marquer payé » avance l'échéance à la période suivante (mensuel : même jour du mois, ramené au dernier jour
    si le mois est plus court ; jamais dans le passé) ; un rappel « unique » est supprimé une fois payé ;
  - aucun paiement n'est exécuté : le site ne fait que rappeler (le paiement se prépare sur l'écran Payer).

Routes :
    GET    /api/rappels-paiements              → {rappels: [...], total, maximum, a_traiter}
    POST   /api/rappels-paiements              → crée
    PUT    /api/rappels-paiements/{id}         → modifie
    POST   /api/rappels-paiements/{id}/paye    → marque payé (avance l'échéance)
    DELETE /api/rappels-paiements/{id}         → supprime
"""
from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user

MAXIMUM = 30
FREQUENCES = ("unique", "hebdomadaire", "mensuel", "trimestriel", "annuel")
PAS_EN_MOIS = {"mensuel": 1, "trimestriel": 3, "annuel": 12}

router = APIRouter(prefix="/rappels-paiements", tags=["Rappels de paiements"])


class Rappel(BaseModel):
    libelle: str = Field(min_length=1, max_length=60)
    montant: Optional[int] = Field(default=None, ge=1, le=100_000_000)   # FCFA, facultatif
    operateur: Optional[str] = Field(default=None, max_length=40)
    frequence: Literal["unique", "hebdomadaire", "mensuel", "trimestriel", "annuel"]
    echeance: date                                                       # prochaine échéance
    rappel_jours: Literal[0, 1, 3, 7] = 1                                # devient « à traiter » ce nombre de jours avant
    note: Optional[str] = Field(default=None, max_length=120)


def _aujourdhui() -> date:
    return datetime.now(timezone.utc).date()   # heure de Ouagadougou = UTC


def ajouter_mois(d: date, mois: int, jour_ref: int) -> date:
    """d + `mois` mois, au jour `jour_ref` (ramené au dernier jour du mois s'il est plus court)."""
    total = d.year * 12 + (d.month - 1) + mois
    annee, m = divmod(total, 12)
    m += 1
    return date(annee, m, min(jour_ref, calendar.monthrange(annee, m)[1]))


def periode_suivante(d: date, frequence: str, jour_ref: int) -> date:
    from datetime import timedelta
    if frequence == "hebdomadaire":
        return d + timedelta(days=7)
    return ajouter_mois(d, PAS_EN_MOIS[frequence], jour_ref)


def prochaine_echeance(echeance: date, frequence: str, jour_ref: int, aujourdhui: date) -> date:
    """Échéance suivante après un paiement : une période de plus, et jamais dans le passé."""
    suivante = periode_suivante(echeance, frequence, jour_ref)
    while suivante < aujourdhui:
        suivante = periode_suivante(suivante, frequence, jour_ref)
    return suivante


def enrichir(r: dict, aujourdhui: date) -> dict:
    """Ajoute dans_jours (négatif = en retard), etat et a_traiter."""
    e = date.fromisoformat(r["echeance"])
    n = (e - aujourdhui).days
    return {**{k: v for k, v in r.items() if k not in ("user_id", "jour_ref")}, "dans_jours": n,
            "etat": "retard" if n < 0 else "aujourdhui" if n == 0 else "a_venir",
            "a_traiter": n <= r.get("rappel_jours", 1)}


async def a_traiter(user_id: str) -> int:
    """Nombre de rappels à traiter (en retard, aujourd'hui, ou dans le délai choisi) : badge du menu."""
    auj = _aujourdhui()
    docs = await db.rappels_paiements.find({"user_id": user_id}, SANS_ID).to_list(MAXIMUM + 5)
    return sum(1 for d in docs if enrichir(d, auj)["a_traiter"])


async def evenements(user_id: str) -> list[dict]:
    """Paiements à traiter (en retard, aujourd'hui, ou dans le délai choisi) : une alerte par rappel, par échéance et par état."""
    auj = _aujourdhui()
    docs = await db.rappels_paiements.find({"user_id": user_id}, SANS_ID).to_list(MAXIMUM + 5)
    out = []
    for r in (enrichir(d, auj) for d in docs):
        if not r["a_traiter"]:
            continue
        quand = (f"en retard de {-r['dans_jours']} jour{'s' if r['dans_jours'] < -1 else ''}" if r["etat"] == "retard"
                 else "à payer aujourd'hui" if r["etat"] == "aujourdhui" else f"dans {r['dans_jours']} jour{'s' if r['dans_jours'] > 1 else ''}")
        montant = f" · {r['montant']:,} FCFA".replace(",", " ") if r.get("montant") else ""
        out.append({"cle": f"pai:{r['id']}:{r['echeance']}:{r['etat']}", "type": "paiement", "titre": f"🔁 {r['libelle']}",
                    "texte": f"Paiement {quand}{montant}", "lien": "/rappels-paiements"})
    return out


def _donnees(r: Rappel) -> dict:
    libelle = r.libelle.strip()
    if not libelle:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Libellé requis")
    return {"libelle": libelle, "montant": r.montant, "operateur": (r.operateur or "").strip() or None,
            "frequence": r.frequence, "echeance": r.echeance.isoformat(), "jour_ref": r.echeance.day,
            "rappel_jours": r.rappel_jours, "note": (r.note or "").strip() or None}


@router.get("")
async def lister(user: dict = Depends(get_current_user)):
    docs = await db.rappels_paiements.find({"user_id": user["id"]}, SANS_ID).to_list(MAXIMUM + 5)
    auj = _aujourdhui()
    rappels = sorted((enrichir(d, auj) for d in docs), key=lambda r: (r["dans_jours"], r["libelle"].lower()))
    return {"rappels": rappels, "total": len(rappels), "maximum": MAXIMUM, "a_traiter": sum(1 for r in rappels if r["a_traiter"])}


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer(data: Rappel, user: dict = Depends(get_current_user)):
    donnees = _donnees(data)
    if await db.rappels_paiements.count_documents({"user_id": user["id"]}) >= MAXIMUM:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Liste complète : {MAXIMUM} rappels au maximum")
    rappel = {"id": str(uuid.uuid4()), "user_id": user["id"], **donnees, "cree_le": datetime.now(timezone.utc).isoformat()}
    await db.rappels_paiements.insert_one(rappel.copy())
    return enrichir(rappel, _aujourdhui())


@router.put("/{rappel_id}")
async def modifier(rappel_id: str, data: Rappel, user: dict = Depends(get_current_user)):
    res = await db.rappels_paiements.update_one({"id": rappel_id, "user_id": user["id"]}, {"$set": _donnees(data)})
    if not res.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rappel introuvable")
    return enrichir(await db.rappels_paiements.find_one({"id": rappel_id}, SANS_ID), _aujourdhui())


@router.post("/{rappel_id}/paye")
async def marquer_paye(rappel_id: str, user: dict = Depends(get_current_user)):
    """Avance l'échéance à la période suivante ; un rappel « unique » est supprimé."""
    r = await db.rappels_paiements.find_one({"id": rappel_id, "user_id": user["id"]}, SANS_ID)
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rappel introuvable")
    if r["frequence"] == "unique":
        await db.rappels_paiements.delete_one({"id": rappel_id, "user_id": user["id"]})
        return {"termine": True}
    suivante = prochaine_echeance(date.fromisoformat(r["echeance"]), r["frequence"], r.get("jour_ref", date.fromisoformat(r["echeance"]).day), _aujourdhui())
    await db.rappels_paiements.update_one({"id": rappel_id}, {"$set": {"echeance": suivante.isoformat(),
                                                                       "paye_le": datetime.now(timezone.utc).isoformat()}})
    return enrichir(await db.rappels_paiements.find_one({"id": rappel_id}, SANS_ID), _aujourdhui())


@router.delete("/{rappel_id}")
async def supprimer(rappel_id: str, user: dict = Depends(get_current_user)):
    res = await db.rappels_paiements.delete_one({"id": rappel_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rappel introuvable")
    return {"ok": True}
