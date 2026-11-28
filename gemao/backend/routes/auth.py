"""Connexion et profil."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import SANS_ID, db
from outils import utilisateur_courant
from securite import creer_jeton, verifier_mot_de_passe

router = APIRouter(prefix="/auth", tags=["auth"])


class Connexion(BaseModel):
    email: str
    mot_de_passe: str


def public(u: dict, client: dict | None = None) -> dict:
    """Utilisateur sans secret (jamais de mot de passe haché)."""
    return {k: u.get(k) for k in ("id", "nom", "email", "telephone", "role", "client_id")} | (
        {"client": {"id": client["id"], "nom": client["nom"], "code": client["code"]}} if client else {})


@router.post("/connexion")
async def connexion(c: Connexion):
    u = await db.users.find_one({"email": c.email.strip().lower(), "actif": True}, SANS_ID)
    # Même message pour « inconnu » et « mauvais mot de passe » : on ne révèle pas quels comptes existent
    if not u or not verifier_mot_de_passe(c.mot_de_passe, u["mdp"]):
        raise HTTPException(401, "E-mail ou mot de passe incorrect.")
    client = await db.clients.find_one({"id": u.get("client_id")}, SANS_ID) if u.get("client_id") else None
    if client and not client.get("actif", True):
        raise HTTPException(403, "Ce client est suspendu.")
    return {"jeton": creer_jeton(u["id"]), "utilisateur": public(u, client)}


@router.get("/moi")
async def moi(u: dict = Depends(utilisateur_courant)):
    client = await db.clients.find_one({"id": u.get("client_id")}, SANS_ID) if u.get("client_id") else None
    return public(u, client)
