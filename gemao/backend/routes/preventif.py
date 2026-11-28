"""MAINTENANCE PRÉVENTIVE : plans périodiques par équipement ; la génération crée les OT échus."""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import SANS_ID, db
from outils import client_actif, exiger, maintenant, nouvel_id, utilisateur_courant
from routes.interventions import Demande, creer_ot

router = APIRouter(prefix="/preventif", tags=["preventif"], dependencies=[Depends(utilisateur_courant)])


class Plan(BaseModel):
    equipement_id: str
    titre: str = Field(min_length=3)
    periodicite_jours: int = Field(ge=1, le=3650)
    prochaine_date: Optional[str] = None      # AAAA-MM-JJ ; aujourd'hui + périodicité si absent


@router.get("")
async def lister(cid: str = Depends(client_actif)):
    return [p async for p in db.plans.find({"client_id": cid, "actif": True}, SANS_ID).sort("prochaine_date", 1)]


@router.post("", status_code=201)
async def creer(p: Plan, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    eq = await db.equipements.find_one({"id": p.equipement_id, "client_id": cid}, SANS_ID)
    if not eq:
        raise HTTPException(404, "Équipement introuvable.")
    prochaine = p.prochaine_date or (date.today() + timedelta(days=p.periodicite_jours)).isoformat()
    doc = {"id": nouvel_id(), "client_id": cid, "equipement_id": eq["id"], "equipement_nom": eq["nom"], "titre": p.titre,
           "periodicite_jours": p.periodicite_jours, "prochaine_date": prochaine, "actif": True, "cree_le": maintenant()}
    await db.plans.insert_one(dict(doc))
    return doc


@router.post("/generer")
async def generer(cid: str = Depends(client_actif), u: dict = Depends(exiger("admin", "technicien"))):
    """Crée un OT préventif pour chaque plan échu (date <= aujourd'hui) puis avance la prochaine date.
    Rattrapage : la prochaine date repart d'AUJOURD'HUI (pas de rafale d'OT après une longue pause)."""
    aujourdhui = date.today().isoformat()
    crees = []
    async for plan in db.plans.find({"client_id": cid, "actif": True, "prochaine_date": {"$lte": aujourdhui}}, SANS_ID):
        # Réservation atomique du plan : deux clics simultanés ne créent pas deux OT
        suivante = (date.today() + timedelta(days=plan["periodicite_jours"])).isoformat()
        r = await db.plans.update_one({"id": plan["id"], "prochaine_date": plan["prochaine_date"]}, {"$set": {"prochaine_date": suivante}})
        if r.modified_count:
            ot = await creer_ot(cid, u["id"], Demande(equipement_id=plan["equipement_id"], titre=plan["titre"],
                                                       type="preventive", priorite="normale"), source="preventif")
            crees.append(ot["numero"])
    return {"crees": crees, "nombre": len(crees)}


@router.delete("/{pid}", status_code=204)
async def desactiver(pid: str, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    await db.plans.update_one({"id": pid, "client_id": cid}, {"$set": {"actif": False}})
