"""Lot 48 — paiement PI-SPI des abonnements (version manuelle) relayé vers SAWALI."""
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
    assert client.post("/api/abonnement/pispi", json={"formule_id": "f1"}).status_code == 401
    assert client.post("/api/abonnement/pispi/declarer", json={"reference": "ABO-12345678", "reference_bancaire": "TX-1234"}).status_code == 401


def test_demande_de_paiement_pispi(client, utilisateur, sawali):
    _, h, _ = utilisateur
    bloc = {"titre": "Payer par PI-SPI", "banque": "Ecobank", "titulaire": "SAWALI", "adresse_paiement": "sawali@ecobank", "montant_texte": "1 500 FCFA",
            "reference": "ABO-1A2B3C4D", "consigne": "Indiquez la référence.", "qr_data_url": "data:image/png;base64,AAAA"}
    sawali.reponse = (200, {"reference": "ABO-1A2B3C4D", "bloc": bloc, "automatique": False, "statut": "pispi_attente"})
    r = client.post("/api/abonnement/pispi", headers=h, json={"formule_id": "f1"})
    assert r.status_code == 200 and r.json()["reference"] == "ABO-1A2B3C4D" and r.json()["bloc"]["montant_texte"] == "1 500 FCFA"
    q = sawali[0]
    assert q.url.path == "/api/formules-plateformes/pispi/demander" and q.headers["X-Signature"]
    corps = json.loads(q.content)
    assert corps["formule_id"] == "f1" and corps["utilisateur"]["id"]


def test_pispi_indisponible_message_de_sawali(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (503, {"detail": "Paiement PI-SPI indisponible pour le moment"})
    r = client.post("/api/abonnement/pispi", headers=h, json={"formule_id": "f1"})
    assert r.status_code == 503 and r.json()["detail"] == "Paiement PI-SPI indisponible pour le moment"      # message de SAWALI transmis tel quel


def test_declaration_de_la_reference_bancaire(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"statut": "pispi_verification"})
    r = client.post("/api/abonnement/pispi/declarer", headers=h, json={"reference": "ABO-1A2B3C4D", "reference_bancaire": "  TX-998877 "})
    assert r.status_code == 200 and r.json() == {"statut": "pispi_verification"}
    assert json.loads(sawali[0].content)["reference_bancaire"] == "TX-998877"          # espaces retirés
    n = len(sawali)
    assert client.post("/api/abonnement/pispi/declarer", headers=h, json={"reference": "ABO-1A2B3C4D", "reference_bancaire": "ab"}).status_code == 422
    assert len(sawali) == n                                                               # saisie trop courte : jamais envoyée
