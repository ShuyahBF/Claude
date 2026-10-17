"""Notifications « push » web de Paiement Mobile (lot 41) : alertes envoyées par le SERVEUR, application fermée.

Pour un développeur WinDev : c'est un petit module d'envoi, écrit ici SANS bibliothèque externe fragile
(seulement `cryptography` et `PyJWT`), selon les standards du Web Push :
  - RFC 8292 (VAPID) : le serveur prouve son identité au service de notification du navigateur (Google, Mozilla, Apple)
    avec une paire de clés ; la clé PUBLIQUE est donnée au navigateur lors de l'abonnement ;
  - RFC 8291 (aes128gcm) : le contenu du message est CHIFFRÉ de bout en bout (seul l'appareil de l'utilisateur le lit).
Les clés VAPID sont créées automatiquement au premier besoin et gardées dans la base (collection « reglages ») :
rien à saisir, aucun secret dans le code, la clé privée n'est jamais affichée ni renvoyée.
Le test du chiffrement reprend l'exemple officiel de la RFC 8291 (annexe A).
"""
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx
import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from db import SANS_ID, db

CONTACT_VAPID = "mailto:contact@sawalismartsystems.com"
DELAI_ENVOI = 10.0
TAILLE_ENREGISTREMENT = 4096

# Transport HTTP de remplacement (tests) : None en production
_transport: Optional[httpx.AsyncBaseTransport] = None


def b64u(octets: bytes) -> str:
    return base64.urlsafe_b64encode(octets).rstrip(b"=").decode()


def b64u_decode(texte: str) -> bytes:
    return base64.urlsafe_b64decode(texte + "=" * (-len(texte) % 4))


def _public_octets(cle_publique: ec.EllipticCurvePublicKey) -> bytes:
    """Point public P-256 non compressé (65 octets)."""
    return cle_publique.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


