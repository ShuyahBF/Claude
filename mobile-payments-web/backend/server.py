"""Point d'entrée FastAPI — Raccourcis Paiement Mobile (version web).

Lancement local : uvicorn server:app --reload
Documentation interactive de l'API : http://localhost:8000/docs
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from catalogue_defaut import initialiser_catalogue
from config import get_settings
from db import db, ensure_indexes
import presence_sawali
import version_plateforme
from signal_connexion import adresse_ip
from routes import android, auth, catalogue, marchands, paiements, presence
import support_sawali
from securite import hash_password
from ussd import normaliser_email

settings = get_settings()
log = logging.getLogger("paiement_mobile")

app = FastAPI(title="Raccourcis Paiement Mobile API", version=str(version_plateforme.VERSION or "dev"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,  # cookie de session
    allow_methods=["*"],
    allow_headers=["*"],
)

# Toutes les routes sous « /api » : site web (auth, catalogue, marchands, paiements),
# application Android (« /api/android/… ») et visites du site (« /api/presence/visite »).
api = APIRouter(prefix="/api")
# support_sawali : discussion avec le support SAWALI (icône de la page de connexion, lot 24)
for module in (auth, catalogue, marchands, paiements, android, presence, support_sawali):
    api.include_router(module.router)


@api.get("/health")
async def health(request: Request):
    """Santé du serveur (utilisée par Render et par l'état « Serveur actif » de la page de connexion).
    Renvoie aussi l'adresse IP du visiteur (affichée en gris au-dessus de « Serveur actif »)."""
    return {"ok": True, "ip": adresse_ip(request)}


@api.get("/version")
async def version():
    """Version, lot, commit et date de déploiement de l'API (source unique : frontend/src/version.js)."""
    return version_plateforme.infos_version()


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
    # Catalogue USSD de départ chargé automatiquement si la base est vide (aucune commande manuelle)
    n = await initialiser_catalogue()
    if n:
        log.info("Catalogue de départ inséré : %s services", n)
    # Signal de présence auprès de SAWALI (au démarrage puis toutes les 5 minutes), en tâche de fond
    _taches_fond.add(asyncio.get_running_loop().create_task(presence_sawali.boucle_presence()))


# Référence des tâches de fond (sinon Python pourrait les effacer en cours de route)
_taches_fond: set = set()
