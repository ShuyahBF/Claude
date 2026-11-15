"""Lot 140 — agenda Google relayé vers la passerelle de SAWALI : identité imposée par le compte connecté, signature, relais des refus."""
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


def test_connexion_requise(client):
    for chemin in ("etat", "lier", "delier", "evenements"):
        assert client.post(f"/api/agenda/{chemin}", json={}).status_code == 401


def test_l_identite_envoyee_est_celle_du_compte_connecte(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"lie": True, "email": "a@gmail.com"})
    # Le navigateur essaie d'imposer un autre utilisateur : ignoré
    r = client.post("/api/agenda/evenements", headers=h, json={"du": "2026-11-15", "utilisateur": "pirate"})
    q = sawali[0]
    corps = json.loads(q.content)
    assert r.status_code == 200 and q.url.path == "/api/webhook/agenda/evenements" and q.headers["X-Signature"] and q.headers["X-Emetteur"]
    assert corps["utilisateur"] != "pirate" and corps["utilisateur"]
    assert corps["du"] == "2026-11-15"


def test_parcours_lier_analyser_creer(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"url": "https://accounts.google.com/o/oauth2/v2/auth?x=1", "expire_minutes": 15})
    assert client.post("/api/agenda/lier", headers=h).json()["url"].startswith("https://accounts.google.com/")
    sawali.reponse = (200, {"titre": "RDV chez le dentiste", "debut": "2026-11-21T08:15:00+00:00", "manque": []})
    assert client.post("/api/agenda/analyser", headers=h, json={"texte": "samedi 8h15 rdv chez le dentiste"}).json()["titre"] == "RDV chez le dentiste"
    assert json.loads(sawali[-1].content)["texte"] == "samedi 8h15 rdv chez le dentiste"
    sawali.reponse = (200, {"ok": True, "evenement": {"id": "ev1"}})
    r = client.post("/api/agenda/creer", headers=h, json={"titre": "RDV chez le dentiste", "debut": "2026-11-21T08:15:00+00:00", "rappel_minutes": 30})
    assert r.status_code == 200 and sawali[-1].url.path == "/api/webhook/agenda/creer" and json.loads(sawali[-1].content)["rappel_minutes"] == 30


def test_demande_d_acces_avec_le_compte_google(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"etat": "attente", "gmail": "awa@gmail.com"})
    r = client.post("/api/agenda/demander", headers=h, json={"gmail": "awa@gmail.com", "utilisateur": "pirate"})
    corps = json.loads(sawali[-1].content)
    assert r.json()["etat"] == "attente" and sawali[-1].url.path == "/api/webhook/agenda/demander" and corps["gmail"] == "awa@gmail.com" and corps["utilisateur"] != "pirate"
    assert client.post("/api/agenda/demander", headers=h, json={"gmail": "x"}).status_code == 422
    sawali.reponse = (403, {"detail": "Votre demande d'accès est en attente de l'administrateur"})
    assert client.post("/api/agenda/lier", headers=h).status_code != 200


def test_refus_de_sawali_transmis_et_validations(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (409, {"detail": "Agenda non lié : reliez votre compte Google"})
    r = client.post("/api/agenda/evenements", headers=h, json={})
    assert r.status_code == 409 and "reliez" in r.json()["detail"]
    assert client.post("/api/agenda/creer", headers=h, json={"titre": "", "debut": "2026-11-21T08:15:00+00:00"}).status_code == 422
    assert client.post("/api/agenda/analyser", headers=h, json={"texte": ""}).status_code == 422
