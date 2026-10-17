"""Lot 38 — QR des plaques d'opérateurs : identifiant du QR → code marchand mémorisé, consensus et confirmation."""
import pytest


def lien(**plus):
    return {"operateur": "Orange", "identifiant": "000002011167", "code": "3366444", **plus}


def test_connexion_requise(client):
    assert client.get("/api/qr-operateurs/Orange/000002011167").status_code == 401


def test_inconnu_puis_memorise(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/qr-operateurs/Orange/000002011167", headers=h).json() == {"trouve": False}
    r = client.post("/api/qr-operateurs", headers=h, json=lien(libelle="Pharmacie du Marché"))
    assert r.status_code == 200
    assert r.json() == {"trouve": True, "code": "3366444", "libelle": "Pharmacie du Marché", "confirmations": 1, "source": "moi"}
    assert client.get("/api/qr-operateurs/Orange/000002011167", headers=h).json()["code"] == "3366444"
    # Le marchand est entré dans l'annuaire partagé
    assert client.get("/api/marchands/Orange/3366444", headers=h).json()["libelle"] == "Pharmacie du Marché"


def test_communaute_et_confirmations(client, utilisateur, admin):
    _, h, _ = utilisateur
    client.post("/api/qr-operateurs", headers=admin, json=lien(identifiant="000002099999", code="1111111"))
    r = client.get("/api/qr-operateurs/Orange/000002099999", headers=h).json()
    assert r["code"] == "1111111" and r["source"] == "communaute" and r["confirmations"] == 1
    # L'utilisateur confirme le même code : 2 confirmations ; sa propre entrée devient « moi »
    r = client.post("/api/qr-operateurs", headers=h, json=lien(identifiant="000002099999", code="1111111")).json()
    assert r["confirmations"] == 2 and r["source"] == "moi"
    assert client.get("/api/qr-operateurs/Orange/000002099999", headers=admin).json()["confirmations"] == 2


def test_son_propre_code_prime_et_peut_etre_corrige(client, utilisateur, admin):
    _, h, _ = utilisateur
    client.post("/api/qr-operateurs", headers=admin, json=lien(identifiant="000002088888", code="2222222"))
    client.post("/api/qr-operateurs", headers=h, json=lien(identifiant="000002088888", code="3333333"))     # désaccord
    assert client.get("/api/qr-operateurs/Orange/000002088888", headers=h).json()["code"] == "3333333"       # le sien
    assert client.get("/api/qr-operateurs/Orange/000002088888", headers=admin).json()["code"] == "2222222"   # le sien aussi
    client.post("/api/qr-operateurs", headers=h, json=lien(identifiant="000002088888", code="2222222"))     # correction : se range à l'avis
    assert client.get("/api/qr-operateurs/Orange/000002088888", headers=h).json() == {
        "trouve": True, "code": "2222222", "libelle": None, "confirmations": 2, "source": "moi"}


def test_operateurs_distincts_et_validation(client, utilisateur):
    _, h, _ = utilisateur
    client.post("/api/qr-operateurs", headers=h, json=lien())
    assert client.get("/api/qr-operateurs/Moov Africa/000002011167", headers=h).json() == {"trouve": False}
    assert client.get("/api/qr-operateurs/Orange/abc", headers=h).json() == {"trouve": False}
    for mauvais in (lien(code="12"), lien(code="12ab"), lien(identifiant="12"), lien(libelle="<script>")):
        assert client.post("/api/qr-operateurs", headers=h, json=mauvais).status_code == 422
