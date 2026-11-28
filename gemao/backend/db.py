"""Connexion MongoDB (Motor). `db.equipements` -> collection `gmao_equipements`.
MONGO_URL=mongomock:// -> base EN MÉMOIRE (tests) ; jamais en production."""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorDatabase

from config import get_settings

SANS_ID = {"_id": 0}   # projection : le « _id » interne de MongoDB n'est jamais renvoyé


class BaseAvecPrefixe:
    def __init__(self, base: AsyncIOMotorDatabase, prefixe: str):
        self._base, self._prefixe = base, prefixe

    def __getitem__(self, nom: str):
        return self._base[f"{self._prefixe}{nom}"]

    def __getattr__(self, nom: str):
        return self._base[f"{self._prefixe}{nom}"]


def _client(url: str):
    if url.startswith("mongomock://"):
        from mongomock_motor import AsyncMongoMockClient
        return AsyncMongoMockClient()
    from motor.motor_asyncio import AsyncIOMotorClient
    return AsyncIOMotorClient(url)


_s = get_settings()
db = BaseAvecPrefixe(_client(_s.mongo_url)[_s.mongo_db_name], _s.mongo_collection_prefix)


async def ensure_indexes() -> None:
    """Index d'unicité et de recherche (idempotent, relancé à chaque démarrage)."""
    await db.clients.create_index("id", unique=True)
    await db.clients.create_index("code", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    for coll in ("equipements", "pieces"):
        await db[coll].create_index([("client_id", 1), ("code", 1)], unique=True)
    await db.interventions.create_index([("client_id", 1), ("numero", 1)], unique=True)
    await db.interventions.create_index([("client_id", 1), ("statut", 1)])
    # Un message WhatsApp entrant n'est traité qu'une fois (rejeu d'un webhook = ignoré)
    await db.wa_vus.create_index([("client_id", 1), ("message_id", 1)], unique=True)
