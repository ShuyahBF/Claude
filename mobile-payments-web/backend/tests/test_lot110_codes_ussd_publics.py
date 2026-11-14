"""Lot 110 — lecture PUBLIQUE de la base centrale des codes USSD (pour Concentration et les autres plateformes)."""
import asyncio

import pytest

from routes import carnet_ussd as cu


@pytest.fixture(autouse=True)
def base_vide():
    # La base en mémoire est partagée entre les essais : carnet remis à zéro avant chaque essai
    asyncio.run(cu.db.ussd_codes.delete_many({}))


def test_empreinte_pure():
    # Même contenu = même empreinte ; contenu différent = empreinte différente (c'est ce qui déclenche la mise à jour locale)
    a = [{"id": "1", "code": "*111#"}]
    assert cu.empreinte(a) == cu.empreinte([{"code": "*111#", "id": "1"}])
    assert cu.empreinte(a) != cu.empreinte([{"id": "1", "code": "*112#"}])
    assert len(cu.empreinte(a)) == 16


def test_pin_et_usage_dans_import():
    # Codes FICTIFS : aucun vrai code opérateur n'est écrit dans le dépôt
    ok, err = cu.lire_lignes("Orange | Compte | Mini relevé | *111*7*PIN# | essai | releve\nOrange | Compte | X | *1# | | inconnu")
    assert len(ok) == 1 and ok[0]["usage"] == "releve" and cu.demande_pin(ok[0]["code"]) and not cu.demande_pin("*111#")
    assert [e["ligne"] for e in err] == [2]


def test_lecture_publique_etag_et_filtres(client, admin):
    corps = {"operateur": "Orange", "categorie": "Compte", "titre": "Mini relevé", "code": "*111*7*PIN#", "usage": "releve"}
    r = client.post("/api/admin/ussd/codes", headers=admin, json=corps)
    assert r.status_code == 201 and r.json()["usage"] == "releve" and r.json()["demande_pin"] is True
    autre = client.post("/api/admin/ussd/codes", headers=admin, json={**corps, "operateur": "Moov", "code": "*222#", "usage": "solde"}).json()
    # un usage inconnu est refusé
    assert client.post("/api/admin/ussd/codes", headers=admin, json={**corps, "code": "*333#", "usage": "magie"}).status_code == 422

    # lecture SANS session (route publique)
    lu = client.get("/api/android/ussd-codes")
    assert lu.status_code == 200 and len(lu.json()["codes"]) == 2
    etag = lu.headers["etag"]
    assert etag == f'"{lu.json()["version"]}"'
    # filtres
    assert [c["operateur"] for c in client.get("/api/android/ussd-codes?usage=releve").json()["codes"]] == ["Orange"]
    assert [c["code"] for c in client.get("/api/android/ussd-codes?operateur=moov").json()["codes"]] == ["*222#"]
    assert client.get("/api/android/ussd-codes?operateur=MTN").status_code == 422
    # ETag déjà connu → 304 sans corps (mise à jour locale économe)
    assert client.get("/api/android/ussd-codes", headers={"If-None-Match": etag}).status_code == 304
    # l'administrateur corrige le code → la version change et le client retélécharge
    modif = {**corps, "operateur": "Moov", "code": "*223#", "usage": "solde"}
    assert client.put(f"/api/admin/ussd/codes/{autre['id']}", headers=admin, json=modif).status_code == 200
    nouveau = client.get("/api/android/ussd-codes", headers={"If-None-Match": etag})
    assert nouveau.status_code == 200 and nouveau.headers["etag"] != etag
    assert "*223#" in [c["code"] for c in nouveau.json()["codes"]]
    # un code désactivé n'est plus publié
    assert client.put(f"/api/admin/ussd/codes/{autre['id']}", headers=admin, json={**modif, "actif": False}).status_code == 200
    assert [c["code"] for c in client.get("/api/android/ussd-codes").json()["codes"]] == ["*111*7*PIN#"]
