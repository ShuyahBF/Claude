"""Authentification : mots de passe, jeton de session (cookie HttpOnly), rôles.

Rôles :
  - utilisateur : prépare ses paiements, voit son historique, gère son profil ;
  - admin       : gère en plus le catalogue des services USSD.

L'identité de l'utilisateur est TOUJOURS lue depuis le jeton signé (côté
serveur), jamais depuis un paramètre envoyé par le navigateur.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from passlib.context import CryptContext

from config import get_settings
from db import SANS_ID, db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# En-tête exigé sur les écritures authentifiées par cookie : un site tiers ne
# peut pas l'ajouter sans l'accord CORS du serveur (protection CSRF).
ENTETE_CSRF = "x-paiement-mobile"
METHODES_ECRITURE = {"POST", "PUT", "PATCH", "DELETE"}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str, version: int = 0) -> str:
    """Jeton signé ; `v` = version de session (l'augmenter déconnecte tous les appareils)."""
    s = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=s.jwt_expires_minutes)
    return jwt.encode({"sub": user_id, "v": version, "exp": expire}, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def _cookie_securise() -> bool:
    s = get_settings()
    choix = (s.session_cookie_securise or "auto").lower()
    if choix in ("true", "false"):
        return choix == "true"
    return s.public_site_url.startswith("https://")


def poser_cookie_session(response: Response, jeton: str) -> None:
    """Cookie de session HttpOnly (illisible par le JavaScript du site)."""
    s = get_settings()
    securise = _cookie_securise()
    response.set_cookie(s.session_cookie_nom, jeton, max_age=s.jwt_expires_minutes * 60, httponly=True,
                        secure=securise, samesite="none" if securise else "lax", path="/")


def effacer_cookie_session(response: Response) -> None:
    s = get_settings()
    securise = _cookie_securise()
    response.delete_cookie(s.session_cookie_nom, path="/", secure=securise, httponly=True,
                           samesite="none" if securise else "lax")


def utilisateur_public(user: dict) -> dict:
    """Fiche renvoyée au navigateur : jamais le hash du mot de passe."""
    return {k: user.get(k) for k in ("id", "nom", "prenom", "telephone", "email", "role", "cree_le")}


async def get_current_user(request: Request) -> dict:
    """Utilisateur connecté, lu depuis le cookie de session (ou l'en-tête Bearer pour les tests/outils)."""
    s = get_settings()
    jeton = request.cookies.get(s.session_cookie_nom)
    par_cookie = bool(jeton)
    entete = request.headers.get("authorization", "")
    if not jeton and entete.lower().startswith("bearer "):
        jeton = entete[7:].strip()
    if not jeton:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connectez-vous pour continuer")
    # Écriture authentifiée par cookie : l'en-tête anti-CSRF est obligatoire
    if par_cookie and request.method in METHODES_ECRITURE and ENTETE_CSRF not in request.headers:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requête refusée")
    donnees = decode_access_token(jeton)
    if not donnees:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée : reconnectez-vous")
    user = await db.users.find_one({"id": donnees.get("sub")}, SANS_ID)
    if not user or user.get("desactive") or int(user.get("version_session", 0)) != int(donnees.get("v", 0)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée : reconnectez-vous")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réservé à l'administrateur")
    return user


# ---------------------------------------------------------------------------
# Anti force brute : trop d'échecs sur un même identifiant -> blocage temporaire
# ---------------------------------------------------------------------------
async def verifier_non_bloque(cle: str) -> None:
    s = get_settings()
    depuis = datetime.now(timezone.utc) - timedelta(minutes=s.fenetre_echecs_minutes)
    n = await db.echecs_connexion.count_documents({"cle": cle, "date": {"$gte": depuis}})
    if n >= s.max_echecs_connexion:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Trop d'essais : réessayez dans {s.fenetre_echecs_minutes} minutes")


async def noter_echec(cle: str) -> None:
    await db.echecs_connexion.insert_one({"cle": cle, "date": datetime.now(timezone.utc)})


async def effacer_echecs(cle: str) -> None:
    await db.echecs_connexion.delete_many({"cle": cle})
