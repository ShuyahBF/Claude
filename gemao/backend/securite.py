"""Mots de passe (scrypt), sessions (JWT) et chiffrement des clés HMAC au repos (Fernet)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
import uuid
from typing import Any, Dict, Optional

import jwt
from cryptography.fernet import Fernet, InvalidToken

from config import get_settings


# --- Mots de passe : scrypt avec sel aléatoire, jamais stockés en clair ---------------------------
def hacher_mot_de_passe(mdp: str) -> str:
    sel = os.urandom(16)
    h = hashlib.scrypt(mdp.encode(), salt=sel, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${sel.hex()}${h.hex()}"


def verifier_mot_de_passe(mdp: str, stocke: str) -> bool:
    try:
        _, sel, h = stocke.split("$")
        calc = hashlib.scrypt(mdp.encode(), salt=bytes.fromhex(sel), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except Exception:  # noqa: BLE001
        return False


# --- Sessions -------------------------------------------------------------------------------------
def creer_jeton(user_id: str) -> str:
    s = get_settings()
    return jwt.encode({"sub": user_id, "exp": int(time.time()) + s.jwt_heures * 3600, "jti": uuid.uuid4().hex},
                      s.jwt_secret, algorithm="HS256")


def lire_jeton(jeton: str) -> Optional[str]:
    try:
        return jwt.decode(jeton, get_settings().jwt_secret, algorithms=["HS256"]).get("sub")
    except jwt.PyJWTError:
        return None


# --- Chiffrement des clés HMAC des clients (on doit pouvoir les relire pour signer) --------------
def _fernet() -> Fernet:
    s = get_settings()
    graine = (s.cle_maitre or s.jwt_secret).encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"gemao-hmac|" + graine).digest()))


def chiffrer(texte: str) -> str:
    return _fernet().encrypt(texte.encode()).decode()


def dechiffrer(jeton: str) -> Optional[str]:
    try:
        return _fernet().decrypt(jeton.encode()).decode()
    except InvalidToken:
        return None
