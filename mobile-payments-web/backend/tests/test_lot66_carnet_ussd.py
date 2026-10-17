"""Lot 66 — carnet de codes USSD : lecture par les utilisateurs, gestion et import par l'administrateur."""
import asyncio

import pytest

from routes import carnet_ussd as cu


@pytest.fixture(autouse=True)
def base_vide():
    # La base en mémoire est partagée entre les essais : carnet remis à zéro avant chaque essai
    asyncio.run(cu.db.ussd_codes.delete_many({}))


def test_fonctions_pures():
    assert cu.normaliser_operateur("Moov Africa") == "Moov" and cu.normaliser_operateur("TELECEL Faso") == "Telecel" and cu.normaliser_operateur("MTN") is None
    assert cu.code_valide("*123#") and cu.code_valide("*144*1*NUMERO#") and not cu.code_valide("123") and not cu.code_valide("*123") and not cu.code_valide("*12;3#")
    ok, err = cu.lire_lignes("Orange | Mon numéro | Connaître mon numéro | *123#\n\nMoov|Internet|Forfait|*1*2#|desc\nMTN|X|Titre|*1#\nOrange|A|Titre|abc\nsans séparateur")
    assert [v["operateur"] for v in ok] == ["Orange", "Moov"] and ok[1]["description"] == "desc"
    assert [e["ligne"] for e in err] == [4, 5, 6]


def test_carnet_admin_et_lecture(client, admin, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/admin/ussd/codes", headers=h).status_code in (401, 403)
    assert client.get("/api/ussd", headers=h).json() == {"operateurs": []}
    corps = {"operateur": "Orange", "categorie": "Mon numéro", "titre": "Connaître mon numéro", "code": "*123#"}
    r = client.post("/api/admin/ussd/codes", headers=admin, json=corps)
    assert r.status_code == 201 and r.json()["appelable"] is True
    assert client.post("/api/admin/ussd/codes", headers=admin, json=corps).status_code == 409
    assert client.post("/api/admin/ussd/codes", headers=admin, json={**corps, "code": "123"}).status_code == 422
    assert client.post("/api/admin/ussd/codes", headers=admin, json={**corps, "operateur": "MTN", "code": "*5#"}).status_code == 422
    modele = client.post("/api/admin/ussd/codes", headers=admin, json={**corps, "operateur": "Moov", "titre": "Transfert", "code": "*555*NUMERO#"}).json()
    assert modele["appelable"] is False
    lu = client.get("/api/ussd", headers=h).json()["operateurs"]
    assert [o["nom"] for o in lu] == ["Orange", "Moov"] and lu[0]["categories"][0]["codes"][0]["code"] == "*123#"
    # un code désactivé disparaît du carnet des utilisateurs
    assert client.put(f"/api/admin/ussd/codes/{modele['id']}", headers=admin, json={**corps, "operateur": "Moov", "titre": "Transfert", "code": "*555*NUMERO#", "actif": False}).status_code == 200
    assert [o["nom"] for o in client.get("/api/ussd", headers=h).json()["operateurs"]] == ["Orange"]
    assert client.delete(f"/api/admin/ussd/codes/{modele['id']}", headers=admin).status_code == 200
    assert client.delete(f"/api/admin/ussd/codes/{modele['id']}", headers=admin).status_code == 404
    assert "Mobile Money" in client.get("/api/admin/ussd/codes", headers=admin).json()["categories"]


def test_import_en_bloc(client, admin):
    texte = "Orange | Mon numéro | Connaître mon numéro | *123#\nTelecel | Solde et crédit | Mon solde | *100#\nmauvaise ligne"
    r = client.post("/api/admin/ussd/importer", headers=admin, json={"texte": texte}).json()
    assert (r["ajoutes"], r["ignores"], len(r["erreurs"])) == (2, 0, 1)
    # second import identique : tout est ignoré (aucun doublon)
    r = client.post("/api/admin/ussd/importer", headers=admin, json={"texte": texte}).json()
    assert (r["ajoutes"], r["ignores"]) == (0, 2)
    assert len(client.get("/api/admin/ussd/codes", headers=admin).json()["codes"]) == 2
