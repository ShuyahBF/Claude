"""Lots 86 et 87 — portefeuilles : un électronique PAR OPÉRATEUR + un personnel ; relevés de solde, paiements (effectués / en cours),
retraits, dépôts, transferts entre opérateurs, courbe."""
import asyncio
from datetime import datetime, timedelta, timezone

from db import db
from routes import portefeuille as pf


def _service(client, h, operateur="Orange"):
    return next(s for s in client.get("/api/services", params={"operateur": operateur}, headers=h).json() if s["nom"] == "Paiement marchand")


def _payer(client, h, code, montant, statut=None, operateur="Orange"):
    p = client.post("/api/paiements", headers=h, json={"service_id": _service(client, h, operateur)["id"], "valeurs": {"code": code, "amount": str(montant)}}).json()
    if statut:
        client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": statut})
    return p


ORANGE, MOOV = "Orange", "Moov Africa"


def _releve(client, h, portefeuille, montant, operateur=None, jour=None):
    corps = {"portefeuille": portefeuille, "montant": montant, **({"operateur": operateur} if operateur else {}), **({"jour": jour} if jour else {})}
    return client.post("/api/portefeuille/releves", headers=h, json=corps)


def _soldes(client, h, **params):
    return client.get("/api/portefeuille", params=params, headers=h).json()


def test_un_portefeuille_par_operateur_paiements_effectues_et_en_cours(client, utilisateur):
    _, h, _ = utilisateur
    assert _soldes(client, h)["portefeuilles"] == []                               # rien de suivi tant qu'aucun solde n'est indiqué
    assert _releve(client, h, "electronique", 100000).status_code == 422             # l'opérateur est obligatoire
    assert _releve(client, h, "electronique", 100000, "Inconnu").status_code == 422   # et il doit exister dans le catalogue
    assert _releve(client, h, "electronique", 100000, ORANGE).status_code == 201
    assert _releve(client, h, "electronique", 40000, MOOV).status_code == 201
    assert _releve(client, h, "personnel", 10000).status_code == 201

    _payer(client, h, "90000001", 5000, "effectue")                                  # Orange, payé
    _payer(client, h, "90000002", 3000)                                              # Orange, préparé : « en cours »
    _payer(client, h, "90000003", 700, "abandonne")                                  # abandonné : ignoré
    _payer(client, h, "90000004", 2000, "effectue", MOOV)                            # Moov, payé : ne touche PAS le compte Orange
    s = _soldes(client, h)
    assert [p["nom"] for p in s["portefeuilles"]] == ["Électronique · Moov Africa", "Électronique · Orange", "Personnel"]
    o, m = s["soldes"][f"electronique:{ORANGE}"], s["soldes"][f"electronique:{MOOV}"]
    assert (o["montant"], o["en_cours"], o["apres_en_cours"]) == (95000, -3000, 92000)
    assert (m["montant"], m["en_cours"]) == (38000, 0)
    assert [x["montant"] for x in s["en_cours"]] == [3000] and s["en_cours"][0]["portefeuille"] == "Électronique · Orange"


def test_retrait_depot_transfert_entree_sortie(client, utilisateur):
    _, h, _ = utilisateur
    _releve(client, h, "electronique", 100000, ORANGE)
    _releve(client, h, "electronique", 20000, MOOV)
    _releve(client, h, "personnel", 10000)
    post = lambda **kw: client.post("/api/portefeuille/mouvements", headers=h, json=kw)   # noqa: E731
    # Retrait Orange : sortie du compte (frais compris), entrée dans la poche
    assert post(type="retrait", operateur=ORANGE, montant=20000, frais=500).status_code == 201
    s = _soldes(client, h)["soldes"]
    assert s[f"electronique:{ORANGE}"]["montant"] == 79500 and s["personnel"]["montant"] == 30000 and s[f"electronique:{MOOV}"]["montant"] == 20000
    # Dépôt sur Moov
    post(type="depot", operateur=MOOV, montant=5000)
    s = _soldes(client, h)["soldes"]
    assert s[f"electronique:{MOOV}"]["montant"] == 25000 and s["personnel"]["montant"] == 25000
    # Transfert Orange → Moov avec frais pris sur Orange
    assert post(type="transfert", operateur=ORANGE, vers=MOOV, montant=10000, frais=200).status_code == 201
    s = _soldes(client, h)["soldes"]
    assert s[f"electronique:{ORANGE}"]["montant"] == 69300 and s[f"electronique:{MOOV}"]["montant"] == 35000
    # Entrée sur un compte, sortie en espèces
    post(type="entree", portefeuille="electronique", operateur=MOOV, montant=1000, motif="Salaire")
    post(type="sortie", portefeuille="personnel", montant=1500, motif="Marché")
    s = _soldes(client, h)
    assert s["soldes"][f"electronique:{MOOV}"]["montant"] == 36000 and s["soldes"]["personnel"]["montant"] == 23500
    # Dernier point de la courbe = soldes actuels, un trait par portefeuille
    dernier = s["serie"][-1]
    assert dernier["jour"] == datetime.now(timezone.utc).date().isoformat()
    assert dernier["valeurs"] == {f"electronique:{MOOV}": 36000, f"electronique:{ORANGE}": 69300, "personnel": 23500}
    # Validations
    assert post(type="retrait", montant=10).status_code == 422                                            # opérateur manquant
    assert post(type="retrait", operateur=ORANGE, portefeuille="personnel", montant=10).status_code == 422
    assert post(type="transfert", operateur=ORANGE, vers=ORANGE, montant=10).status_code == 422          # même opérateur
    assert post(type="entree", montant=10).status_code == 422                                             # portefeuille manquant
    assert post(type="entree", portefeuille="electronique", montant=10).status_code == 422               # opérateur manquant
    assert post(type="sortie", portefeuille="personnel", operateur=ORANGE, montant=10).status_code == 422
    assert post(type="retrait", operateur=ORANGE, montant=0).status_code == 422


