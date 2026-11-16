"""Lot 166 — journal intime : conversation avec Liluvine relayée vers SAWALI ; accord de l'utilisateur obligatoire ; rien n'est gardé ici."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings
from routes.journal_intime import VERSION_MENTIONS

MSG = [{"role": "user", "content": "Aujourd'hui j'ai eu une longue journée."}]


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
    assert client.post("/api/journal-intime/liluvine", json={"messages": MSG, "consentement": True, "version_mentions": VERSION_MENTIONS}).status_code == 401


def test_sans_accord_rien_ne_part_vers_sawali(client, utilisateur, sawali):
    _, h, _ = utilisateur
    assert client.post("/api/journal-intime/liluvine", headers=h, json={"messages": MSG}).status_code == 422
    assert client.post("/api/journal-intime/liluvine", headers=h, json={"messages": MSG, "consentement": False, "version_mentions": VERSION_MENTIONS}).status_code == 422
    r = client.post("/api/journal-intime/liluvine", headers=h, json={"messages": MSG, "consentement": True, "version_mentions": "ancienne"})
    assert r.status_code == 422 and "approuver" in r.json()["detail"]
    assert len(sawali) == 0


def test_reponse_de_liluvine_relayee_et_signee(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"reponse": "Je comprends.", "urgence": False, "restant_aujourdhui": 39, "essais_restants": 4})
    r = client.post("/api/journal-intime/liluvine", headers=h, json={"messages": MSG, "consentement": True, "version_mentions": VERSION_MENTIONS})
    assert r.status_code == 200 and r.json() == {"reponse": "Je comprends.", "urgence": False, "restant_aujourdhui": 39, "essais_restants": 4}
    q = sawali[0]
    assert q.url.path == "/api/coach-plateformes/repondre" and q.headers["X-Signature"]
    corps = json.loads(q.content)
    assert corps["messages"] == MSG and corps["utilisateur"]["id"] and "consentement" not in corps


def test_urgence_et_abonnement_requis_transmis_tels_quels(client, utilisateur, sawali):
    _, h, _ = utilisateur
    ok = {"messages": MSG, "consentement": True, "version_mentions": VERSION_MENTIONS}
    sawali.reponse = (200, {"reponse": "Votre vie compte.", "urgence": True})
    assert client.post("/api/journal-intime/liluvine", headers=h, json=ok).json()["urgence"] is True
    detail = {"code": "abonnement_requis", "message": "Vos échanges d'essai sont terminés. Formule « Coach » : 2 000 FCFA pour 30 jours.", "formule": {"id": "f", "nom": "Coach", "prix": 2000, "duree_jours": 30}}
    sawali.reponse = (402, {"detail": detail})
    r = client.post("/api/journal-intime/liluvine", headers=h, json=ok)
    assert r.status_code == 402 and r.json()["detail"] == detail


def test_messages_bornes(client, utilisateur, sawali):
    _, h, _ = utilisateur
    base = {"consentement": True, "version_mentions": VERSION_MENTIONS}
    assert client.post("/api/journal-intime/liluvine", headers=h, json={**base, "messages": []}).status_code == 422
    assert client.post("/api/journal-intime/liluvine", headers=h, json={**base, "messages": [{"role": "system", "content": "x"}]}).status_code == 422
    assert client.post("/api/journal-intime/liluvine", headers=h, json={**base, "messages": [{"role": "user", "content": "x" * 2001}]}).status_code == 422
    assert len(sawali) == 0
