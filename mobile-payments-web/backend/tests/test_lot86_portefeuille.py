"""Lot 86 — portefeuilles électronique et personnel : relevés de solde, paiements (effectués / en cours), retraits, courbe."""
import asyncio
from datetime import datetime, timedelta, timezone

from db import db
from routes import portefeuille as pf


def _service(client, h):
    return next(s for s in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if s["nom"] == "Paiement marchand")


def _payer(client, h, code, montant, statut=None):
    p = client.post("/api/paiements", headers=h, json={"service_id": _service(client, h)["id"], "valeurs": {"code": code, "amount": str(montant)}}).json()
    if statut:
        client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": statut})
    return p


def test_solde_paiements_effectues_en_cours_et_retrait(client, utilisateur):
    _, h, _ = utilisateur
    # Aucun relevé : rien n'est calculé
    assert client.get("/api/portefeuille", headers=h).json()["soldes"]["electronique"]["renseigne"] is False
    assert client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "montant": 100000}).status_code == 201
    assert client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "personnel", "montant": 10000}).status_code == 201

    _payer(client, h, "90000001", 5000, "effectue")               # payé : baisse le solde
    _payer(client, h, "90000002", 3000)                           # préparé : « en cours »
    _payer(client, h, "90000003", 700, "abandonne")               # abandonné : ignoré
    s = client.get("/api/portefeuille", headers=h).json()
    e = s["soldes"]["electronique"]
    assert (e["montant"], e["en_cours"], e["apres_en_cours"]) == (95000, -3000, 92000)
    assert [x["montant"] for x in s["en_cours"]] == [3000]

    # Retrait : sortie du compte (avec frais), entrée dans la poche
    assert client.post("/api/portefeuille/mouvements", headers=h, json={"type": "retrait", "montant": 20000, "frais": 500}).status_code == 201
    s = client.get("/api/portefeuille", headers=h).json()
    assert s["soldes"]["electronique"]["montant"] == 74500 and s["soldes"]["personnel"]["montant"] == 30000
    # Dépôt inverse
    client.post("/api/portefeuille/mouvements", headers=h, json={"type": "depot", "montant": 5000})
    s = client.get("/api/portefeuille", headers=h).json()
    assert s["soldes"]["electronique"]["montant"] == 79500 and s["soldes"]["personnel"]["montant"] == 25000
    # Entrée / sortie sur un portefeuille choisi
    client.post("/api/portefeuille/mouvements", headers=h, json={"type": "sortie", "portefeuille": "personnel", "montant": 1500, "motif": "Marché"})
    assert client.get("/api/portefeuille", headers=h).json()["soldes"]["personnel"]["montant"] == 23500
    # Dernier point de la courbe = solde actuel
    assert client.get("/api/portefeuille", headers=h).json()["serie"][-1] == {"jour": datetime.now(timezone.utc).date().isoformat(), "electronique": 79500, "personnel": 23500}


def test_nouveau_releve_remplace_le_calcul_et_donne_l_ecart(client, utilisateur):
    _, h, _ = utilisateur
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "montant": 50000})
    _payer(client, h, "90000011", 10000, "effectue")
    # Le calcul prévoit 40 000 ; l'utilisateur déclare 38 000 (des frais oubliés) → écart de −2 000
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "montant": 38000})
    s = client.get("/api/portefeuille", headers=h).json()
    assert s["soldes"]["electronique"]["montant"] == 38000
    assert sorted(r["ecart"] for r in s["releves"] if r["ecart"] is not None) == [-2000]
    # Un autre relevé plus tard : le plus récent sert de départ, l'historique des recalages est gardé (écart +1 000 par rapport au calcul)
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "montant": 39000})
    s = client.get("/api/portefeuille", headers=h).json()
    assert s["soldes"]["electronique"]["montant"] == 39000
    assert sorted(r["ecart"] for r in s["releves"] if r["portefeuille"] == "electronique" and r["ecart"] is not None) == [-2000, 1000]


def test_un_paiement_deja_compris_dans_le_releve_n_est_pas_compte_deux_fois(client, utilisateur):
    _, h, _ = utilisateur
    p = _payer(client, h, "90000021", 4000)                       # préparé AVANT le relevé
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "montant": 60000})
    client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "effectue"})       # confirmé APRÈS : déjà dans les 60 000
    assert client.get("/api/portefeuille", headers=h).json()["soldes"]["electronique"]["montant"] == 60000


def test_courbe_sur_plusieurs_jours_et_validations(client, utilisateur):
    _, h, _ = utilisateur
    hier3 = (datetime.now(timezone.utc).date() - timedelta(days=3)).isoformat()
    hier1 = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "jour": hier3, "montant": 100000})
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "personnel", "jour": hier3, "montant": 0})
    client.post("/api/portefeuille/mouvements", headers=h, json={"type": "retrait", "montant": 30000, "jour": hier1})
    s = client.get("/api/portefeuille", params={"jours": 30}, headers=h).json()
    pts = {x["jour"]: x for x in s["serie"]}
    assert len(s["serie"]) == 4                                           # de il y a 3 jours à aujourd'hui
    assert pts[hier3]["electronique"] == 100000 and pts[hier3]["personnel"] == 0
    assert pts[hier1]["electronique"] == 70000 and pts[hier1]["personnel"] == 30000
    # Validations
    futur = (datetime.now(timezone.utc).date() + timedelta(days=2)).isoformat()
    assert client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "personnel", "jour": futur, "montant": 1}).status_code == 422
    assert client.post("/api/portefeuille/mouvements", headers=h, json={"type": "entree", "montant": 10}).status_code == 422          # portefeuille manquant
    assert client.post("/api/portefeuille/mouvements", headers=h, json={"type": "retrait", "portefeuille": "personnel", "montant": 10}).status_code == 422
    assert client.post("/api/portefeuille/mouvements", headers=h, json={"type": "retrait", "montant": 0}).status_code == 422


def test_suppression_et_confidentialite(client, utilisateur):
    _, h, _ = utilisateur
    client.post("/api/portefeuille/releves", headers=h, json={"portefeuille": "electronique", "montant": 1000})
    client.post("/api/portefeuille/mouvements", headers=h, json={"type": "entree", "portefeuille": "electronique", "montant": 500, "motif": "Salaire"})
    s = client.get("/api/portefeuille", headers=h).json()
    assert s["soldes"]["electronique"]["montant"] == 1500
    assert client.delete(f"/api/portefeuille/mouvements/{s['mouvements'][0]['id']}", headers=h).status_code == 200
    assert client.delete(f"/api/portefeuille/releves/{s['releves'][0]['id']}", headers=h).status_code == 200
    assert client.delete("/api/portefeuille/mouvements/inconnu", headers=h).status_code == 404
    assert client.get("/api/portefeuille", headers=h).json()["soldes"]["electronique"]["renseigne"] is False
    assert client.get("/api/portefeuille").status_code == 401
