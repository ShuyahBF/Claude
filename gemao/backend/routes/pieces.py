"""PIÈCES DE RECHANGE : stock, seuil d'alerte, mouvements (entrées / sorties) tracés."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import SANS_ID, db
from outils import client_actif, exiger, maintenant, nouvel_id, utilisateur_courant

router = APIRouter(prefix="/pieces", tags=["pieces"], dependencies=[Depends(utilisateur_courant)])


class Piece(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    nom: str = Field(min_length=1, max_length=120)
    unite: str = "pièce"
    stock: float = Field(default=0, ge=0)
    seuil: float = Field(default=0, ge=0)          # alerte quand stock <= seuil
    prix_unitaire: float = Field(default=0, ge=0)  # FCFA


class Mouvement(BaseModel):
    quantite: float = Field(gt=0)
    sens: str = Field(pattern="^(entree|sortie)$")
    motif: Optional[str] = None


async def sortir_stock(cid: str, piece_id: str, quantite: float, motif: str) -> dict:
    """Sortie ATOMIQUE : le filtre « stock >= quantité » empêche tout stock négatif, même en concurrence."""
    # On relit l'état AVANT la mise à jour (return_document=False) et on calcule l'état après : plus robuste
    # qu'une relecture avec le même filtre « stock >= quantité », qui ne correspondrait plus une fois décrémenté.
    r = await db.pieces.find_one_and_update({"id": piece_id, "client_id": cid, "stock": {"$gte": quantite}},
                                            {"$inc": {"stock": -quantite}}, projection=SANS_ID, return_document=False)
    if not r:
        raise HTTPException(409, "Stock insuffisant ou pièce introuvable.")
    r["stock"] = r["stock"] - quantite
    await db.mouvements.insert_one({"id": nouvel_id(), "client_id": cid, "piece_id": piece_id, "sens": "sortie",
                                    "quantite": quantite, "motif": motif, "le": maintenant()})
    return r


@router.get("")
async def lister(cid: str = Depends(client_actif)):
    return [p async for p in db.pieces.find({"client_id": cid}, SANS_ID).sort("code", 1)]


@router.post("", status_code=201)
async def creer(p: Piece, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    if await db.pieces.find_one({"client_id": cid, "code": p.code.strip()}):
        raise HTTPException(409, "Ce code pièce existe déjà.")
    doc = {"id": nouvel_id(), "client_id": cid, **p.model_dump(), "cree_le": maintenant()}
    doc["code"] = p.code.strip()
    await db.pieces.insert_one(dict(doc))
    return doc


@router.post("/{pid}/mouvement")
async def mouvement(pid: str, m: Mouvement, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    if m.sens == "sortie":
        return await sortir_stock(cid, pid, m.quantite, m.motif or "Sortie manuelle")
    r = await db.pieces.find_one_and_update({"id": pid, "client_id": cid}, {"$inc": {"stock": m.quantite}},
                                            projection=SANS_ID, return_document=True)
    if not r:
        raise HTTPException(404, "Pièce introuvable.")
    await db.mouvements.insert_one({"id": nouvel_id(), "client_id": cid, "piece_id": pid, "sens": "entree",
                                    "quantite": m.quantite, "motif": m.motif or "Entrée", "le": maintenant()})
    return r


@router.get("/{pid}/mouvements")
async def mouvements(pid: str, cid: str = Depends(client_actif)):
    return [x async for x in db.mouvements.find({"client_id": cid, "piece_id": pid}, SANS_ID).sort("le", -1).limit(200)]
