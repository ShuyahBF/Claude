"""Point d'entrée FastAPI — GeMAO (GMAO multi-clients). Lancement : uvicorn server:app --reload"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db import db, ensure_indexes
from outils import maintenant, nouvel_id
from routes import auth, clients, equipements, interventions, pieces, preventif, tableau, utilisateurs, whatsapp
from securite import hacher_mot_de_passe

settings = get_settings()
log = logging.getLogger("gemao")


@asynccontextmanager
async def demarrage(_app: FastAPI):
    await ensure_indexes()
    # Super-administrateur créé une seule fois à partir des variables d'environnement (jamais dans le code)
    if settings.admin_email and settings.admin_password and not await db.users.find_one({"email": settings.admin_email.lower()}):
        await db.users.insert_one({"id": nouvel_id(), "client_id": None, "nom": "Super administrateur",
                                   "email": settings.admin_email.lower(), "role": "super_admin", "telephone": None,
                                   "mdp": hacher_mot_de_passe(settings.admin_password), "actif": True, "cree_le": maintenant()})
    yield


app = FastAPI(title="GeMAO API", version="1.0.0", lifespan=demarrage)
app.add_middleware(CORSMiddleware, allow_origins=settings.frontend_origins, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api")
for module in (auth, clients, utilisateurs, equipements, pieces, interventions, preventif, tableau, whatsapp):
    api.include_router(module.router)


@api.get("/health")
async def health():
    return {"ok": True}


app.include_router(api)
