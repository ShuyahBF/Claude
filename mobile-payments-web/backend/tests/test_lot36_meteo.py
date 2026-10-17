"""Lot 36 — météo lue chez SAWALI en arrière-plan (jamais attendue par la requête)."""
import asyncio

import httpx
import pytest

from routes import meteo


@pytest.fixture
def sawali():
    recues = []

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        if q.url.path.endswith("/geocode"):
            if q.url.params["q"].lower() == "nullepart":
                return httpx.Response(404, json={"detail": "Ville introuvable"})
            return httpx.Response(200, json={"name": "Bobo-Dioulasso", "lat": 11.18, "lon": -4.29, "country_name": "Burkina Faso", "admin1": "Hauts-Bassins"})
        return httpx.Response(200, json={"temperature": 33.1, "feels_like": 35, "humidity_pct": 40, "wind_kmh": 12,
                                         "is_day": True, "label_fr": "Ensoleillé", "icon": "sun", "fetched_at": 1})

    meteo.vider_cache()
    meteo._transport = httpx.MockTransport(repondre)
    yield recues
    meteo._transport = None
    meteo.vider_cache()


def _attendre(client):
    client.portal.call(asyncio.sleep, 0.2)


def test_connexion_requise(client):
    assert client.get("/api/meteo?lat=12&lon=-1").status_code == 401


def test_ville_en_arriere_plan_puis_servie(client, utilisateur, sawali):
    _, h, _ = utilisateur
    assert client.get("/api/meteo/ville?q=Bobo", headers=h).json() == {"en_cours": True}   # n'attend pas SAWALI
    _attendre(client)
    v = client.get("/api/meteo/ville?q=Bobo", headers=h).json()["ville"]
    assert v["nom"] == "Bobo-Dioulasso" and v["region"] == "Hauts-Bassins" and v["lat"] == 11.18
    nb = len(sawali)
    client.get("/api/meteo/ville?q=Bobo", headers=h)
    _attendre(client)
    assert len(sawali) == nb                       # servi par la mémoire


def test_ville_introuvable(client, utilisateur, sawali):
    _, h, _ = utilisateur
    client.get("/api/meteo/ville?q=Nullepart", headers=h)
    _attendre(client)
    assert client.get("/api/meteo/ville?q=Nullepart", headers=h).status_code == 404


def test_meteo_actuelle(client, utilisateur, sawali):
    _, h, _ = utilisateur
    assert client.get("/api/meteo?lat=11.18&lon=-4.29", headers=h).json() == {"en_cours": True}
    _attendre(client)
    m = client.get("/api/meteo?lat=11.18&lon=-4.29", headers=h).json()["meteo"]
    assert m["temperature"] == 33.1 and m["libelle"] == "Ensoleillé" and m["humidite"] == 40


def test_sawali_injoignable(client, utilisateur):
    _, h, _ = utilisateur
    meteo.vider_cache()
    meteo._transport = httpx.MockTransport(lambda q: (_ for _ in ()).throw(httpx.ConnectError("hors ligne")))
    try:
        assert client.get("/api/meteo?lat=1&lon=1", headers=h).status_code == 200
        _attendre(client)
        assert client.get("/api/meteo?lat=1&lon=1", headers=h).json() == {"en_cours": True}   # rien en mémoire : on réessaiera
    finally:
        meteo._transport = None
        meteo.vider_cache()
