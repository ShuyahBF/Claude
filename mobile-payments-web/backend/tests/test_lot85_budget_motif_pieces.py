"""Lot 85 — auRor outil de budget : motif détaillé et pièces scannées (ticket, facture, reçu, liste de courses) sur un paiement."""
import base64

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"\xff\xd9"
IMAGE = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()


def _paiement(client, h, code="90817263", montant="1500"):
    s = next(x for x in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if x["nom"] == "Paiement marchand")
    return client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"code": code, "amount": montant}}).json()


def test_motif_pour_un_paiement_non_valide_et_recherche(client, utilisateur):
    _, h, _ = utilisateur
    p = _paiement(client, h)                                                 # statut « préparé » : pas encore validé
    r = client.put(f"/api/paiements/{p['id']}/details", headers=h, json={"motif": "Courses de la semaine : riz, huile, savon"})
    assert r.status_code == 200 and r.json()["motif"].startswith("Courses")
    assert [x["id"] for x in client.get("/api/paiements", params={"q": "huile"}, headers=h).json()] == [p["id"]]   # retrouvé par son motif
    assert client.put(f"/api/paiements/{p['id']}/details", headers=h, json={"motif": "x" * 501}).status_code == 422
    assert client.put(f"/api/paiements/{p['id']}/details", headers=h, json={"motif": ""}).json()["motif"] == ""


def test_pieces_ajout_lecture_limite_et_suppression(client, utilisateur):
    _, h, _ = utilisateur
    p = _paiement(client, h, "90817264")
    r = client.post(f"/api/paiements/{p['id']}/pieces", headers=h, json={"image": IMAGE, "nom": "Ticket de caisse"})
    assert r.status_code == 201
    pieces = r.json()["pieces"]
    assert len(pieces) == 1 and pieces[0]["nom"] == "Ticket de caisse" and "data" not in pieces[0]
    # La liste de l'historique ne renvoie jamais le contenu des images
    ligne = next(x for x in client.get("/api/paiements", headers=h).json() if x["id"] == p["id"])
    assert ligne["pieces"][0]["id"] == pieces[0]["id"] and "data" not in ligne["pieces"][0]
    # L'image se lit à part
    img = client.get(f"/api/paiements/{p['id']}/pieces/{pieces[0]['id']}", headers=h)
    assert img.status_code == 200 and img.content == JPEG and img.headers["content-type"] == "image/jpeg"
    # 3 pièces au plus
    for _ in range(2):
        assert client.post(f"/api/paiements/{p['id']}/pieces", headers=h, json={"image": IMAGE}).status_code == 201
    assert client.post(f"/api/paiements/{p['id']}/pieces", headers=h, json={"image": IMAGE}).status_code == 409
    # Suppression
    assert len(client.delete(f"/api/paiements/{p['id']}/pieces/{pieces[0]['id']}", headers=h).json()["pieces"]) == 2
    assert client.delete(f"/api/paiements/{p['id']}/pieces/inconnue", headers=h).status_code == 404


def test_refus_des_fichiers_invalides(client, utilisateur):
    _, h, _ = utilisateur
    p = _paiement(client, h, "90817265")
    mauvais = {"data:text/html;base64," + base64.b64encode(b"<script>" * 20).decode(): 422,       # pas une image
               "data:image/jpeg;base64," + "@@pas du base64@@" * 10: 422,
               "data:image/jpeg;base64," + base64.b64encode(b"\x00" * 1_250_000).decode(): 422}    # trop lourde pour la limite du champ ou de l'image
    for image, code in mauvais.items():
        assert client.post(f"/api/paiements/{p['id']}/pieces", headers=h, json={"image": image}).status_code in (code, 413)


def test_motif_et_pieces_prives(client, utilisateur):
    """Un autre utilisateur ne voit ni ne modifie le motif et les pièces d'un paiement qui n'est pas le sien."""
    _, h, _ = utilisateur
    p = _paiement(client, h, "90817266")
    client.post(f"/api/paiements/{p['id']}/pieces", headers=h, json={"image": IMAGE})
    piece_id = client.get("/api/paiements", headers=h).json()[0]["pieces"][0]["id"]
    from conftest import _entetes  # noqa: F401  (même fabrique de jetons que les autres tests)
    r2 = client.post("/api/auth/inscription", json={"nom": "Autre", "prenom": "Moussa", "telephone": "70 55 55 55",
                     "email": "moussa85@test.bf", "mot_de_passe": "motdepasse-123"})
    h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    client.cookies.clear()
    assert client.put(f"/api/paiements/{p['id']}/details", headers=h2, json={"motif": "intrus"}).status_code == 404
    assert client.get(f"/api/paiements/{p['id']}/pieces/{piece_id}", headers=h2).status_code == 404
    assert client.post(f"/api/paiements/{p['id']}/pieces", headers=h2, json={"image": IMAGE}).status_code == 404
    assert client.delete(f"/api/paiements/{p['id']}", headers=h).status_code == 200                  # supprimer le paiement emporte ses pièces
    assert client.get(f"/api/paiements/{p['id']}/pieces/{piece_id}", headers=h).status_code == 404
