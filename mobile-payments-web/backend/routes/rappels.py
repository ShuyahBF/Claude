"""Résumé des rappels du jour (lot 36) : pastilles du menu latéral.

    GET /api/rappels/resume → {anniversaires, paiements, medicaments, total, evenements: [...]}
Les comptes et les événements sont lus EN PARALLÈLE (règle 7). Chaque nombre = ce qui demande une action maintenant.
`evenements` (lot 40) : ce qui doit déclencher un SON et une notification dans le navigateur ouvert ; chaque événement a une `cle`
unique (le navigateur n'alerte qu'une fois par clé et par jour) : {cle, type, titre, texte, lien}.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from datetime import datetime, timezone

from db import SANS_ID, db
from routes import anniversaires, rappels_medicaments, rappels_paiements
from securite import get_current_user

router = APIRouter(prefix="/rappels", tags=["Rappels"])


async def evenements_utilisateur(uid: str) -> list:
    """Événements à signaler MAINTENANT pour un utilisateur : prises d'abord, puis paiements, puis anniversaires.
    Utilisé par le résumé (navigateur ouvert) ET par la boucle des notifications push (application fermée)."""
    e_med, e_pai, e_ann = await asyncio.gather(rappels_medicaments.evenements(uid), rappels_paiements.evenements(uid), anniversaires.evenements(uid))
    return e_med + e_pai + e_ann


@router.get("/resume")
async def resume(user: dict = Depends(get_current_user)):
    uid = user["id"]
    ann, pai, med, evenements = await asyncio.gather(
        anniversaires.a_souhaiter(uid), rappels_paiements.a_traiter(uid), rappels_medicaments.a_prendre(uid), evenements_utilisateur(uid))
    return {"anniversaires": ann, "paiements": pai, "medicaments": med, "total": ann + pai + med, "evenements": evenements}


@router.get("/aujourdhui")
async def aujourdhui(user: dict = Depends(get_current_user)):
    """Contenu du widget « Aujourd'hui » de l'écran d'accueil (lot 41) : la prochaine prise, le prochain paiement, l'anniversaire
    le plus proche. Lectures en parallèle, aucun appel externe (la météo est lue à part par la page)."""
    uid = user["id"]
    maintenant = datetime.now(timezone.utc)
    rappels_med, cochees = await rappels_medicaments._charger(uid)
    paiements_docs, fiches_docs = await asyncio.gather(
        db.rappels_paiements.find({"user_id": uid}, SANS_ID).to_list(rappels_paiements.MAXIMUM + 5),
        db.anniversaires.find({"user_id": uid}, SANS_ID).to_list(anniversaires.MAXIMUM + 5))
    # Prises : celles du jour, la prochaine non cochée d'abord
    prises = rappels_medicaments.prises_du_jour(rappels_med, cochees, maintenant)
    restantes = [p for p in prises if not p["pris"]]
    # Paiements : les 2 plus proches (en retard compris)
    auj = maintenant.date()
    paiements = sorted((rappels_paiements.enrichir(d, auj) for d in paiements_docs), key=lambda r: r["dans_jours"])[:2]
    # Anniversaires : les 2 plus proches dans les 30 prochains jours
    fiches = sorted((anniversaires.enrichir({k: v for k, v in d.items() if k != "user_id"}, auj) for d in fiches_docs), key=lambda f: f["dans_jours"])
    return {"prises_total": len(prises), "prises_faites": len(prises) - len(restantes),
            "prochaine_prise": restantes[0] if restantes else None,
            "paiements": [{"libelle": r["libelle"], "montant": r.get("montant"), "dans_jours": r["dans_jours"], "etat": r["etat"]} for r in paiements],
            "anniversaires": [{"nom": f["nom"], "dans_jours": f["dans_jours"], "age": f["age"]} for f in fiches if f["dans_jours"] <= 30][:2]}
