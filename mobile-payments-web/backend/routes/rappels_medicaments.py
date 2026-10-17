"""Rappels de prise de médicaments (lot 36) : 20 traitements au plus par utilisateur.

Pour un développeur WinDev : deux tables filtrées sur l'utilisateur connecté.
  - « RappelMedicament » : nom du médicament, dose, 1 à 6 heures de prise par jour (HH:MM), date de début,
    date de fin facultative, note ;
  - « PriseMedicament » : une ligne par prise cochée (utilisateur, rappel, jour, heure).
  - Le serveur construit la liste d'AUJOURD'HUI : chaque prise prévue avec « pris » (coché) et « en_retard »
    (heure passée, non cochée). Heure de Ouagadougou = UTC.
  - Le site rappelle seulement (dans l'application) : aucun conseil médical n'est donné.

Routes :
    GET    /api/rappels-medicaments                → {rappels, aujourdhui, total, maximum, a_prendre}
    POST   /api/rappels-medicaments                → crée
    PUT    /api/rappels-medicaments/{id}           → modifie
    POST   /api/rappels-medicaments/{id}/prises    → {heure, pris} coche / décoche la prise d'aujourd'hui
    DELETE /api/rappels-medicaments/{id}           → supprime (et ses prises)
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from db import SANS_ID, db
from securite import get_current_user

MAXIMUM = 20
MARGE_MINUTES = 30   # une prise devient « à prendre » 30 min avant son heure

router = APIRouter(prefix="/rappels-medicaments", tags=["Rappels de médicaments"])


class Traitement(BaseModel):
    medicament: str = Field(min_length=1, max_length=60)
    dose: Optional[str] = Field(default=None, max_length=40)            # ex. « 1 comprimé »
    heures: List[str] = Field(min_length=1, max_length=6)               # « 08:00 », « 20:30 »…
    debut: date
    fin: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=120)

    @field_validator("heures")
    @classmethod
    def _heures(cls, valeurs: List[str]) -> List[str]:
        """HH:MM valides, sans doublon, triées."""
        propres = set()
        for h in valeurs:
            try:
                t = datetime.strptime(h.strip(), "%H:%M")
            except ValueError:
                raise ValueError("Heure invalide (format HH:MM)")
            propres.add(t.strftime("%H:%M"))
        return sorted(propres)


def _maintenant() -> datetime:
    return datetime.now(timezone.utc)   # heure de Ouagadougou = UTC


def statut(r: dict, auj: date) -> str:
    """« a_venir » (pas commencé), « en_cours » ou « termine » (date de fin passée)."""
    if date.fromisoformat(r["debut"]) > auj:
        return "a_venir"
    if r.get("fin") and date.fromisoformat(r["fin"]) < auj:
        return "termine"
    return "en_cours"


def prises_du_jour(rappels: List[dict], cochees: set, maintenant: datetime) -> List[dict]:
    """Prises prévues aujourd'hui (rappels en cours), triées par heure."""
    auj, hhmm, out = maintenant.date(), maintenant.strftime("%H:%M"), []
    for r in rappels:
        if statut(r, auj) != "en_cours":
            continue
        for h in r["heures"]:
            pris = (r["id"], h) in cochees
            out.append({"rappel_id": r["id"], "medicament": r["medicament"], "dose": r.get("dose"), "heure": h,
                        "pris": pris, "en_retard": (not pris) and h < hhmm})
    return sorted(out, key=lambda p: (p["heure"], p["medicament"].lower()))


def a_prendre_compte(prises: List[dict], maintenant: datetime) -> int:
    """Prises non cochées dont l'heure est passée ou tombe dans les 30 prochaines minutes (le jour même)."""
    plus_tard = maintenant + timedelta(minutes=MARGE_MINUTES)
    limite = plus_tard.strftime("%H:%M") if plus_tard.date() == maintenant.date() else "23:59"
    return sum(1 for p in prises if not p["pris"] and p["heure"] <= limite)


async def _charger(user_id: str):
    rappels = await db.rappels_medicaments.find({"user_id": user_id}, SANS_ID).to_list(MAXIMUM + 5)
    jour = _maintenant().date().isoformat()
    cochees = {(p["rappel_id"], p["heure"]) async for p in db.prises_medicaments.find({"user_id": user_id, "jour": jour}, SANS_ID)}
    return rappels, cochees


async def a_prendre(user_id: str) -> int:
    """Nombre de prises à prendre maintenant (badge du menu)."""
    rappels, cochees = await _charger(user_id)
    m = _maintenant()
    return a_prendre_compte(prises_du_jour(rappels, cochees, m), m)


REPETITION_MINUTES = 15   # une prise oubliée est rappelée toutes les 15 minutes…
REPETITIONS_MAX = 3       # …jusqu'à 3 fois, puis on laisse l'indicateur « En retard » de la page
FENETRE_MINUTES = 180     # au-delà de 3 h de retard, plus aucun rappel sonore