def test_ancien_portefeuille_general_reste_suivi(client, utilisateur):
    """Relevé du lot 86 (sans opérateur) : il reçoit les paiements des opérateurs qui n'ont pas leur propre portefeuille."""
    u, h, _ = utilisateur
    asyncio.run(db.reglages_plateforme.update_one({"_id": f"portefeuille:{u['id']}"}, {"$set": {"user_id": u["id"], "releves": [
        {"id": "ancien", "portefeuille": "electronique", "jour": datetime.now(timezone.utc).date().isoformat(),
         "at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(), "montant": 50000}], "mouvements": []}}, upsert=True))
    _payer(client, h, "90000011", 4000, "effectue")
    s = _soldes(client, h)
    assert s["portefeuilles"][0]["nom"] == "Électronique (général)" and s["soldes"]["electronique"]["montant"] == 46000
    # Dès que l'opérateur a son propre portefeuille, ses paiements s'y rangent
    _releve(client, h, "electronique", 30000, ORANGE)
    _payer(client, h, "90000012", 1000, "effectue")
    s = _soldes(client, h)["soldes"]
    assert s[f"electronique:{ORANGE}"]["montant"] == 29000 and s["electronique"]["montant"] == 46000


def test_nouveau_releve_donne_l_ecart_et_paiement_deja_compris(client, utilisateur):
    _, h, _ = utilisateur
    p = _payer(client, h, "90000021", 4000)                                                              # préparé AVANT le relevé
    _releve(client, h, "electronique", 50000, ORANGE)
    client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "effectue"})              # confirmé APRÈS : déjà compris
    assert _soldes(client, h)["soldes"][f"electronique:{ORANGE}"]["montant"] == 50000
    _payer(client, h, "90000022", 10000, "effectue")
    _releve(client, h, "electronique", 38000, ORANGE)                                                    # le calcul prévoyait 40 000
    _releve(client, h, "electronique", 39000, ORANGE)                                                    # ... puis +1 000 par rapport à 38 000
    s = _soldes(client, h)
    assert s["soldes"][f"electronique:{ORANGE}"]["montant"] == 39000
    assert sorted(r["ecart"] for r in s["releves"] if r["ecart"] is not None) == [-2000, 1000]


def test_courbe_sur_plusieurs_jours(client, utilisateur):
    _, h, _ = utilisateur
    hier3 = (datetime.now(timezone.utc).date() - timedelta(days=3)).isoformat()
    hier1 = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    _releve(client, h, "electronique", 100000, ORANGE, hier3)
    _releve(client, h, "personnel", 0, None, hier3)
    client.post("/api/portefeuille/mouvements", headers=h, json={"type": "retrait", "operateur": ORANGE, "montant": 30000, "jour": hier1})
    s = _soldes(client, h, jours=30)
    pts = {x["jour"]: x["valeurs"] for x in s["serie"]}
    assert len(s["serie"]) == 4                                                                           # de il y a 3 jours à aujourd'hui
    assert pts[hier3] == {f"electronique:{ORANGE}": 100000, "personnel": 0}
    assert pts[hier1] == {f"electronique:{ORANGE}": 70000, "personnel": 30000}
    futur = (datetime.now(timezone.utc).date() + timedelta(days=2)).isoformat()
    assert _releve(client, h, "personnel", 1, None, futur).status_code == 422


def test_suppression_et_confidentialite(client, utilisateur):
    _, h, _ = utilisateur
    _releve(client, h, "electronique", 1000, ORANGE)
    client.post("/api/portefeuille/mouvements", headers=h, json={"type": "entree", "portefeuille": "electronique", "operateur": ORANGE, "montant": 500})
    s = _soldes(client, h)
    assert s["soldes"][f"electronique:{ORANGE}"]["montant"] == 1500
    assert client.delete(f"/api/portefeuille/mouvements/{s['mouvements'][0]['id']}", headers=h).status_code == 200
    assert client.delete(f"/api/portefeuille/releves/{s['releves'][0]['id']}", headers=h).status_code == 200
    assert client.delete("/api/portefeuille/mouvements/inconnu", headers=h).status_code == 404
    assert _soldes(client, h)["portefeuilles"] == []
    assert client.get("/api/portefeuille").status_code == 401
