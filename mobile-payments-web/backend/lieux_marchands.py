"""Lieux des marchands (lot 49) : où se trouve le marchand d'un code, appris des paiements des comptes qui ont activé leur géolocalisation.

Pour un développeur WinDev :
  - collection « marchands_lieux » : une ligne par (opérateur, code marchand) avec la position MOYENNE des paiements préparés sur place
    {lat, lon, n (nombre de relevés), maj} ; la position d'un UTILISATEUR n'est jamais gardée ici (seulement celle du marchand) ;
  - noter(...) : ajoute un relevé. Un relevé trop imprécis (> 150 m) est ignoré ; quand le lieu est déjà bien établi (3 relevés ou plus),
    un relevé à plus de 200 m de la moyenne est ignoré aussi (paiement préparé ailleurs que chez le marchand) ;
  - proches(lat, lon, rayon) : TOUS les marchands dans le rayon réglé par l'administrateur (50 m par défaut, lot 102) ; la position demandée
    n'est pas enregistrée.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List

from db import SANS_ID, db

PRECISION_MAX_M = 150      # relevé plus imprécis : ignoré
ECART_MAX_M = 200          # relevé trop loin d'un lieu bien établi : ignoré
ETABLI_APRES = 3           # nombre de relevés à partir duquel le lieu est « établi »
RAYON_PROCHE_M = 50        # rayon par défaut (réglable par l'administrateur, lot 102) de la liste « marchands près de vous »
MARCHANDS_MAX = 50         # marchands listés au plus
DEGRE_M = 111_000.0        # mètres par degré de latitude


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en mètres entre deux points (formule de haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(a))


async def noter(operateur: str, code: str, lat: float, lon: float, precision: float | None) -> bool:
    """Ajoute un relevé de position pour ce marchand. Renvoie True s'il a été retenu."""
    if precision is not None and precision > PRECISION_MAX_M:
        return False
    ligne = await db.marchands_lieux.find_one({"operateur": operateur, "code": code}, SANS_ID)
    maintenant = datetime.now(timezone.utc).isoformat()
    if not ligne:
        await db.marchands_lieux.insert_one({"operateur": operateur, "code": code, "lat": lat, "lon": lon, "n": 1, "maj": maintenant})
        return True
    if ligne["n"] >= ETABLI_APRES and distance_m(ligne["lat"], ligne["lon"], lat, lon) > ECART_MAX_M:
        return False
    n = ligne["n"] + 1
    await db.marchands_lieux.update_one({"operateur": operateur, "code": code}, {"$set": {
        "lat": (ligne["lat"] * ligne["n"] + lat) / n, "lon": (ligne["lon"] * ligne["n"] + lon) / n, "n": n, "maj": maintenant}})
    return True


async def proches(lat: float, lon: float, rayon_m: float | None = None) -> List[Dict[str, Any]]:
    """TOUS les marchands connus dans le rayon (le plus proche d'abord, 50 au plus), avec leur intitulé s'il est connu.
    rayon_m : rayon réglé par l'administrateur (Admin → Comptes, 50 m par défaut) ; RAYON_PROCHE_M si non fourni."""
    rayon = float(rayon_m or RAYON_PROCHE_M)
    d_lat = rayon / DEGRE_M
    d_lon = rayon / (DEGRE_M * max(0.2, math.cos(math.radians(lat))))
    lignes = await db.marchands_lieux.find({"lat": {"$gte": lat - d_lat, "$lte": lat + d_lat},
                                            "lon": {"$gte": lon - d_lon, "$lte": lon + d_lon}}, SANS_ID).to_list(200)
    trouves = []
    for l in lignes:
        d = distance_m(lat, lon, l["lat"], l["lon"])
        if d <= rayon:
            trouves.append({**l, "distance_m": round(d)})
    trouves.sort(key=lambda x: x["distance_m"])
    trouves = trouves[:MARCHANDS_MAX]
    # Intitulés lus EN BLOC (une seule requête pour tous les marchands trouvés)
    if trouves:
        docs = await db.marchands.find({"$or": [{"operateur": t["operateur"], "code": t["code"]} for t in trouves]}, SANS_ID).to_list(MARCHANDS_MAX)
        noms = {(m["operateur"], m["code"]): m for m in docs}
        for t in trouves:
            m = noms.get((t["operateur"], t["code"])) or {}
            t["libelle"], t["service_id"] = m.get("libelle"), m.get("service_id")        # lot 106 : service de paiement propre au marchand
    return [{"operateur": t["operateur"], "code": t["code"], "libelle": t.get("libelle"), "service_id": t.get("service_id"),
             "distance_m": t["distance_m"]} for t in trouves]
