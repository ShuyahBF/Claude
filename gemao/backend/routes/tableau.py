"""TABLEAU DE BORD : indicateurs de maintenance du client (une seule requête côté écran)."""
from datetime import date

from fastapi import APIRouter, Depends

from db import SANS_ID, db
from outils import client_actif, exiger

router = APIRouter(prefix="/tableau", tags=["tableau"], dependencies=[Depends(exiger("admin", "technicien"))])


@router.get("")
async def tableau(cid: str = Depends(client_actif)):
    ots = [i async for i in db.interventions.find({"client_id": cid}, SANS_ID)]
    par_statut: dict = {}
    for o in ots:
        par_statut[o["statut"]] = par_statut.get(o["statut"], 0) + 1
    # MTTR = durée moyenne de réparation des pannes (correctives terminées)
    durees = [o["duree_heures"] for o in ots if o["statut"] == "terminee" and o["type"] == "corrective" and "duree_heures" in o]
    termines = [o for o in ots if o["statut"] == "terminee"]
    pieces = [p async for p in db.pieces.find({"client_id": cid}, SANS_ID)]
    equipements = [e async for e in db.equipements.find({"client_id": cid}, SANS_ID)]
    return {
        "interventions_par_statut": par_statut,
        "urgentes_ouvertes": sum(1 for o in ots if o["priorite"] == "urgente" and o["statut"] in ("demande", "planifiee", "en_cours")),
        "mttr_heures": round(sum(durees) / len(durees), 2) if durees else None,
        "cout_total": sum(o.get("cout_total", 0) for o in termines),
        "equipements": {"total": len(equipements), "en_panne": sum(1 for e in equipements if e["etat"] == "en_panne")},
        "pieces_sous_seuil": [{"id": p["id"], "code": p["code"], "nom": p["nom"], "stock": p["stock"], "seuil": p["seuil"]}
                              for p in pieces if p["stock"] <= p["seuil"]],
        "preventif_en_retard": await db.plans.count_documents({"client_id": cid, "actif": True, "prochaine_date": {"$lt": date.today().isoformat()}}),
    }
