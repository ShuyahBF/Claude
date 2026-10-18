"""Lot 30 — annonces de la régie SAWALI affichées dans auRor.
Aucun accès réseau : SAWALI est remplacé par un faux serveur (httpx.MockTransport)."""
import asyncio
import json

import httpx
import pytest

from routes import publicites

BANNIERES = [
    {"id": "pm1", "image_url": "https://exemple.bf/a.jpg", "target_url": "https://exemple.bf/promo", "name": "Promo",
     "advertiser_name": "Boutique", "media_kind": "image", "active_variant": "a"},
    {"id": "pm2", "image_url": "https://exemple.bf/b.mp4", "target_url": "https://exemple.bf/b", "media_kind": "video",
     "active_variant": "b"},
    {"id": "sans-image", "image_url": "", "target_url": "https://exemple.bf"},   # inutilisable : écartée
]


@pytest.fixture
def sawali():
    """Faux SAWALI : liste d'annonces + enregistrement des impressions / clics relayés."""
    recues: list[httpx.Request] = []

    def repondre(requete: httpx.Request) -> httpx.Response:
        recues.append(requete)
        if requete.url.path.endswith("/liste"):
            return httpx.Response(200, json={"banners": BANNIERES})
        return httpx.Response(200, json={"ok": True})

    publicites.vider_cache()
    publicites._transport = httpx.MockTransport(repondre)
    yield recues
    publicites._transport = None
    publicites.vider_cache()


def _attendre(client):
    """Laisse finir les tâches d'arrière-plan lancées par la requête précédente."""
    client.portal.call(asyncio.sleep, 0.2)


def test_liste_demande_une_connexion(client):
    assert client.get("/api/publicites").status_code == 401


def test_liste_lue_en_arriere_plan_puis_servie(client, utilisateur, sawali):
    _, h, _ = utilisateur
    premiere = client.get("/api/publicites", headers=h).json()
    assert premiere == {"annonces": [], "en_cours": True}      # la requête n'attend pas SAWALI
    _attendre(client)
    suite = client.get("/api/publicites", headers=h).json()
    assert suite["en_cours"] is False
    assert [a["id"] for a in suite["annonces"]] == ["pm1", "pm2"]            # l'annonce sans image est écartée
    assert suite["annonces"][1]["video"] is True and suite["annonces"][1]["variante"] == "b"
    assert sawali[0].url.params["placement"] == "paiementmobile"
    # Deuxième lecture dans les 60 s : aucun nouvel appel à SAWALI
    nb = len(sawali)
    client.get("/api/publicites", headers=h)
    _attendre(client)
    assert len(sawali) == nb


def test_impression_et_clic_relayes_sans_doublon(client, utilisateur, sawali):
    _, h, _ = utilisateur
    client.get("/api/publicites", headers=h)
    _attendre(client)
    for _ in range(3):
        assert client.post("/api/publicites/pm1/impression", headers=h).json() == {"ok": True}
    r = client.post("/api/publicites/pm2/clic", headers=h)
    assert r.json() == {"ok": True, "url": "https://exemple.bf/b"}
    client.post("/api/publicites/pm2/clic", headers=h)
    _attendre(client)
    relais = [(q.url.path.split("/")[-1], q.url.path.split("/")[-2], q.url.params["variant"])
              for q in sawali if "/ad-banners/pm" in q.url.path]
    # une seule impression pour pm1 malgré 3 appels, un seul clic pour pm2 (variante b) malgré 2 appels
    assert relais.count(("impression", "pm1", "a")) == 1
    assert relais.count(("click", "pm2", "b")) == 1


def test_annonce_inconnue_refusee(client, utilisateur, sawali):
    _, h, _ = utilisateur
    client.get("/api/publicites", headers=h)
    _attendre(client)
    assert client.post("/api/publicites/inconnue/clic", headers=h).status_code == 404


def test_sawali_injoignable_ne_casse_rien(client, utilisateur):
    _, h, _ = utilisateur
    publicites.vider_cache()

    def panne(requete):
        raise httpx.ConnectError("hors ligne")

    publicites._transport = httpx.MockTransport(panne)
    try:
        assert client.get("/api/publicites", headers=h).status_code == 200
        _attendre(client)
        assert client.get("/api/publicites", headers=h).json()["annonces"] == []
    finally:
        publicites._transport = None
        publicites.vider_cache()


def test_adresses_relatives_de_sawali_rendues_completes():
    """Lot 49 : une annonce dont le fichier est « /api/files/<id> » doit pointer vers SAWALI, jamais vers auRor."""
    from routes.publicites import _absolue, _vue
    a = _vue({"id": "x", "image_url": "/api/files/abc", "target_url": "/api/files/abc", "media_kind": "video"})
    assert a["image"] == "https://api.sawalismartsystems.com/api/files/abc" and a["url"] == a["image"] and a["video"] is True
    assert _absolue("/garde") == "https://sawalismartsystems.com/garde"                      # page du site de SAWALI
    assert _absolue("https://exemple.com/pub.mp4") == "https://exemple.com/pub.mp4"          # adresse complète : inchangée
    assert _absolue("//cdn.exemple.com/p.jpg") == "https://cdn.exemple.com/p.jpg"
    assert _absolue("") == ""