def evenements_prises(prises: List[dict], maintenant: datetime) -> List[dict]:
    """Prises non cochées DONT L'HEURE EST ARRIVÉE (et pas trop ancienne) : une alerte à l'heure, puis jusqu'à 3 rappels.
    La clé change à chaque rappel (…:0, …:1…) : le navigateur n'alerte qu'une fois par clé."""
    hhmm_min = maintenant.hour * 60 + maintenant.minute
    out = []
    for p in prises:
        if p["pris"]:
            continue
        h, m = (int(x) for x in p["heure"].split(":"))
        retard = hhmm_min - (h * 60 + m)
        if retard < 0 or retard > FENETRE_MINUTES:
            continue
        n = min(REPETITIONS_MAX, retard // REPETITION_MINUTES)
        dose = f" — {p['dose']}" if p.get("dose") else ""
        texte = f"Prise de {p['heure']}{dose}" + (f" (en retard de {retard} min)" if retard >= 5 else "")
        out.append({"cle": f"med:{p['rappel_id']}:{p['heure']}:{n}", "type": "medicament", "titre": f"💊 {p['medicament']}",
                    "texte": texte, "lien": "/medicaments", "repetition": n})
    return out


async def evenements(user_id: str) -> List[dict]:
    rappels, cochees = await _charger(user_id)
    m = _maintenant()
    return evenements_prises(prises_du_jour(rappels, cochees, m), m)


def _donnees(t: Traitement) -> dict:
    nom = t.medicament.strip()
    if not nom:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nom du médicament requis")
    if t.fin and t.fin < t.debut:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La date de fin précède la date de début")
    return {"medicament": nom, "dose": (t.dose or "").strip() or None, "heures": t.heures, "debut": t.debut.isoformat(),
            "fin": t.fin.isoformat() if t.fin else None, "note": (t.note or "").strip() or None}


def _vue(r: dict, auj: date) -> dict:
    return {**{k: v for k, v in r.items() if k != "user_id"}, "statut": statut(r, auj)}


@router.get("")
async def lister(user: dict = Depends(get_current_user)):
    rappels, cochees = await _charger(user["id"])
    m = _maintenant()
    prises = prises_du_jour(rappels, cochees, m)
    return {"rappels": sorted((_vue(r, m.date()) for r in rappels), key=lambda r: r["medicament"].lower()),
            "aujourdhui": prises, "total": len(rappels), "maximum": MAXIMUM, "a_prendre": a_prendre_compte(prises, m)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer(data: Traitement, user: dict = Depends(get_current_user)):
    donnees = _donnees(data)
    if await db.rappels_medicaments.count_documents({"user_id": user["id"]}) >= MAXIMUM:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Liste complète : {MAXIMUM} traitements au maximum")
    r = {"id": str(uuid.uuid4()), "user_id": user["id"], **donnees, "cree_le": _maintenant().isoformat()}
    await db.rappels_medicaments.insert_one(r.copy())
    return _vue(r, _maintenant().date())


@router.put("/{rappel_id}")
async def modifier(rappel_id: str, data: Traitement, user: dict = Depends(get_current_user)):
    res = await db.rappels_medicaments.update_one({"id": rappel_id, "user_id": user["id"]}, {"$set": _donnees(data)})
    if not res.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Traitement introuvable")
    return _vue(await db.rappels_medicaments.find_one({"id": rappel_id}, SANS_ID), _maintenant().date())


class Prise(BaseModel):
    heure: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    pris: bool = True


@router.post("/{rappel_id}/prises")
async def cocher(rappel_id: str, data: Prise, user: dict = Depends(get_current_user)):
    """Coche (pris = vrai) ou décoche la prise d'aujourd'hui à cette heure."""
    r = await db.rappels_medicaments.find_one({"id": rappel_id, "user_id": user["id"]}, SANS_ID)
    if not r or data.heure not in r["heures"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prise introuvable")
    cle = {"user_id": user["id"], "rappel_id": rappel_id, "jour": _maintenant().date().isoformat(), "heure": data.heure}
    if data.pris:
        await db.prises_medicaments.update_one(cle, {"$set": {**cle, "pris_le": _maintenant().isoformat()}}, upsert=True)
    else:
        await db.prises_medicaments.delete_one(cle)
    return {"ok": True, "pris": data.pris}


@router.delete("/{rappel_id}")
async def supprimer(rappel_id: str, user: dict = Depends(get_current_user)):
    res = await db.rappels_medicaments.delete_one({"id": rappel_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Traitement introuvable")
    await db.prises_medicaments.delete_many({"user_id": user["id"], "rappel_id": rappel_id})
    return {"ok": True}
