"""Lot 42 — transcription vocale relayée vers SAWALI : abonnement requis, limites, durée."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings

AUDIO = "data:audio/webm;base64," + "A" * 200


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
    assert client.post("/api/voix", json={"audio": AUDIO, "duree_s": 5}).status_code == 401


def test_note_transcrite(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"ok": True, "texte": "Bonjour, je serai en retard.", "duree_s": 12.5, "restant_aujourdhui": 9})
    r = client.post("/api/voix", headers=h, json={"audio": AUDIO, "duree_s": 12.5})
    assert r.status_code == 200 and r.json() == {"texte": "Bonjour, je serai en retard.", "restant_aujourdhui": 9}
    q = sawali[0]
    assert q.url.path == "/api/formules-plateformes/transcrire" and q.headers["X-Signature"]
    corps = json.loads(q.content)
    assert corps["audio"] == AUDIO and corps["duree_s"] == 12.5 and corps["utilisateur"]["id"]


def test_abonnement_requis_avec_le_prix(client, utilisateur, sawali):
    _, h, _ = utilisateur
    detail = {"code": "abonnement_requis", "message": "Transcription vocale réservée aux abonnés. Formule « Voix » : 1 500 FCFA pour 30 jours.",
              "formule": {"id": "f2", "nom": "Voix", "prix": 1500, "duree_jours": 30}}
    sawali.reponse = (402, {"detail": detail})
    r = client.post("/api/voix", headers=h, json={"audio": AUDIO, "duree_s": 5})
    assert r.status_code == 402 and r.json()["detail"] == detail


def test_limite_du_jour_et_note_trop_longue(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (429, {"detail": "Limite atteinte : 10 notes vocales par jour. Réessayez demain."})
    r = client.post("/api/voix", headers=h, json={"audio": AUDIO, "duree_s": 5})
    assert r.status_code == 429 and "10 notes" in r.json()["detail"]
    n = len(sawali)
    assert client.post("/api/voix", headers=h, json={"audio": AUDIO, "duree_s": 45}).status_code == 422         # plus de 30 s : jamais envoyée
    assert client.post("/api/voix", headers=h, json={"audio": AUDIO, "duree_s": 0}).status_code == 422
    assert len(sawali) == n
