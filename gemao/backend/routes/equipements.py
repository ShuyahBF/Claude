"""ÉQUIPEMENTS (parc de machines / installations) d'un client, avec historique des interventions."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import SANS_ID, db
from outils import client_actif, exiger, maintenant, nouvel_id, utilisateur_courant

router = APIRouter(prefix="/equipements", tags=["equipements"], dependencies=[Depends(utilisateur_courant)])
ETATS = "^(en_service|en_panne|hors_service)$"


class Equipement(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    nom: str = Field(min_length=1, max_length=120)
    localisation: Optional[str] = None
    categorie: Optional[str] = None
    criticite: str = Field(default="normale", pattern="^(basse|normale|haute)$")
    etat: str = Field(default="en_service", pattern=ETATS)


class ModifEquipement(BaseModel):
    nom: Optional[str] = None
    localisation: Optional[str] = None
    categorie: Optional[str] = None
    criticite: Optional[str] = Field(default=None, pattern="^(basse|normale|haute)$")
    etat: Optional[str] = Field(default=None, pattern=ETATS)


@router.get("")
async def lister(cid: str = Depends(client_actif)):
    return [e async for e in db.equipements.find({"client_id": cid}, SANS_ID).sort("code", 1)]


@router.post("", status_code=201)
async def creer(e: Equipement, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    if await db.equipements.find_one({"client_id": cid, "code": e.code.strip()}):
        raise HTTPException(409, "Ce code équipement existe déjà.")
    doc = {"id": nouvel_id(), "client_id": cid, **e.model_dump(), "cree_le": maintenant()}
    doc["code"] = e.code.strip()
    await db.equipements.insert_one(dict(doc))
    return doc


@router.patch("/{eid}")
async def modifier(eid: str, m: ModifEquipement, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    champs = {k: v for k, v in m.model_dump().items() if v is not None}
    r = await db.equipements.find_one_and_update({"id": eid, "client_id": cid}, {"$set": champs},
                                                 projection=SANS_ID, return_document=True) if champs else None
    if not r:
        raise HTTPException(404, "Équipement introuvable.")
    return r


@router.get("/{eid}/historique")
async def historique(eid: str, cid: str = Depends(client_actif)):
    if not await db.equipements.find_one({"id": eid, "client_id": cid}, {"_id": 1}):
        raise HTTPException(404, "Équipement introuvable.")
    return [i async for i in db.interventions.find({"client_id": cid, "equipement_id": eid}, SANS_ID).sort("cree_le", -1)]
