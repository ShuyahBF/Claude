"""Point d'entrée FastAPI — Raccourcis Paiement Mobile (version web).

Lancement local : uvicorn server:app --reload
Documentation interactive de l'API : http://localhost:8000/docs
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from catalogue_defaut import initialiser_catalogue
from config import get_settings
from db import db, ensure_indexes
from routes import auth, catalogue, marchands, paiements
from securite import hash_password
from ussd import normaliser_email

settings = get_settings()
log = logging.getLogger("paiement_mobile")

app = FastAPI(title="Raccourcis Paiement Mobile API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,  # cookie de session
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
for module in (auth, catalogue, marchands, paiements):
    api.include_router(module.router)


@api.get("/health")
async def health():
    return {"ok": True}


app.include_router(api)


async def ensure_admin() -> None:
    """Crée (ou remet administrateur) le compte ADMIN_EMAIL / ADMIN_PASSWORD s'ils sont définis."""
    if not (settings.admin_email and settings.admin_password):
        return
    email = normaliser_email(settings.admin_email)
    existant = await db.users.find_one({"email": email})
    if existant:
        if existant.get("role") != "admin":
            await db.users.update_one({"email": email}, {"$set": {"role": "admin"}})
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "nom": "Administrateur", "prenom": "", "email": email,
        # Téléphone fictif unique (l'administrateur se connecte avec son e-mail)
        "telephone": f"+000{uuid.uuid4().int % 10**9:09d}", "role": "admin",
        "password_hash": hash_password(settings.admin_password), "version_session": 0,
        "cree_le": datetime.now(timezone.utc).isoformat(),
    })


@app.on_event("startup")
async def au_demarrage():
    await ensure_indexes()
    await ensure_admin()
    n = await initialiser_catalogue()
    if n:
        log.info("Catalogue de départ inséré : %s services", n)
