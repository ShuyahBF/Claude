"""Lot 58 — compte marchand et paiement PI-SPI chez un marchand : vérification obligatoire, confirmation par le marchand seul."""
import base64
import struct
import zlib

import pytest


def _png(octets_en_plus=0):
    def ch(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    brut = b"".join(b"\x00" + b"\xff\x00\x00" * 8 for _ in range(8))
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(brut)) + ch(b"IEND", b"") + b"\x00" * octets_en_plus


def _url(png):
    return "data:image/png;base64," + base64.b64encode(png).decode()


CODE = [{"operateur": "OrangeP", "code": "778899"}]
PISPI = {"banque": "Ecobank", "titulaire": "Boutique Salif", "adresse_paiement": "salif@ecobank", "consigne": ""}


@pytest.fixture
def service_id(client, admin):
    """Service « paiement marchand » (champ code marchand) et marchands de test, retirés ensuite."""
    from db import db
    yield None
    client.portal.call(db.comptes_marchands.delete_many, {})
    client.portal.call(db.paiements.delete_many, {"mode": "pispi"})


def _compte_verifie(client, admin, marchand_h, codes=CODE):
    assert client.put("/api/mon-marchand", headers=marchand_h, json={"nom": "Boutique Salif", "codes": codes, "pispi": PISPI}).status_code == 200
    assert client.post("/api/mon-marchand/qr", headers=marchand_h, json={"image": _url(_png())}).status_code == 200
    cid = client.get("/api/mon-marchand", headers=marchand_h).json()["compte"]["id"]
    assert client.put(f"/api/admin/marchands/{cid}/statut", headers=admin, json={"statut": "verifie"}).status_code == 200
    return cid


def test_compte_cree_en_attente_et_non_visible_des_clients(client, admin, utilisateur, service_id):
    _, hm, _ = utilisateur
    r = client.put("/api/mon-marchand", headers=hm, json={"nom": "Boutique Salif", "codes": CODE, "pispi": PISPI})
    assert r.json()["compte"]["statut"] == "en_attente"
    client.post("/api/mon-marchand/qr", headers=hm, json={"image": _url(_png())})
    # Tant que l'administrateur n'a pas vérifié, personne ne peut payer par PI-SPI chez ce marchand
    assert client.get("/api/marchands/OrangeP/778899/pispi", headers=hm).json()["disponible"] is False
    cid = client.get("/api/mon-marchand", headers=hm).json()["compte"]["id"]
    assert client.put(f"/api/admin/marchands/{cid}/statut", headers=hm, json={"statut": "verifie"}).status_code == 403     # le marchand ne se vérifie pas lui-même


def test_verification_exige_un_qr_et_un_code(client, admin, utilisateur, service_id):
    _, hm, _ = utilisateur
    client.put("/api/mon-marchand", headers=hm, json={"nom": "Sans QR", "codes": CODE, "pispi": PISPI})
    cid = client.get("/api/mon-marchand", headers=hm).json()["compte"]["id"]
    assert client.put(f"/api/admin/marchands/{cid}/statut", headers=admin, json={"statut": "verifie"}).status_code == 422


def test_modifier_le_qr_ou_les_infos_remet_en_attente(client, admin, utilisateur, service_id):
    _, hm, _ = utilisateur
    _compte_verifie(client, admin, hm)
    assert client.get("/api/marchands/OrangeP/778899/pispi", headers=hm).json()["disponible"] is True
    client.put("/api/mon-marchand", headers=hm, json={"nom": "Boutique Salif", "codes": CODE, "pispi": PISPI})              # rien n'a changé
    assert client.get("/api/mon-marchand", headers=hm).json()["compte"]["statut"] == "verifie"
    client.post("/api/mon-marchand/qr", headers=hm, json={"image": _url(_png(5))})                                           # nouveau QR
    assert client.get("/api/mon-marchand", headers=hm).json()["compte"]["statut"] == "en_attente"
    assert client.get("/api/marchands/OrangeP/778899/pispi", headers=hm).json()["disponible"] is False                      # plus de paiement avant revérification


