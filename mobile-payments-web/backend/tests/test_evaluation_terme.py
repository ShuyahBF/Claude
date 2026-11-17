"""Évaluation d'un terme quelconque : comptage des occurrences, puis statistiques mensuelles."""
from datetime import datetime, timezone

from db import db


def _paiement(user, cree_le, montant, statut, nom, op="Orange"):
    return {"id": f"p-{cree_le}-{nom}", "user_id": user["id"], "cree_le": cree_le, "operateur": op, "service_nom": "Paiement marchand",
            "montant": montant, "statut": statut, "nom_beneficiaire": nom, "valeurs": {}, "code_ussd": "*144#"}


def test_evaluation_par_mois(client, utilisateur):
    user, h, _ = utilisateur
    for d in (_paiement(user, "2026-09-03T10:00:00", 1000, "effectue", "Pharmacie Wend"),
              _paiement(user, "2026-09-20T10:00:00", 2000, "effectue", "Pharmacie Wend"),
              _paiement(user, "2026-10-02T10:00:00", 4000, "effectue", "Pharmacie Wend"),
              _paiement(user, "2026-10-05T10:00:00", 500, "abandonne", "Pharmacie Wend"),
              _paiement(user, "2026-10-06T10:00:00", 700, "effectue", "Boutique Zida")):
        client.portal.call(db.paiements.insert_one, d)
    r = client.get("/api/paiements/evaluation-terme", params={"terme": "pharmacie"}, headers=h).json()
    assert r["occurrences"] == 4 and "par_mois" not in r                      # comptage seul
    e = client.get("/api/paiements/evaluation-terme", params={"terme": "pharmacie", "evaluer": True}, headers=h).json()
    assert e["payes"] == 3 and e["non_payes"] == 1 and e["montant_total"] == 7000
    assert [(m["mois"], m["nombre"], m["montant"]) for m in e["par_mois"]] == [("2026-09", 2, 3000), ("2026-10", 1, 4000)]
    assert e["plus_gros"] == 4000 and e["moyenne_mensuelle"] == 3500
    assert client.get("/api/paiements/evaluation-terme", params={"terme": "introuvable"}, headers=h).json()["occurrences"] == 0
