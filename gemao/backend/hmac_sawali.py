"""CLÉS HMAC SAWALI — une clé PAR CLIENT, pour WhatsApp.

Même schéma de signature que les autres plateformes du propriétaire (auRor, signal_connexion.py) :
    X-Emetteur  : identifiant de l'émetteur déclaré dans SAWALI (ex. « gemao-alpha »)
    X-Timestamp : secondes depuis 1970
    X-Signature : HMAC-SHA256(clé, "<horodatage>.<corps brut>") en hexadécimal

DEUX SENS, la même clé du client :
  - SORTANT (GeMAO -> SAWALI) : `entetes_signes` signe l'envoi d'un message WhatsApp ;
  - ENTRANT (SAWALI -> GeMAO) : `verifier` contrôle la signature d'un webhook (message reçu),
    avec fenêtre anti-rejeu et comparaison en temps constant.

La clé en clair n'est montrée QU'UNE FOIS (création / rotation). En base : chiffrée (Fernet) + empreinte
courte pour la reconnaître. Jamais dans les journaux, jamais renvoyée par l'API.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from typing import Dict, Optional

from config import get_settings
from securite import chiffrer, dechiffrer


def generer_cle() -> str:
    """Nouvelle clé aléatoire de 256 bits (64 caractères hexadécimaux)."""
    return secrets.token_hex(32)


def empreinte(cle: str) -> str:
    """Repère non réversible affiché dans l'écran (« …a1b2c3d4 ») pour reconnaître une clé sans la montrer."""
    return hashlib.sha256(cle.encode()).hexdigest()[:8]


def signer(cle: str, horodatage: str, corps: str) -> str:
    return hmac.new(cle.encode(), f"{horodatage}.{corps}".encode(), hashlib.sha256).hexdigest()


def champs_cle(cle: str) -> Dict[str, str]:
    """Champs à enregistrer dans le document du client."""
    return {"cle_hmac_chiffree": chiffrer(cle), "cle_hmac_empreinte": empreinte(cle)}


def cle_du_client(client: dict) -> Optional[str]:
    jeton = client.get("cle_hmac_chiffree")
    return dechiffrer(jeton) if jeton else None


def entetes_signes(client: dict, corps: str) -> Optional[Dict[str, str]]:
    """En-têtes d'un appel sortant vers SAWALI, ou None si le client n'a pas (encore) de clé."""
    cle = cle_du_client(client)
    if not cle:
        return None
    ts = str(int(time.time()))
    return {"Content-Type": "application/json", "X-Emetteur": client["emetteur"],
            "X-Timestamp": ts, "X-Signature": signer(cle, ts, corps)}


def verifier(client: dict, horodatage: str, signature: str, corps: str, maintenant: Optional[float] = None) -> bool:
    """Webhook entrant : signature valide ET horodatage récent (anti-rejeu). Jamais d'exception."""
    try:
        cle = cle_du_client(client)
        if not cle or not signature:
            return False
        ecart = abs((maintenant if maintenant is not None else time.time()) - int(horodatage))
        if ecart > get_settings().tolerance_horodatage_secondes:
            return False
        return hmac.compare_digest(signer(cle, horodatage, corps), signature.strip().lower())
    except Exception:  # noqa: BLE001
        return False
