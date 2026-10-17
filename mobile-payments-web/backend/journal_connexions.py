"""Journal des sessions (lots 45 et 46) : liste des comptes de l'administrateur, fermeture après inactivité, déconnexion forcée.

Pour un développeur WinDev : une ligne par SESSION (un appareil connecté), identifiée par un « sid » glissé dans le jeton :
    id (= sid), user_id, ouverte_le, ip, activite_le, fermee_le, motif_fermeture
  - ouvrir(user_id, ip)      : crée la ligne à la connexion / l'inscription et renvoie le sid ;
  - noter_activite(sid)      : « l'utilisateur est actif » (le site le signale au plus toutes les 30 s) ;
  - verifier(sid, secondes)  : message de refus si la session est fermée ou inactive depuis trop longtemps, sinon None ;
  - fermer(user_id, sid)     : fermeture volontaire (bouton Déconnexion) ;
  - fermer_toutes(user_id, motif) : fermeture de TOUTES les sessions ouvertes du compte (déconnexion forcée, blocage).
Aucune erreur d'écriture ne remonte : un journal manquant ne doit jamais empêcher de se connecter.
Les lignes sont effacées automatiquement après 180 jours (index à durée de vie sur « ouverte_le »).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from db import db

logger = logging.getLogger("paiement_mobile.journal_connexions")

# Marge accordée au serveur au-delà de la durée d'inactivité du site (le site signale son activité toutes les 30 s)
MARGE_S = 60

MESSAGE_INACTIVITE = "Session expirée après inactivité. Reconnectez-vous."
MESSAGE_ADMIN = "Votre session a été fermée par l'administrateur. Reconnectez-vous."
MESSAGE_FERMEE = "Session fermée. Reconnectez-vous."


def _utc(d: datetime) -> datetime:
    """MongoDB rend des dates sans fuseau (UTC) : on les rend comparables."""
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


async def ouvrir(user_id: str, ip: str) -> Optional[str]:
    """Session ouverte : une ligne de journal + dernière connexion et dernière adresse IP sur le compte. Renvoie le sid."""
    maintenant = datetime.now(timezone.utc)
    sid = str(uuid.uuid4())
    try:
        await db.journal_connexions.insert_one({"id": sid, "user_id": user_id, "ouverte_le": maintenant, "activite_le": maintenant,
                                                "ip": ip or "", "fermee_le": None})
        # Une nouvelle connexion annule une déconnexion forcée en attente
        await db.users.update_one({"id": user_id}, {"$set": {"derniere_connexion": maintenant.isoformat(), "derniere_ip": ip or ""},
                                                    "$unset": {"deconnexion_a": ""}})
        return sid
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ouverture de session non journalisée (%s)", type(exc).__name__)
        return None


async def noter_activite(sid: Optional[str]) -> None:
    if not sid:
        return
    try:
        await db.journal_connexions.update_one({"id": sid, "fermee_le": None}, {"$set": {"activite_le": datetime.now(timezone.utc)}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Activité non notée (%s)", type(exc).__name__)


async def verifier(session: Optional[dict], secondes: int) -> Optional[str]:
    """Message de refus (401) si la session est fermée ou inactive depuis plus de `secondes` (+ marge) ; sinon None.
    `session` = ligne du journal (ou None pour un ancien jeton sans sid : toléré)."""
    if not session:
        return None
    if session.get("fermee_le"):
        return MESSAGE_ADMIN if session.get("motif_fermeture") == "admin" else MESSAGE_INACTIVITE if session.get("motif_fermeture") == "inactivite" else MESSAGE_FERMEE
    activite = session.get("activite_le")
    if activite and secondes and (datetime.now(timezone.utc) - _utc(activite)).total_seconds() > secondes + MARGE_S:
        await fermer_session(session["id"], "inactivite")
        return MESSAGE_INACTIVITE
    return None


async def fermer_session(sid: str, motif: str) -> None:
    try:
        await db.journal_connexions.update_one({"id": sid, "fermee_le": None}, {"$set": {"fermee_le": datetime.now(timezone.utc), "motif_fermeture": motif}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Fermeture de session non journalisée (%s)", type(exc).__name__)


async def fermer(user_id: str, sid: Optional[str] = None) -> None:
    """Déconnexion volontaire : ferme la session du jeton (sinon la dernière session ouverte du compte)."""
    try:
        if not sid:
            derniere = await db.journal_connexions.find_one({"user_id": user_id, "fermee_le": None}, sort=[("ouverte_le", -1)])
            sid = derniere["id"] if derniere else None
        if sid:
            await fermer_session(sid, "deconnexion")
        await db.users.update_one({"id": user_id}, {"$set": {"derniere_deconnexion": datetime.now(timezone.utc).isoformat()}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Fermeture de session non journalisée (%s)", type(exc).__name__)


async def fermer_toutes(user_id: str, motif: str) -> None:
    """Toutes les sessions ouvertes du compte sont fermées (déconnexion forcée par l'administrateur, blocage)."""
    maintenant = datetime.now(timezone.utc)
    try:
        await db.journal_connexions.update_many({"user_id": user_id, "fermee_le": None}, {"$set": {"fermee_le": maintenant, "motif_fermeture": motif}})
        await db.users.update_one({"id": user_id}, {"$set": {"derniere_deconnexion": maintenant.isoformat()}, "$unset": {"deconnexion_a": ""}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Fermeture des sessions non journalisée (%s)", type(exc).__name__)