# ---------------------------------------------------------------------------
# Chiffrement du message (RFC 8291, aes128gcm)
# ---------------------------------------------------------------------------
def chiffrer(clair: bytes, p256dh: str, auth: str, *, privee_serveur: Optional[ec.EllipticCurvePrivateKey] = None,
             sel: Optional[bytes] = None) -> bytes:
    """Corps chiffré à envoyer au service de notification. `p256dh` et `auth` : valeurs de l'abonnement du navigateur
    (base64url). Les deux derniers paramètres ne servent qu'aux tests (valeurs imposées par l'exemple de la RFC)."""
    ua_public_octets, secret_auth = b64u_decode(p256dh), b64u_decode(auth)
    ua_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public_octets)
    privee = privee_serveur or ec.generate_private_key(ec.SECP256R1())
    as_public_octets = _public_octets(privee.public_key())
    partage = privee.exchange(ec.ECDH(), ua_public)
    # 1. Clé de base : secret ECDH + secret d'authentification de l'abonnement
    ikm = HKDF(algorithm=hashes.SHA256(), length=32, salt=secret_auth,
               info=b"WebPush: info\x00" + ua_public_octets + as_public_octets).derive(partage)
    # 2. Clé de chiffrement et nonce propres à ce message (sel aléatoire)
    sel = sel or os.urandom(16)
    cle = HKDF(algorithm=hashes.SHA256(), length=16, salt=sel, info=b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(algorithm=hashes.SHA256(), length=12, salt=sel, info=b"Content-Encoding: nonce\x00").derive(ikm)
    # 3. Un seul enregistrement : le message suivi du délimiteur 0x02 (dernier enregistrement)
    chiffre = AESGCM(cle).encrypt(nonce, clair + b"\x02", None)
    return sel + TAILLE_ENREGISTREMENT.to_bytes(4, "big") + bytes([len(as_public_octets)]) + as_public_octets + chiffre


def dechiffrer(corps: bytes, privee_ua: ec.EllipticCurvePrivateKey, auth: str) -> bytes:
    """Opération inverse, réservée aux TESTS (c'est le navigateur qui déchiffre en vrai)."""
    sel, longueur_id = corps[:16], corps[20]
    as_public_octets, chiffre = corps[21:21 + longueur_id], corps[21 + longueur_id:]
    as_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_public_octets)
    partage = privee_ua.exchange(ec.ECDH(), as_public)
    ua_public_octets = _public_octets(privee_ua.public_key())
    ikm = HKDF(algorithm=hashes.SHA256(), length=32, salt=b64u_decode(auth),
               info=b"WebPush: info\x00" + ua_public_octets + as_public_octets).derive(partage)
    cle = HKDF(algorithm=hashes.SHA256(), length=16, salt=sel, info=b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(algorithm=hashes.SHA256(), length=12, salt=sel, info=b"Content-Encoding: nonce\x00").derive(ikm)
    clair = AESGCM(cle).decrypt(nonce, chiffre, None)
    return clair[:clair.rindex(b"\x02")]


# ---------------------------------------------------------------------------
# Clés VAPID (créées une fois, gardées dans la base)
# ---------------------------------------------------------------------------
async def cles_vapid() -> Tuple[str, str]:
    """(clé privée PEM, clé publique base64url). Créées au premier appel ; jamais renvoyées au navigateur sauf la publique."""
    doc = await db.reglages.find_one({"_id": "vapid"})
    if doc:
        return doc["privee_pem"], doc["publique"]
    privee = ec.generate_private_key(ec.SECP256R1())
    pem = privee.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    publique = b64u(_public_octets(privee.public_key()))
    # Création concurrente (2 démarrages) : la première écriture gagne, on relit toujours la gagnante
    await db.reglages.update_one({"_id": "vapid"}, {"$setOnInsert": {"privee_pem": pem, "publique": publique}}, upsert=True)
    doc = await db.reglages.find_one({"_id": "vapid"})
    return doc["privee_pem"], doc["publique"]


def en_tetes_vapid(endpoint: str, privee_pem: str, publique: str, maintenant: Optional[float] = None) -> Dict[str, str]:
    """En-tête Authorization « vapid t=<jeton signé>, k=<clé publique> » (RFC 8292) ; le jeton vise le site du service de notification."""
    url = urlparse(endpoint)
    jeton = jwt.encode({"aud": f"{url.scheme}://{url.netloc}", "exp": int((maintenant or time.time()) + 12 * 3600), "sub": CONTACT_VAPID},
                       privee_pem, algorithm="ES256")
    return {"Authorization": f"vapid t={jeton}, k={publique}"}


# ---------------------------------------------------------------------------
# Envoi
# ---------------------------------------------------------------------------
class AbonnementMort(Exception):
    """Le service de notification dit que l'abonnement n'existe plus (404/410) : il faut le supprimer."""


async def envoyer(abonnement: Dict[str, Any], message: Dict[str, Any]) -> None:
    """Envoie `message` (dict JSON : titre, texte, lien, cle) à un appareil. Lève AbonnementMort si l'appareil est désabonné ;
    toute autre panne lève une exception simple (l'appelant l'ignore : on réessaiera à la minute suivante)."""
    privee_pem, publique = await cles_vapid()
    corps = chiffrer(json.dumps(message, ensure_ascii=False).encode("utf-8"), abonnement["p256dh"], abonnement["auth"])
    entetes = {**en_tetes_vapid(abonnement["endpoint"], privee_pem, publique), "Content-Encoding": "aes128gcm",
               "Content-Type": "application/octet-stream", "TTL": "3600", "Urgency": "high"}
    async with httpx.AsyncClient(timeout=DELAI_ENVOI, transport=_transport) as client:
        r = await client.post(abonnement["endpoint"], content=corps, headers=entetes)
    if r.status_code in (404, 410):
        raise AbonnementMort(abonnement["endpoint"])
    if r.status_code >= 400:
        raise RuntimeError(f"service de notification : HTTP {r.status_code}")
