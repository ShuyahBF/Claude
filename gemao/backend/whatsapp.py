"""Envoi de messages WhatsApp par la « Transmission WA Universelle » de SAWALI, signé avec la clé HMAC DU CLIENT.

Protocole identique à ZandGo : POST {LILUVINE_WA_URL}, corps {"id","to":"+22670123456","message","source"},
en-têtes X-Emetteur / X-Timestamp / X-Signature = HMAC-SHA256(clé, "<horodatage>.<corps brut>").
Un seul nouvel essai (MÊME id : pas de doublon chez SAWALI) sur erreur réseau ou 5xx, jamais sur 4xx.

RÈGLE 7 : jamais d'appel à SAWALI DANS la requête d'une page. Les routes appellent `en_arriere_plan(...)` et répondent
tout de suite ; le résultat est tracé dans `wa_messages` (« envoye » / « echec » / « sans_cle » / « sans_numero » / « non_configure »).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Optional, Set

import httpx

import hmac_sawali
from config import get_settings
from db import db
from outils import chiffres, maintenant, nouvel_id

log = logging.getLogger("gemao.whatsapp")
_transport: Optional[httpx.AsyncBaseTransport] = None   # les tests y mettent un faux SAWALI
_taches: Set[asyncio.Task] = set()                       # références gardées : Python n'efface pas une tâche en cours


async def envoyer(client: dict, telephone: str, texte: str, reference: str = "") -> str:
    """Envoie et trace. Retourne le statut. Ne lève JAMAIS d'exception."""
    s = get_settings()
    tel = chiffres(telephone)
    statut = "sans_numero"
    if tel:
        corps = {"id": str(uuid.uuid4()), "to": f"+{tel}", "message": texte, "source": s.liluvine_wa_source}
        # Corps sérialisé UNE fois : c'est ce texte exact qui est signé (et renvoyé tel quel au nouvel essai)
        brut = json.dumps(corps, ensure_ascii=False, separators=(",", ":"))
        if not s.liluvine_wa_url.strip():
            statut = "non_configure"
        else:
            statut = "echec"
            for _essai in (1, 2):
                entetes = hmac_sawali.entetes_signes(client, brut)
                if entetes is None:
                    statut = "sans_cle"
                    break
                try:
                    async with httpx.AsyncClient(timeout=s.sawali_delai_secondes, transport=_transport) as c:
                        r = await c.post(s.liluvine_wa_url.strip(), content=brut.encode("utf-8"), headers=entetes)
                except httpx.HTTPError as exc:
                    log.warning("WhatsApp : erreur réseau (%s)", type(exc).__name__)
                    continue
                if r.status_code >= 500:
                    continue
                statut = "envoye" if r.status_code < 400 else "echec"
                break
    await db.wa_messages.insert_one({"id": nouvel_id(), "client_id": client["id"], "sens": "sortant", "telephone": tel,
                                     "texte": texte, "reference": reference, "statut": statut, "le": maintenant()})
    return statut


def en_arriere_plan(coroutine) -> None:
    """Lance la coroutine sans l'attendre : la page répond tout de suite (règle 7)."""
    tache = asyncio.get_running_loop().create_task(coroutine)
    _taches.add(tache)
    tache.add_done_callback(_taches.discard)


async def _notifier(client_id: str, user_id: Optional[str], texte: str, reference: str) -> None:
    try:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        u = await db.users.find_one({"id": user_id, "client_id": client_id}, {"_id": 0}) if user_id else None
        if client and u and u.get("telephone") and client.get("wa_actif", True):
            await envoyer(client, u["telephone"], texte, reference)
    except Exception as exc:  # noqa: BLE001
        log.warning("Notification WhatsApp abandonnée (%s)", type(exc).__name__)


def notifier_utilisateur(client_id: str, user_id: Optional[str], texte: str, reference: str = "") -> None:
    """Prévient un utilisateur du client par WhatsApp (arrière-plan ; rien s'il n'a pas de numéro)."""
    if user_id:
        en_arriere_plan(_notifier(client_id, user_id, texte, reference))
