"""Connexion MongoDB (Motor) avec préfixage automatique des collections.

`db.<nom>` -> collection `mpw_<nom>` (le cluster Atlas peut être partagé avec
adLyn / beAuthentik, chaque projet a son préfixe).
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from config import get_settings

# Projection par défaut : le champ interne "_id" de MongoDB n'est jamais renvoyé
SANS_ID = {"_id": 0}


class PrefixedDatabase:
    """Accès aux collections avec le préfixe du projet (db.users -> mpw_users)."""

    def __init__(self, database: AsyncIOMotorDatabase, prefix: str):
        self._database = database
        self._prefix = prefix

    def __getattr__(self, name: str) -> AsyncIOMotorCollection:
        return self._database[f"{self._prefix}{name}"]


def _make_client(mongo_url: str):
    # MONGO_URL=mongomock:// -> base EN MÉMOIRE (tests, essais sans réseau).
    # Jamais en production : rien n'est conservé à l'arrêt.
    if mongo_url.startswith("mongomock://"):
        from mongomock_motor import AsyncMongoMockClient

        return AsyncMongoMockClient()
    from motor.motor_asyncio import AsyncIOMotorClient

    return AsyncIOMotorClient(mongo_url)


_settings = get_settings()
_client = _make_client(_settings.mongo_url)
db = PrefixedDatabase(_client[_settings.mongo_db_name], _settings.mongo_collection_prefix)


async def ensure_indexes() -> None:
    """Index uniques et index de recherche (idempotent : relancé à chaque démarrage)."""
    # Utilisateurs : téléphone obligatoire et unique ; e-mail unique quand il est renseigné
    await db.users.create_index("id", unique=True)
    await db.users.create_index("telephone", unique=True)
    await db.users.create_index("email", unique=True, partialFilterExpression={"email": {"$type": "string"}})
    # Catalogue : un service par opérateur, pays et nom
    await db.services.create_index("id", unique=True)
    await db.services.create_index([("operateur", 1), ("pays", 1), ("nom", 1)], unique=True)
    # Annuaire des marchands : un code est unique par opérateur
    await db.marchands.create_index([("operateur", 1), ("code", 1)], unique=True)
    # Historique des paiements préparés, par utilisateur
    await db.paiements.create_index("id", unique=True)
    await db.paiements.create_index([("user_id", 1), ("cree_le", -1)])
    # Échecs de connexion (anti force brute)
    await db.echecs_connexion.create_index([("cle", 1), ("date", 1)])
