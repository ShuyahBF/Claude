"""Utilisateurs d'un client (administrateur du client : crée techniciens et demandeurs)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import SANS_ID, db
from outils import client_actif, exiger, maintenant, nouvel_id
from routes.auth import public
from securite import hacher_mot_de_passe

router = APIRouter(prefix="/utilisateurs", tags=["utilisateurs"])


class NouvelUtilisateur(BaseModel):
    nom: str
    email: str
    telephone: Optional[str] = None
    role: str = Field(pattern="^(admin|technicien|demandeur)$")
    mot_de_passe: str = Field(min_length=8)


@router.get("")
async def lister(cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    # Les techniciens ont besoin de la liste pour les affectations
    return [public(u) async for u in db.users.find({"client_id": cid}, SANS_ID).sort("nom", 1)]


@router.post("", status_code=201)
async def creer(n: NouvelUtilisateur, cid: str = Depends(client_actif), _=Depends(exiger("admin"))):
    email = n.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Cet e-mail est déjà utilisé.")
    u = {"id": nouvel_id(), "client_id": cid, "nom": n.nom.strip(), "email": email, "telephone": n.telephone,
         "role": n.role, "mdp": hacher_mot_de_passe(n.mot_de_passe), "actif": True, "cree_le": maintenant()}
    await db.users.insert_one(dict(u))
    return public(u)


@router.delete("/{uid}", status_code=204)
async def desactiver(uid: str, cid: str = Depends(client_actif), moi: dict = Depends(exiger("admin"))):
    if uid == moi["id"]:
        raise HTTPException(400, "Vous ne pouvez pas désactiver votre propre compte.")
    r = await db.users.update_one({"id": uid, "client_id": cid}, {"$set": {"actif": False}})
    if not r.matched_count:
        raise HTTPException(404, "Utilisateur introuvable.")
