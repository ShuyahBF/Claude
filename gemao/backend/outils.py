"""Petits outils communs : identifiants, dates, numérotation, accès aux données du client connecté."""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request

from db import SANS_ID, db
from securite import lire_jeton

ROLES = ("super_admin", "admin", "technicien", "demandeur")


def nouvel_id() -> str:
    return uuid.uuid4().hex


def maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


def slug(texte: str) -> str:
    """« Société Alpha » -> « societe-alpha » (code court d'un client, sans accents)."""
    t = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def chiffres(tel: Optional[str]) -> str:
    """Numéro réduit aux chiffres (« +226 70 12 34 56 » -> « 22670123456 »)."""
    return re.sub(r"\D", "", tel or "")


async def prochain_numero(client_id: str, nom: str, prefixe: str) -> str:
    """Numéro séquentiel PAR CLIENT et par année : OT-2026-0001 (compteur atomique, sans doublon)."""
    annee = datetime.now(timezone.utc).year
    r = await db.compteurs.find_one_and_update(
        {"client_id": client_id, "nom": f"{nom}-{annee}"}, {"$inc": {"n": 1}}, upsert=True, return_document=True)
    return f"{prefixe}-{annee}-{r['n']:04d}"


# --- Utilisateur connecté et client actif ---------------------------------------------------------
async def utilisateur_courant(authorization: str = Header(default="")) -> dict:
    jeton = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    uid = lire_jeton(jeton) if jeton else None
    u = await db.users.find_one({"id": uid, "actif": True}, SANS_ID) if uid else None
    if not u:
        raise HTTPException(401, "Session absente ou expirée.")
    return u


def exiger(*roles: str):
    """Dépendance FastAPI : l'utilisateur doit avoir l'un des rôles (super_admin passe toujours)."""
    async def _dep(u: dict = Depends(utilisateur_courant)) -> dict:
        if u["role"] != "super_admin" and u["role"] not in roles:
            raise HTTPException(403, "Droits insuffisants.")
        return u
    return _dep


async def client_actif(request: Request, u: dict = Depends(utilisateur_courant)) -> str:
    """Identifiant du client dont on traite les données. Un utilisateur est enfermé dans SON client ;
    le super-administrateur choisit le client avec l'en-tête X-Client-Id."""
    if u["role"] == "super_admin":
        cid = request.headers.get("x-client-id", "")
        if not cid or not await db.clients.find_one({"id": cid}, {"_id": 1}):
            raise HTTPException(400, "Super-administrateur : choisissez un client (en-tête X-Client-Id).")
        return cid
    return u["client_id"]
