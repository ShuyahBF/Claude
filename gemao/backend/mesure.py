"""MESURE DES APPELS (règle 7) : durée de chaque route, pour corriger la route réellement lente et jamais au hasard.
Garde en mémoire, par route : nombre, moyenne, 5 derniers, dernier, maximum. Objectif : < 1 s côté serveur."""
from __future__ import annotations

import time
from collections import deque
from typing import Dict

STATS: Dict[str, dict] = {}
SEUIL_LENT_S = 1.0


def noter(cle: str, secondes: float) -> None:
    s = STATS.setdefault(cle, {"nombre": 0, "total": 0.0, "max": 0.0, "derniers": deque(maxlen=5)})
    s["nombre"] += 1
    s["total"] += secondes
    s["max"] = max(s["max"], secondes)
    s["derniers"].append(secondes)


def rapport() -> list:
    """Routes triées de la plus lente (moyenne) à la plus rapide ; durées en millisecondes."""
    lignes = [{"route": k, "nombre": s["nombre"], "moyenne_ms": round(1000 * s["total"] / s["nombre"]),
               "derniers_ms": [round(1000 * d) for d in s["derniers"]], "dernier_ms": round(1000 * s["derniers"][-1]),
               "max_ms": round(1000 * s["max"]), "lente": s["total"] / s["nombre"] > SEUIL_LENT_S} for k, s in STATS.items()]
    return sorted(lignes, key=lambda x: -x["moyenne_ms"])


async def middleware(request, call_next):
    debut = time.perf_counter()
    reponse = await call_next(request)
    route = request.scope.get("route")
    if route is not None and request.url.path.startswith("/api") and not request.url.path.endswith("/performances"):
        noter(f"{request.method} {route.path}", time.perf_counter() - debut)
    return reponse
