"""Lot 70 — historique : le nom du marchand est relu dans l'annuaire d'aujourd'hui (le marchand peut avoir été créé après le paiement)."""


def _service(client, h):
    return next(s for s in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if s["nom"] == "Paiement marchand")


def test_nom_enregistre_apres_le_paiement(client, utilisateur):
    _, h, _ = utilisateur
    s = _service(client, h)
    # Paiement préparé AVANT que le marchand existe : aucun intitulé gardé
    p = client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"code": "90817263", "amount": "1500"}}).json()
    assert p["marchand"] == {"code": "90817263", "libelle": None}
    ligne = next(x for x in client.get("/api/paiements", headers=h).json() if x["id"] == p["id"])
    assert ligne["marchand"]["libelle"] is None
    # Le marchand est enregistré APRÈS : l'historique affiche son nom, y compris dans la recherche et les statistiques
    assert client.post("/api/marchands", headers=h, json={"operateur": "Orange", "code": "90817263", "libelle": "Pharmacie du Marché"}).status_code == 201
    ligne = next(x for x in client.get("/api/paiements", headers=h).json() if x["id"] == p["id"])
    assert ligne["marchand"] == {"code": "90817263", "libelle": "Pharmacie du Marché"}
    trouves = client.get("/api/paiements", params={"q": "pharmacie du marché"}, headers=h).json()
    assert [x["id"] for x in trouves] == [p["id"]]
    # Changer le statut renvoie aussi le nom à jour
    assert client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "effectue"}).json()["marchand"]["libelle"] == "Pharmacie du Marché"


def test_meme_code_chez_un_autre_operateur_et_nom_garde(client, utilisateur):
    _, h, _ = utilisateur
    s = _service(client, h)
    p = client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"code": "90817264", "amount": "500"}}).json()
    # Même code chez Moov : n'est pas le marchand du paiement Orange
    assert client.post("/api/marchands", headers=h, json={"operateur": "Moov", "code": "90817264", "libelle": "Autre boutique"}).status_code == 201
    ligne = next(x for x in client.get("/api/paiements", headers=h).json() if x["id"] == p["id"])
    assert ligne["marchand"]["libelle"] is None
    # Sans entrée dans l'annuaire, un nom déjà gardé sur le paiement reste affiché
    assert client.post("/api/marchands", headers=h, json={"operateur": "Orange", "code": "90817265", "libelle": "Kiosque Zogona"}).status_code == 201
    p2 = client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"code": "90817265", "amount": "700"}}).json()
    assert p2["marchand"]["libelle"] == "Kiosque Zogona"
