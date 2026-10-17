"""Lot 22 — historique filtré et statistiques : période, opérateur, recherche de bénéficiaire, Top 10, cloisonnement."""
import asyncio

from db import db
from routes.paiements import beneficiaire, calculer_statistiques


def _service(client, h, operateur, nom):
    return next(s for s in client.get("/api/services", params={"operateur": operateur}, headers=h).json() if s["nom"] == nom)


def _payer(client, h, operateur, nom, valeurs, statut=None):
    s = _service(client, h, operateur, nom)
    r = client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": valeurs})
    assert r.status_code == 201, r.text
    p = r.json()
    if statut:
        client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": statut})
    return p


def _dater(client, paiement_id, iso):
    """Force la date d'un paiement (la base de test est en mémoire)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(db.paiements.update_one({"id": paiement_id}, {"$set": {"cree_le": iso}}))
    finally:
        loop.close()


def test_beneficiaire_marchand_ou_numero():
    assert beneficiaire({"marchand": {"code": "445566", "libelle": "Boutique Étoile"}}) == {"libelle": "Boutique Étoile", "code": "445566"}
    assert beneficiaire({"marchand": {"code": "445566", "libelle": None}}) == {"libelle": "445566", "code": "445566"}
    assert beneficiaire({"valeurs": {"phone": "70112233", "amount": "500"}}) == {"libelle": "70112233", "code": "70112233"}


def test_statistiques_pures_top_et_operateurs():
    def p(i, op, montant, statut, code="A"):
        return {"id": str(i), "operateur": op, "service_nom": "Paiement marchand", "montant": montant, "statut": statut,
                "cree_le": f"2026-10-{10 + i:02d}T10:00:00+00:00", "marchand": {"code": code, "libelle": f"Boutique {code}"}, "valeurs": {}}
    liste = [p(1, "Orange", 1000, "effectue"), p(2, "Orange", 5000, "effectue", "B"), p(3, "Moov Africa", 700, "abandonne"),
             p(4, "Orange", 9000, "prepare", "B")]
    st = calculer_statistiques(liste)
    # Seuls les paiements « Payé » sont comptés ; préparés et abandonnés le sont à part
    assert st["totaux"]["nombre"] == 2 and st["totaux"]["operations"] == 4 and st["totaux"]["payes"] == 2
    assert st["totaux"]["prepares"] == 1 and st["totaux"]["abandonnes"] == 1 and st["totaux"]["taux_payes"] == 50
    assert st["totaux"]["montant_total"] == 6000 and st["totaux"]["plus_gros"] == 5000 and st["totaux"]["montant_paye"] == 6000
    orange = next(o for o in st["par_operateur"] if o["operateur"] == "Orange")
    assert orange["nombre"] == 2 and orange["payes"] == 2 and orange["montant_paye"] == 6000 and orange["non_payes"] == 1
    # Moov n'a que du « abandonné » : aucune carte
    assert [o["operateur"] for o in st["par_operateur"]] == ["Orange"]
    # Classement sur les paiements PAYÉS : le montant 9000 (préparé) n'y figure pas
    assert [t["montant"] for t in st["top_montants"]] == [5000, 1000]
    assert st["top_beneficiaires"][0]["libelle"] == "Boutique B" and st["top_beneficiaires"][0]["montant"] == 5000
    assert [t["montant"] for t in calculer_statistiques(liste, "tous")["top_montants"]][0] == 9000
    assert [j["jour"] for j in st["par_jour"]] == ["2026-10-11", "2026-10-12"]


def test_historique_filtre_par_periode_operateur_et_recherche(client, utilisateur):
    _, h, _ = utilisateur
    client.post("/api/marchands", headers=h, json={"operateur": "Orange", "code": "777001", "libelle": "Pharmacie du Marché"})
    a = _payer(client, h, "Orange", "Paiement marchand", {"code": "777001", "amount": "2 000"}, "effectue")
    b = _payer(client, h, "Orange", "Paiement marchand", {"code": "888002", "amount": "4 500"}, "effectue")
    c = _payer(client, h, "Moov Africa", "Paiement marchand", {"code": "999003", "amount": "800"}, "abandonne")
    _dater(client, a["id"], "2026-09-05T08:00:00+00:00")
    _dater(client, b["id"], "2026-09-20T23:59:59+00:00")   # dernière seconde du 20 : doit rester dans « au 2026-09-20 »
    _dater(client, c["id"], "2026-10-02T12:00:00+00:00")

    ids = lambda r: {p["id"] for p in r.json()}
    assert ids(client.get("/api/paiements", headers=h)) == {a["id"], b["id"], c["id"]}
    assert ids(client.get("/api/paiements", headers=h, params={"du": "2026-09-01", "au": "2026-09-20"})) == {a["id"], b["id"]}
    assert ids(client.get("/api/paiements", headers=h, params={"du": "2026-09-21"})) == {c["id"]}
    assert ids(client.get("/api/paiements", headers=h, params={"operateur": "Moov Africa"})) == {c["id"]}
    assert ids(client.get("/api/paiements", headers=h, params={"statut": "effectue"})) == {a["id"], b["id"]}
    # Recherche de bénéficiaire : intitulé (sans tenir compte des majuscules), code, plusieurs mots
    assert ids(client.get("/api/paiements", headers=h, params={"q": "pharmacie marché"})) == {a["id"]}
    assert ids(client.get("/api/paiements", headers=h, params={"q": "888002"})) == {b["id"]}
    assert ids(client.get("/api/paiements", headers=h, params={"q": "introuvable"})) == set()

    st = client.get("/api/paiements/statistiques", headers=h, params={"du": "2026-09-01", "au": "2026-09-30"}).json()
    assert st["totaux"]["nombre"] == 2 and st["totaux"]["montant_paye"] == 6500
    assert [t["montant"] for t in st["top_montants"]] == [4500, 2000]
    assert st["periode"] == {"du": "2026-09-01", "au": "2026-09-30"}


def test_dates_invalides_et_cloisonnement(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/paiements", headers=h, params={"du": "01/09/2026"}).status_code == 422
    assert client.get("/api/paiements/statistiques", headers=h, params={"du": "2026-10-05", "au": "2026-10-01"}).status_code == 422
    p = _payer(client, h, "Orange", "Paiement marchand", {"code": "123456", "amount": "1 000"}, "effectue")
    autre = client.post("/api/auth/inscription", json={"nom": "Z", "prenom": "Z", "telephone": "65 11 22 33",
                                                       "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {autre.json()['access_token']}"}
    assert client.get("/api/paiements/statistiques", headers=h2).json()["totaux"]["nombre"] == 0
    assert client.get("/api/paiements/statistiques").status_code == 401
    assert p["id"]
