"""Lot 13 — CONNEXIONS ET VISITES SIGNALÉES À SAWALI (alerte WhatsApp du propriétaire).

Pour un développeur WinDev :
  - ce module est l'équivalent d'une procédure globale « SignalerConnexion » appelée par :
      * la connexion (et l'inscription) au site,
      * l'enregistrement du profil par l'app Android (POST /api/android/users),
      * la première page vue d'un visiteur non connecté (POST /api/presence/visite) ;
  - il envoie à SAWALI un POST SIGNÉ :
        POST <SAWALI>/api/webhook/plateforme-connexion
        en-têtes X-Emetteur, X-Timestamp (epoch s), X-Signature = HMAC-SHA256(clé, "<horodatage>.<corps brut>")
  - l'envoi part EN ARRIÈRE-PLAN (comme un thread WinDev) : la réponse n'attend jamais SAWALI ;
  - aucune erreur ne remonte : SAWALI injoignable, lent (> 5 s) ou refusant = une ligne dans le journal ;
  - si la clé LILUVINE_WA_HMAC n'est pas saisie dans Render, rien n'est envoyé ;
  - le corps ne contient AUCUN secret : ni mot de passe, ni jeton.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

import httpx
from fastapi import Request

from config import get_settings

logger = logging.getLogger("paiement_mobile.signal_connexion")

CHEMIN = "/api/webhook/plateforme-connexion"   # ajouté après l'adresse de SAWALI
DELAI_SECONDES = 5                              # SAWALI lent = signal abandonné, sans conséquence

# Robots évidents (moteurs de recherche, aperçus de liens…) : leurs « visites » ne sont jamais signalées
RE_ROBOT = re.compile(
    r"bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python-|httpx|"
    r"go-http|java/|headless|lighthouse|pingdom|uptime|monitor", re.IGNORECASE)

# Transport HTTP de remplacement (les tests y mettent un faux serveur SAWALI) ; None = réseau réel
_transport: Optional[httpx.AsyncBaseTransport] = None

# Tâches d'arrière-plan en cours : on garde une référence pour que Python ne les efface pas avant la fin
_taches: Set[asyncio.Task] = set()


# ---------------------------------------------------------------------------
# Petites fonctions utilitaires
# ---------------------------------------------------------------------------
def cle() -> str:
    """Clé HMAC (secrète : jamais affichée ni renvoyée)."""
    return (get_settings().liluvine_wa_hmac or "").strip()


def configure() -> bool:
    """Vrai si la clé SAWALI est saisie (sinon aucun signal n'est envoyé)."""
    return bool(cle())


def signer(secret: str, horodatage: str, corps: str) -> str:
    """Signature hexadécimale HMAC-SHA256 de « <horodatage>.<corps brut> »."""
    return hmac.new(secret.encode("utf-8"), f"{horodatage}.{corps}".encode("utf-8"), hashlib.sha256).hexdigest()


def est_robot(agent: Optional[str]) -> bool:
    """Vrai si le navigateur annoncé (user-agent) est vide ou ressemble à un robot."""
    return not agent or bool(RE_ROBOT.search(agent))


def adresse_ip(request: Request) -> str:
    """Adresse IP réelle (Render place l'adresse d'origine en tête de X-Forwarded-For)."""
    transmise = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return transmise or (request.client.host if request.client else "")


def url_site() -> str:
    """Première adresse de FRONTEND_ORIGIN (adresse publique du site)."""
    origines = get_settings().frontend_origins
    return origines[0] if origines else ""


def telephone_sans_plus(telephone: Optional[str]) -> Optional[str]:
    """« +22670000000 » → « 22670000000 » (format attendu par SAWALI)."""
    return re.sub(r"\D", "", telephone or "") or None


# ---------------------------------------------------------------------------
# Construction et envoi du signal
# ---------------------------------------------------------------------------
def construire_corps(type_signal: str, ip: str, agent: str, utilisateur: Optional[str] = None,
                     telephone: Optional[str] = None, role: Optional[str] = None, visiteur: Optional[str] = None,
                     page: Optional[str] = None) -> Dict[str, Any]:
    """Corps JSON attendu par SAWALI (champs vides = null). Aucun secret n'y figure."""
    return {
        "type": type_signal,
        "le": datetime.now(timezone.utc).isoformat(),
        "ip": ip or "",
        "utilisateur": utilisateur or None,
        "telephone": telephone_sans_plus(telephone),
        "role": role or None,
        "visiteur": visiteur or None,
        "url_site": url_site(),
        "page": (page or "").split("?")[0][:200] or None,   # jamais le « ?… » de l'adresse
        "agent": (agent or "")[:300],
    }


async def envoyer(corps: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """POST signé vers SAWALI. Renvoie la réponse JSON, ou None en cas de problème (JAMAIS d'exception)."""
    try:
        if not configure():
            return None
        s = get_settings()
        brut = json.dumps(corps, ensure_ascii=False)
        ts = str(int(time.time()))
        entetes = {"Content-Type": "application/json", "X-Emetteur": s.liluvine_wa_emetteur or "paiementmobile",
                   "X-Timestamp": ts, "X-Signature": signer(cle(), ts, brut)}
        async with httpx.AsyncClient(timeout=DELAI_SECONDES, transport=_transport) as client:
            r = await client.post(f"{s.sawali_url.rstrip('/')}{CHEMIN}", content=brut.encode("utf-8"),
                                  headers=entetes)
        if r.status_code >= 400:
            logger.warning("Signal %s refusé par SAWALI (HTTP %s)", corps.get("type"), r.status_code)
            return None
        try:
            return r.json()
        except ValueError:
            return {}
    except Exception as exc:  # noqa: BLE001 — un signal raté ne doit jamais gêner la connexion
        logger.warning("Signal %s non transmis à SAWALI (%s)", corps.get("type"), type(exc).__name__)
        return None


def signaler(type_signal: str, request: Optional[Request] = None, *, utilisateur: Optional[str] = None,
             telephone: Optional[str] = None, role: Optional[str] = None, visiteur: Optional[str] = None,
             page: Optional[str] = None) -> None:
    """Lance le signal en arrière-plan et rend la main AUSSITÔT (aucune attente, aucune exception).
    type_signal : « connexion » (compte connecté, site ou app Android) ou « visite » (visiteur anonyme)."""
    try:
        if not configure():
            return                                  # SAWALI non configuré : rien à faire
        ip = adresse_ip(request) if request is not None else ""
        agent = (request.headers.get("user-agent") or "") if request is not None else ""
        corps = construire_corps(type_signal, ip, agent, utilisateur, telephone, role, visiteur, page)
        tache = asyncio.get_running_loop().create_task(envoyer(corps))
        _taches.add(tache)
        tache.add_done_callback(_taches.discard)   # libérée une fois terminée
    except Exception as exc:  # noqa: BLE001
        logger.warning("Signal %s non lancé (%s)", type_signal, type(exc).__name__)
