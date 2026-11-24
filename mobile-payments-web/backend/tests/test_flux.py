"""Lot 223 — flux de changements chiffrés : ordre, isolement entre comptes, attente longue, purge, bornes. Aucun accès réseau."""
import base64
import time

AP1, AP2 = "a1b2c3d4-0000-0000-0000-000000000001", "a1b2c3d4-0000-0000-0000-000000000002"


def blob(n=1):
    return base64.b64encode(bytes([n]) * 40).decode()


def test_connexion_obligatoire(client):
    assert client.get("/api/flux").status_code == 401
    assert client.post("/api/flux", json={"appareil": AP1, "changements": [blob()]}).status_code == 401


def test_ordre_et_lecture_depuis_un_numero(client, utilisateur):
    _, h, _ = utilisateur
    assert client.post("/api/flux", headers=h, json={"appareil": AP1, "changements": [blob(1), blob(2)]}).json() == {"seq": 2}
    assert client.post("/api/flux", headers=h, json={"appareil": AP2, "changements": [blob(3)]}).json() == {"seq": 3}
    tout = client.get("/api/flux", headers=h, params={"apres": 0}).json()
    assert [c["seq"] for c in tout["changements"]] == [1, 2, 3] and tout["seq"] == 3 and tout["reinitialiser"] is False
    assert [c["appareil"] for c in tout["changements"]] == [AP1, AP1, AP2]
    suite = client.get("/api/flux", headers=h, params={"apres": 2}).json()
    assert [c["seq"] for c in suite["changements"]] == [3]
    assert client.get("/api/flux", headers=h, params={"apres": 3}).json()["changements"] == []


def test_isolement_entre_comptes(client, utilisateur):
    _, h1, _ = utilisateur
    client.post("/api/flux", headers=h1, json={"appareil": AP1, "changements": [blob()]})
    import conftest
    r = client.post("/api/auth/inscription", json={"nom": "Autre", "prenom": "Moussa", "telephone": "70 55 55 55", "email": "autre55@test.bf", "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/flux", headers=h2, params={"apres": 0}).json()["changements"] == []
    assert client.get("/api/flux/etat", headers=h2).json() == {"seq": 0, "nombre": 0}


def test_bornes_changement_illisible_ou_trop_gros(client, utilisateur):
    _, h, _ = utilisateur
    assert client.post("/api/flux", headers=h, json={"appareil": AP1, "changements": ["pas du base64 !"]}).status_code == 422
    assert client.post("/api/flux", headers=h, json={"appareil": AP1, "changements": [base64.b64encode(b"x" * 10).decode()]}).status_code == 422   # trop court
    assert client.post("/api/flux", headers=h, json={"appareil": AP1, "changements": [base64.b64encode(b"x" * 300_000).decode()]}).status_code == 422
    assert client.post("/api/flux", headers=h, json={"appareil": "pas un identifiant", "changements": [blob()]}).status_code == 422


def test_attente_longue_rend_la_main_apres_le_delai(client, utilisateur):
    _, h, _ = utilisateur
    t = time.monotonic()
    r = client.get("/api/flux", headers=h, params={"apres": 0, "attente": 1})
    assert r.json()["changements"] == [] and 0.9 <= time.monotonic() - t < 4


def test_purge_et_reinitialisation(client, utilisateur, monkeypatch):
    from routes import flux
    monkeypatch.setattr(flux, "CHANGEMENTS_GARDES", 3)
    _, h, _ = utilisateur
    for i in range(6):
        client.post("/api/flux", headers=h, json={"appareil": AP1, "changements": [blob(i + 1)]})
    assert client.get("/api/flux/etat", headers=h).json() == {"seq": 6, "nombre": 3}
    r = client.get("/api/flux", headers=h, params={"apres": 0}).json()
    assert [c["seq"] for c in r["changements"]] == [4, 5, 6] and r["reinitialiser"] is True      # des changements ont disparu : relire la sauvegarde
    assert client.get("/api/flux", headers=h, params={"apres": 3}).json()["reinitialiser"] is False   # à jour depuis le plus ancien gardé


def test_desactivation_efface_le_flux(client, utilisateur):
    _, h, _ = utilisateur
    client.post("/api/flux", headers=h, json={"appareil": AP1, "changements": [blob()]})
    assert client.delete("/api/flux", headers=h).json() == {"ok": True}
    assert client.get("/api/flux/etat", headers=h).json()["nombre"] == 0
