"""Connexion par l'EMPREINTE du téléphone (application Android auRor).

Principe (règle 21 : sécurité avant tout) :
- L'utilisateur, déjà connecté dans l'application, ACTIVE l'empreinte en confirmant son mot de passe. Le serveur fabrique un secret
  aléatoire propre à CE téléphone, ne garde que son EMPREINTE (SHA-256) et rend le secret UNE SEULE fois.
- Le téléphone range ce secret dans son coffre Android (Keystore) : il ne ressort qu'après reconnaissance de l'empreinte.
- À la connexion suivante, le téléphone envoie (identifiant, secret) : le serveur compare l'empreinte et ouvre la session, sans mot de passe.
- Essais limités (comme le mot de passe), secrets annulés au changement de mot de passe ou à la désactivation du compte.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

import journal_connexions
import signal_connexion
from db import SANS_ID, db
from routes.auth import _session, _signaler_connexion
from securite import effacer_echecs, get_current_user, noter_echec, verifier_non_bloque, verify_password

router = APIRouter(prefix="/auth/empreinte", tags=["Empreinte"])


def _empreinte(secret: str) -> str:
    """Empreinte SHA-256 du secret (le secret fait 256 bits aléatoires : inutile de ralentir le calcul)."""
    return hashlib.sha256(secret.encode()).hexdigest()


class Activation(BaseModel):
    mot_de_passe: str = Field(min_length=1, max_length=128)
    appareil: str = Field(default="", max_length=80)       # simple libellé d'information (modèle du téléphone)


class Ouverture(BaseModel):
    id: str = Field(min_length=8, max_length=64)
    secret: str = Field(min_length=20, max_length=200)


@router.post("/activer")
async def activer(data: Activation, user: dict = Depends(get_current_user)):
    """Active l'empreinte pour ce téléphone : exige le mot de passe, rend {id, secret} (le secret n'est montré qu'ici)."""
    if not verify_password(data.mot_de_passe, user.get("password_hash", "")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mot de passe incorrect")
    secret = secrets.token_urlsafe(32)
    fiche = {"id": uuid.uuid4().hex, "empreinte": _empreinte(secret), "appareil": data.appareil.strip(),
             "cree_le": datetime.now(timezone.utc).isoformat()}
    # 5 téléphones au plus : le plus ancien est remplacé
    liste = (user.get("empreintes_connexion") or [])[-4:] + [fiche]
    await db.users.update_one({"id": user["id"]}, {"$set": {"empreintes_connexion": liste}})
    return {"id": fiche["id"], "secret": secret}


@router.post("")
async def ouvrir(data: Ouverture, request: Request, response: Response):
    """Ouvre la session avec (id, secret) rangés dans le coffre du téléphone. Même message d'erreur quel que soit l'échec."""
    cle = f"empreinte:{data.id}"
    await verifier_non_bloque(cle)
    user = await db.users.find_one({"empreintes_connexion.id": data.id}, SANS_ID)
    fiche = next((f for f in (user or {}).get("empreintes_connexion", []) if f.get("id") == data.id), None)
    if not user or user.get("desactive") or not fiche or not hmac.compare_digest(fiche["empreinte"], _empreinte(data.secret)):
        await noter_echec(cle)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Empreinte non reconnue : connectez-vous avec votre mot de passe")
    await effacer_echecs(cle)
    _signaler_connexion(request, user, "/connexion-empreinte")
    sid = await journal_connexions.ouvrir(user["id"], signal_connexion.adresse_ip(request))
    return _session(response, user, sid)


@router.post("/deverrouiller")
async def deverrouiller_par_empreinte(data: Ouverture, user: dict = Depends(get_current_user)):
    """Écran verrouillé (lot 64) : l'empreinte du téléphone remplace le mot de passe. Le téléphone envoie (id, secret) rangés dans son coffre (le secret ne sort
    qu'après reconnaissance de l'empreinte) ; le serveur vérifie qu'ils appartiennent bien au compte CONNECTÉ. Mêmes essais limités que le déverrouillage par mot de passe."""
    cle = f"verrou:{user['id']}"
    await verifier_non_bloque(cle)
    fiche = next((f for f in (user.get("empreintes_connexion") or []) if f.get("id") == data.id), None)
    if not fiche or not hmac.compare_digest(fiche["empreinte"], _empreinte(data.secret)):
        await noter_echec(cle)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Empreinte non reconnue : tapez votre mot de passe")
    await effacer_echecs(cle)
    return {"ok": True}


@router.post("/retirer")
async def retirer(user: dict = Depends(get_current_user)):
    """Retire toutes les empreintes enregistrées du compte (tous les téléphones)."""
    await db.users.update_one({"id": user["id"]}, {"$unset": {"empreintes_connexion": ""}})
    return {"ok": True}
