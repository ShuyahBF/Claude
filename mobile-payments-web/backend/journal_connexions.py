"""Journal des ouvertures et fermetures de session (lot 45), pour la liste des comptes de l'administrateur.

Pour un développeur WinDev : deux « procédures globales » appelées par la connexion, l'inscription et la déconnexion :
  - ouvrir(user_id, ip)  : ajoute une ligne (ouverte le… depuis l'adresse…) et mémorise la dernière connexion sur la fiche du compte ;
  - fermer(user_id)      : date de fermeture de la dernière session encore ouverte (déconnexion volontaire).
Une session qui expire sans déconnexion garde « fermeture inconnue » (le site ne le sait pas).
Aucune erreur ne remonte : un journal manquant ne doit jamais empêcher de se connecter.
Les lignes du journal sont effacées automatiquement après 180 jours (index à durée de vie).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db import db

logger = logging.getLogger("paiement_mobile.journal_connexions")


async def ouvrir(user_id: str, ip: str) -> None:
    """Session ouverte : une ligne de journal + dernière connexion et dernière adresse IP sur le compte."""
    maintenant = datetime.now(timezone.utc)
    try:
        await db.journal_connexions.insert_one({"id": str(uuid.uuid4()), "user_id": user_id, "ouverte_le": maintenant, "ip": ip or "", "fermee_le": None})
        await db.users.update_one({"id": user_id}, {"$set": {"derniere_connexion": maintenant.isoformat(), "derniere_ip": ip or ""}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ouverture de session non journalisée (%s)", type(exc).__name__)


async def fermer(user_id: str) -> None:
    """Déconnexion volontaire : ferme la dernière session ouverte du compte."""
    maintenant = datetime.now(timezone.utc)
    try:
        derniere = await db.journal_connexions.find_one({"user_id": user_id, "fermee_le": None}, sort=[("ouverte_le", -1)])
        if derniere:
            await db.journal_connexions.update_one({"id": derniere["id"]}, {"$set": {"fermee_le": maintenant}})
        await db.users.update_one({"id": user_id}, {"$set": {"derniere_deconnexion": maintenant.isoformat()}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Fermeture de session non journalisée (%s)", type(exc).__name__)
