"""PRÉSENCE AUPRÈS DE SAWALI (règle 4) : toute plateforme déployée déclare sa présence dès sa première version.
POST au démarrage puis toutes les 5 minutes ; en ARRIÈRE-PLAN, jamais bloquant, aucune erreur ne remonte,
aucun secret ni donnée client dans le signal. Suivi : SAWALI → Plateformes en temps réel."""
from __future__ import annotations

import asyncio
import logging
import platform
import socket
from datetime import datetime, timezone

import httpx

import lot
from config import get_settings

log = logging.getLogger("gemao.presence")
DEMARRE_LE = datetime.now(timezone.utc).isoformat()
_transport = None   # les tests y mettent un faux SAWALI


def corps() -> dict:
    return {"application": "GeMAO", "version": lot.VERSION, "deploye_le": DEMARRE_LE, "machine": socket.gethostname() or "render",
            "utilisateur": "service", "site": "api", "systeme": platform.system(), "demarre_le": DEMARRE_LE}


async def signaler() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5, transport=_transport) as c:
            r = await c.post(get_settings().presence_sawali_url, json=corps())
        return r.status_code < 400
    except Exception as exc:  # noqa: BLE001 — un signal raté ne doit jamais gêner le service
        log.warning("Présence SAWALI non transmise (%s)", type(exc).__name__)
        return False


async def boucle() -> None:
    while True:
        await signaler()
        await asyncio.sleep(300)
