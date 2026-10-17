"""Lot 60 — espace annonceur : relais signé vers SAWALI (devis, création, paiement, statistiques). SAWALI simulé."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings


class Recues(list):
    """Requêtes reçues par le faux SAWALI + réponses programmées par chemin."""
    reponses: dict


@pytest.fixture
def sawali():
    recues, reponses = Recues(), {}

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        code, corps = reponses.get(q.url.path.rsplit("/", 1)[-1], (200, {"ok": True}))
        return httpx.Response(code, json=corps)

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    recues.reponses = reponses
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def test_connexion_requise(client):
    assert client.get("/api/annonceur/tarifs").status_code == 401


def test_devis_relaye_avec_identite_et_sans_prix(client, utilisateur, sawali):
    fiche, h, _ = utilisateur
    sawali.reponses["devis"] = (200, {"devis": {"total": 6650}})
    r = client.post("/api/annonceur/devis", headers=h, json={"format": "banniere_image", "debut": "2026-11-01", "fin": "2026-11-07", "options": ["avant"]})
    assert r.status_code == 200 and r.json()["devis"]["total"] == 6650
    q = sawali[0]
    assert q.url.path == "/api/annonceurs-plateformes/devis" and q.headers["X-Signature"]
    corps = json.loads(q.content)
    assert corps["utilisateur"]["id"] == fiche["id"] and corps["options"] == ["avant"] and "total" not in corps and "montant" not in corps


def test_abonnement_requis_transmis(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["devis"] = (402, {"detail": {"code": "abonnement_requis", "message": "Pour passer une annonce, il faut d'abord être abonné"}})
    r = client.post("/api/annonceur/devis", headers=h, json={"format": "banniere_image", "debut": "2026-11-01", "fin": "2026-11-02"})
    assert r.status_code == 402 and "abonné" in json.dumps(r.json(), ensure_ascii=False)


def test_creation_paiement_stats(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["creer"] = (200, {"campagne": {"id": "c-12345678", "montant": 6650}})
    r = client.post("/api/annonceur/creer", headers=h, json={"nom": "Pub", "annonceur": "Awa", "format": "banniere_image", "debut": "2026-11-01",
                                                              "fin": "2026-11-07", "lien": "https://exemple.bf/x", "media": "data:image/png;base64," + "A" * 200})
    assert r.status_code == 200
    sawali.reponses["payer"] = (200, {"mode": "pawapay", "redirect_url": "https://pay.test/x"})
    r = client.post("/api/annonceur/payer", headers=h, json={"campagne_id": "c-12345678", "mode": "pawapay"})
    assert r.json()["redirect_url"] == "https://pay.test/x"
    assert json.loads(sawali[-1].content)["retour"].endswith("/annonceur?campagne=c-12345678")
    assert client.post("/api/annonceur/payer", headers=h, json={"campagne_id": "c-12345678", "mode": "autre"}).status_code == 422
    sawali.reponses["stats"] = (200, {"impressions": 10, "clics": 1})
    assert client.post("/api/annonceur/stats", headers=h, json={"campagne_id": "c-12345678"}).json()["clics"] == 1
