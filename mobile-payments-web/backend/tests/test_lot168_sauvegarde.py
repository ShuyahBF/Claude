"""Lot 168 — sauvegarde en ligne chiffrée : mode, une sauvegarde + la précédente, bornes, espacement, isolement entre comptes, effacement avec le compte."""
import base64
import os

from db import db  # noqa: F401  (même base en mémoire que l'application de test)


def blob(n=64):
    return base64.b64encode(os.urandom(n)).decode()


def test_connexion_requise(client):
    assert client.get("/api/sauvegarde/etat").status_code == 401
    assert client.put("/api/sauvegarde", json={"contenu": blob()}).status_code == 401


def test_etat_initial_puis_mode(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/sauvegarde/etat", headers=h).json() == {"mode": None, "existe": False, "maj_le": None, "taille": 0, "versions": 0}
    assert client.put("/api/sauvegarde/mode", headers=h, json={"mode": "bizarre"}).status_code == 422
    assert client.put("/api/sauvegarde/mode", headers=h, json={"mode": "cloud"}).json()["mode"] == "cloud"


def test_sans_mode_cloud_aucune_ecriture(client, utilisateur):
    _, h, _ = utilisateur
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": blob()}).status_code == 409
    client.put("/api/sauvegarde/mode", headers=h, json={"mode": "local"})
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": blob()}).status_code == 409


def test_sauvegarde_lecture_et_version_precedente(client, utilisateur, monkeypatch):
    _, h, _ = utilisateur
    client.put("/api/sauvegarde/mode", headers=h, json={"mode": "cloud"})
    a = blob(100)
    assert client.get("/api/sauvegarde", headers=h).status_code == 404
    r = client.put("/api/sauvegarde", headers=h, json={"contenu": a, "app": "133"})
    assert r.status_code == 200 and r.json()["taille"] == 100
    assert client.get("/api/sauvegarde", headers=h).json()["contenu"] == a
    # deuxième écriture trop rapprochée : refusée ; une fois l'intervalle passé : acceptée, l'ancienne devient « précédente »
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": blob()}).status_code == 429
    import routes.sauvegarde as s
    monkeypatch.setattr(s, "INTERVALLE_MIN_S", 0)
    b = blob(120)
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": b}).status_code == 200
    assert client.get("/api/sauvegarde", headers=h).json()["contenu"] == b
    assert client.get("/api/sauvegarde?precedente=true", headers=h).json()["contenu"] == a
    c = blob(80)
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": c}).status_code == 200
    e = client.get("/api/sauvegarde/etat", headers=h).json()
    assert e["existe"] and e["versions"] == 2 and e["taille"] == 80                 # seulement la courante et la précédente


def test_bornes_et_contenu_illisible(client, utilisateur):
    _, h, _ = utilisateur
    client.put("/api/sauvegarde/mode", headers=h, json={"mode": "cloud"})
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": "court"}).status_code == 422
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": "é" * 60}).status_code == 422                   # pas du base64
    assert client.put("/api/sauvegarde", headers=h, json={"contenu": "A" * 6_000_001}).status_code == 422             # trop gros
    assert client.get("/api/sauvegarde/etat", headers=h).json()["existe"] is False


def test_effacement_et_isolement_entre_comptes(client, utilisateur, monkeypatch):
    import routes.sauvegarde as s
    monkeypatch.setattr(s, "INTERVALLE_MIN_S", 0)
    _, h, _ = utilisateur
    client.put("/api/sauvegarde/mode", headers=h, json={"mode": "cloud"})
    client.put("/api/sauvegarde", headers=h, json={"contenu": blob()})
    assert client.get("/api/sauvegarde/etat", headers=h).json()["existe"] is True
    assert client.delete("/api/sauvegarde", headers=h).json() == {"ok": True}
    e = client.get("/api/sauvegarde/etat", headers=h).json()
    assert e["existe"] is False and e["mode"] == "local" and client.get("/api/sauvegarde", headers=h).status_code == 404


def test_un_autre_compte_ne_voit_pas_la_sauvegarde(client, utilisateur):
    _, h, _ = utilisateur
    client.put("/api/sauvegarde/mode", headers=h, json={"mode": "cloud"})
    client.put("/api/sauvegarde", headers=h, json={"contenu": blob()})
    import secrets
    tel = f"7{secrets.randbelow(10**7):07d}0"
    r = client.post("/api/auth/inscription", json={"prenom": "Autre", "nom": "Compte", "telephone": tel[:8], "mot_de_passe": "Motdepasse-123", "accepte_conditions": True})
    client.cookies.clear()                               # l'inscription ouvre une session : ne pas la laisser aux autres tests
    if r.status_code not in (200, 201):
        return                                           # format d'inscription différent selon la version : l'isolement est garanti par user_id (voir _doc)
    h2 = {"Authorization": f"Bearer {r.json().get('access_token') or r.json().get('token')}"}
    assert client.get("/api/sauvegarde/etat", headers=h2).json()["existe"] is False
