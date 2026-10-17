"""Lot 24 — support SAWALI (visiteur ou compte connecté) et adresse IP du visiteur.
Aucun accès réseau : SAWALI est remplacé par un faux serveur (httpx.MockTransport)."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings


@pytest.fixture
def sawali():
    """Active la clé HMAC et capture les requêtes envoyées à SAWALI."""
    recues = []

    def repondre(requete):
        recues.append(requete)
        return httpx.Response(200, json={"requete": {"numero": "SUP-1", "statut": "attente"}, "messages": []})

    reglages = get_settings()
    ancienne = reglages.liluvine_wa_hmac
    reglages.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    support_sawali.limiteur_support.vider() if hasattr(support_sawali.limiteur_support, "vider") else None
    yield recues
    reglages.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def test_health_renvoie_l_ip(client):
    r = client.get("/api/health", headers={"X-Forwarded-For": "41.0.0.9, 10.0.0.1"})
    assert r.json() == {"ok": True, "ip": "41.0.0.9"}


def test_etat_sans_cle(client):
    assert client.get("/api/support-sawali/etat").json() == {"actif": False}


def test_visiteur_message_signe(client, sawali):
    assert client.get("/api/support-sawali/etat").json() == {"actif": True}
    r = client.post("/api/support-sawali/messages", json={
        "visiteur": "abcdef123456", "texte": "Je n'arrive pas à me connecter", "nom": "Awa", "contact": "70 00 00 00"})
    assert r.status_code == 200 and r.json()["requete"]["numero"] == "SUP-1"
    envoi = sawali[0]
    assert envoi.url.path == "/api/support-plateforme/messages"
    assert envoi.headers["X-Emetteur"] == "paiementmobile" and envoi.headers["X-Signature"]
    corps = json.loads(envoi.content)
    assert corps["utilisateur"]["id"] == "visiteur-abcdef123456"
    assert corps["utilisateur"]["telephone"] == "+22670000000" and corps["utilisateur"]["role"] == "visiteur"


def test_fil_visiteur(client, sawali):
    r = client.post("/api/support-sawali/fil", json={"visiteur": "abcdef123456", "marquer_lu": False})
    assert r.status_code == 200
    assert json.loads(sawali[0].content)["marquer_lu"] is False


def test_identifiant_invalide_refuse(client, sawali):
    r = client.post("/api/support-sawali/fil", json={"visiteur": "../x", "marquer_lu": True})
    assert r.status_code == 422 and not sawali


def test_sans_cle_503(client):
    r = client.post("/api/support-sawali/fil", json={"visiteur": "abcdef123456"})
    assert r.status_code == 503


def test_visiteur_sans_numero_valide_refuse(client, sawali):
    for contact in ("", "abc", "1234"):
        r = client.post("/api/support-sawali/messages", json={"visiteur": "abcdef123456", "texte": "Bonjour", "contact": contact})
        assert r.status_code == 422, contact
    assert not sawali


def test_compte_connecte_utilise_son_numero(client, sawali, utilisateur):
    fiche, h, _ = utilisateur
    r = client.post("/api/support-sawali/messages", headers=h, json={"visiteur": "abcdef123456", "texte": "Bonjour",
                                                                    "contact": "00 00 00 00 00"})   # ignoré : identité du compte
    assert r.status_code == 200
    u = json.loads(sawali[0].content)["utilisateur"]
    assert u["role"] != "visiteur" and u["telephone"] == fiche["telephone"]
