"""Lot 56 — archives en ligne chiffrées : ce serveur relaie des octets illisibles vers SAWALI, sans jamais les lire."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings


class Recues(list):
    def __init__(self):
        super().__init__()
        self.reponse = (200, {})


@pytest.fixture
def sawali():
    recues = Recues()

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        return httpx.Response(recues.reponse[0], json=recues.reponse[1])

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


META = "M" * 40
CONTENU = "Q" * 80


def test_connexion_requise(client):
    assert client.get("/api/archives/etat").status_code == 401
    assert client.post("/api/archives", json={"meta": META, "contenu": CONTENU}).status_code == 401


def test_etat_et_liste_relayes_signes(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"abonne": True, "sel": "S" * 24, "verif": "V" * 40, "quota_octets": 200_000_000, "utilise_octets": 0, "nombre": 0, "fichier_max_octets": 8_000_000})
    r = client.get("/api/archives/etat", headers=h)
    assert r.status_code == 200 and r.json()["abonne"] is True
    q = sawali[0]
    assert q.url.path == "/api/formules-plateformes/archives/etat" and q.headers["X-Signature"] and json.loads(q.content)["utilisateur"]["id"]
    sawali.reponse = (200, {"archives": [{"id": "a1b2c3d4e5", "meta": META, "taille": 100, "cree_le": "2026-10-17T10:00:00+00:00"}]})
    assert client.get("/api/archives", headers=h).json()["archives"][0]["id"] == "a1b2c3d4e5"


def test_ajout_transmis_tel_quel_et_refus_avec_le_prix(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"id": "n1n2n3n4n5", "taille": 60, "cree_le": "x", "utilise_octets": 60})
    r = client.post("/api/archives", headers=h, json={"meta": META, "contenu": CONTENU})
    assert r.status_code == 200
    corps = json.loads(sawali[-1].content)
    assert corps["meta"] == META and corps["contenu"] == CONTENU                      # octets chiffrés relayés sans aucune modification
    detail = {"code": "abonnement_requis", "message": "Archives en ligne réservée aux abonnés. Formule « Archives » : 2 000 FCFA pour 30 jours.",
              "formule": {"id": "f1", "nom": "Archives", "prix": 2000, "duree_jours": 30}}
    sawali.reponse = (402, {"detail": detail})
    r = client.post("/api/archives", headers=h, json={"meta": META, "contenu": CONTENU})
    assert r.status_code == 402 and r.json()["detail"] == detail
    sawali.reponse = (413, {"detail": "Espace d'archives plein (200 Mo)"})
    assert client.post("/api/archives", headers=h, json={"meta": META, "contenu": CONTENU}).status_code == 413


def test_telechargement_et_suppression(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"id": "a1b2c3d4e5", "meta": META, "contenu": CONTENU})
    assert client.get("/api/archives/a1b2c3d4e5", headers=h).json()["contenu"] == CONTENU
    assert sawali[-1].url.path.endswith("/archives/telecharger") and json.loads(sawali[-1].content)["id"] == "a1b2c3d4e5"
    sawali.reponse = (200, {"ok": True})
    assert client.delete("/api/archives/a1b2c3d4e5", headers=h).json() == {"ok": True}
    sawali.reponse = (404, {"detail": "Document introuvable"})
    r = client.delete("/api/archives/zzzzzzzzzz", headers=h)
    assert r.status_code == 404 and r.json()["detail"] == "Document introuvable"


def test_validation_des_saisies(client, utilisateur, sawali):
    _, h, _ = utilisateur
    n = len(sawali)
    assert client.post("/api/archives/cle", headers=h, json={"sel": "court", "verif": "V" * 40}).status_code == 422
    assert client.post("/api/archives", headers=h, json={"meta": "x", "contenu": CONTENU}).status_code == 422
    assert len(sawali) == n


def test_modification_des_informations_chiffrees(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"ok": True})
    r = client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "N" * 48})
    assert r.status_code == 200
    q = sawali[-1]
    assert q.url.path.endswith("/archives/modifier") and json.loads(q.content)["meta"] == "N" * 48 and json.loads(q.content)["id"] == "a1b2c3d4e5"
    assert client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "court"}).status_code == 422
