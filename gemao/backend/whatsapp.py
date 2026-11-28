"""Envoi de messages WhatsApp via SAWALI, signé avec la clé HMAC DU CLIENT.

Corps JSON : {"a": "22670123456", "message": "…", "reference": "OT-2026-0001"}
L'envoi ne lève jamais d'exception (un WhatsApp raté ne doit pas bloquer une intervention) :
le résultat est tracé dans la collection `wa_messages` (« envoye » / « echec » / « sans_cle »).
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import httpx

import hmac_sawali
from config import get_settings
from db import db
from outils import chiffres, maintenant, nouvel_id

log = logging.getLogger("gemao.whatsapp")
_transport: Optional[httpx.AsyncBaseTransport] = None   # les tests y mettent un faux SAWALI


async def envoyer(client: dict, telephone: str, texte: str, reference: str = "") -> str:
    """Retourne le statut : envoye | echec | sans_cle | sans_numero."""
    tel = chiffres(telephone)
    statut = "sans_numero"
    if tel:
        corps = json.dumps({"a": tel, "message": texte, "reference": reference}, ensure_ascii=False)
        entetes = hmac_sawali.entetes_signes(client, corps)
        if entetes is None:
            statut = "sans_cle"
        else:
            s = get_settings()
            try:
                async with httpx.AsyncClient(timeout=s.sawali_delai_secondes, transport=_transport) as c:
                    r = await c.post(f"{s.sawali_url.rstrip('/')}{s.sawali_chemin_envoi}",
                                     content=corps.encode(), headers=entetes)
                statut = "envoye" if r.status_code < 400 else "echec"
            except Exception as exc:  # noqa: BLE001
                log.warning("WhatsApp non envoyé (%s)", type(exc).__name__)
                statut = "echec"
    await db.wa_messages.insert_one({"id": nouvel_id(), "client_id": client["id"], "sens": "sortant", "telephone": tel,
                                     "texte": texte, "reference": reference, "statut": statut, "le": maintenant()})
    return statut


async def notifier_utilisateur(client_id: str, user_id: Optional[str], texte: str, reference: str = "") -> None:
    """Prévient un utilisateur du client par WhatsApp s'il a un numéro (sinon rien)."""
    if not user_id:
        return
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    u = await db.users.find_one({"id": user_id, "client_id": client_id}, {"_id": 0})
    if client and u and u.get("telephone") and client.get("wa_actif", True):
        await envoyer(client, u["telephone"], texte, reference)