def test_un_code_ne_peut_appartenir_qu_a_un_compte(client, admin, utilisateur, service_id):
    _, h1, _ = utilisateur
    _compte_verifie(client, admin, h1)
    r2 = client.post("/api/auth/inscription", json={"nom": "Autre", "prenom": "Marc", "telephone": "70 91 91 91", "email": "marc.lot58@test.bf", "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    r = client.put("/api/mon-marchand", headers=h2, json={"nom": "Usurpateur", "codes": CODE, "pispi": PISPI})
    assert r.status_code == 409 and "déjà rattaché" in r.json()["detail"]


def test_qr_invalide_refuse(client, admin, utilisateur, service_id):
    _, hm, _ = utilisateur
    client.put("/api/mon-marchand", headers=hm, json={"nom": "Boutique", "codes": CODE, "pispi": PISPI})
    assert client.post("/api/mon-marchand/qr", headers=hm, json={"image": "data:image/gif;base64," + "A" * 60}).status_code == 422
    assert client.post("/api/mon-marchand/qr", headers=hm, json={"image": "data:image/png;base64," + base64.b64encode(b"pas une image" * 10).decode()}).status_code == 422
    gros = _png(600_000)
    assert client.post("/api/mon-marchand/qr", headers=hm, json={"image": _url(gros)}).status_code in (413, 422)


def test_parcours_complet_paiement_declaration_confirmation(client, admin, utilisateur, service_id):
    _, hm, _ = utilisateur
    _compte_verifie(client, admin, hm)
    r2 = client.post("/api/auth/inscription", json={"nom": "Ouedraogo", "prenom": "Awa", "telephone": "70 92 92 92", "email": "awa.lot58@test.bf", "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    hc = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    # Le client demande le bloc de paiement : QR de la banque du marchand, référence à indiquer
    r = client.post("/api/paiements/pispi", headers=hc, json={"operateur": "OrangeP", "code": "778899", "montant": 2500})
    assert r.status_code == 201
    bloc, p = r.json()["bloc"], r.json()["paiement"]
    assert bloc["marchand"] == "Boutique Salif" and bloc["montant_texte"] == "2 500 FCFA" and bloc["reference"].startswith("PM-") and bloc["qr_data_url"].startswith("data:image/png")
    assert p["statut"] == "prepare" and p["mode"] == "pispi" and p["lien_tel"] is None
    # Le client ne peut pas se déclarer payé lui-même
    assert client.put(f"/api/paiements/{p['id']}/statut", headers=hc, json={"statut": "effectue"}).status_code == 403
    # Il déclare la référence bancaire
    assert client.post(f"/api/paiements/{p['id']}/pispi/declarer", headers=hc, json={"reference_bancaire": "TX-8899"}).json()["statut"] == "declare"
    # Le marchand voit le paiement à confirmer (nom abrégé du payeur) et le confirme
    liste = client.get("/api/mon-marchand/paiements", headers=hm).json()["paiements"]
    assert liste[0]["statut"] == "declare" and liste[0]["reference_bancaire"] == "TX-8899" and liste[0]["payeur"] == "Awa O." and liste[0]["montant"] == 2500
    assert client.post(f"/api/mon-marchand/paiements/{p['id']}/confirmer", headers=hc).status_code == 404         # un autre compte ne peut pas confirmer
    assert client.post(f"/api/mon-marchand/paiements/{p['id']}/confirmer", headers=hm).json() == {"ok": True, "statut": "effectue"}
    # Le paiement est « Payé » pour le client (statistiques) et ne peut plus être abandonné
    h = client.get("/api/paiements", headers=hc, params={"statut": "effectue"}).json()
    assert len(h) == 1 and h[0]["mode"] == "pispi"
    assert client.put(f"/api/paiements/{p['id']}/statut", headers=hc, json={"statut": "abandonne"}).status_code == 403
    assert client.post(f"/api/mon-marchand/paiements/{p['id']}/confirmer", headers=hm).status_code == 404         # déjà traité


def test_paiement_pispi_refuse_chez_un_marchand_non_verifie(client, utilisateur, service_id):
    _, h, _ = utilisateur
    assert client.post("/api/paiements/pispi", headers=h, json={"operateur": "OrangeP", "code": "000111", "montant": 1000}).status_code == 404
    assert client.post("/api/paiements/pispi", headers=h, json={"operateur": "OrangeP", "code": "000111", "montant": 5}).status_code == 422


def test_liste_admin_en_attente_d_abord(client, admin, utilisateur, service_id):
    _, hm, _ = utilisateur
    client.put("/api/mon-marchand", headers=hm, json={"nom": "Boutique", "codes": CODE, "pispi": PISPI})
    r = client.get("/api/admin/marchands", headers=admin).json()["marchands"]
    assert r[0]["statut"] == "en_attente" and r[0]["codes"] == CODE and "qr_image_b64" not in str(r)             # le QR n'est jamais dans la liste
    assert client.get("/api/admin/marchands", headers=hm).status_code == 403
