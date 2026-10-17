"""Lot 43 — pharmacies de garde : contenu de SAWALI, recherche limitée à 10 par jour."""
import time

import httpx
import pytest

from routes import garde

LISTE = {"ok": True, "week_number": 41, "groupe_garde": 1, "monday": "2026-10-10", "sunday": "2026-10-17",
         "cms_header": "", "cms_footer": "",
         "officines": [{"id": "a", "name": "Avenir", "city": "Ouagadougou", "location_hint": "Babanguida"},
                       {"id": "b", "name": "Amaro", "city": "Ouagadougou", "location_hint": "Gounghin"}],
         "assist_officines": [{"id": "c", "name": "Ar-rahma", "city": "Ouagadougou", "location_hint": "Tampouy"}]}


@pytest.fixture
def sawali():
    garde.vider_cache()
    appels = []

    def repondre(q: httpx.Request) -> httpx.Response:
        appels.append(q)
        return httpx.Response(200, json=LISTE)

    garde._transport = httpx.MockTransport(repondre)
    yield appels
    garde._transport = None
    garde.vider_cache()


def _attendre(client, h):
    """Règle 7 : la 1re réponse est « en_cours » ; on redemande jusqu'à avoir la liste."""
    for _ in range(50):
        r = client.get("/api/garde", headers=h)
        if "garde" in r.json():
            return r.json()
        time.sleep(0.05)
    raise AssertionError("liste jamais reçue")


def test_connexion_requise(client):
    assert client.get("/api/garde").status_code == 401


def test_affichage_libre_et_en_arriere_plan(client, utilisateur, sawali):
    _, h, _ = utilisateur
    assert client.get("/api/garde", headers=h).json() == {"en_cours": True}   # ne fait pas attendre la page
    d = _attendre(client, h)
    assert [o["name"] for o in d["garde"]["officines"]] == ["Avenir", "Amaro"] and d["garde"]["semaine"] == 41
    assert d["recherches_restantes"] == 10                                      # afficher ne décompte rien
    _attendre(client, h)
    assert len(sawali) == 1                                                     # une seule lecture grâce au cache


def test_recherche_filtre_et_decompte(client, utilisateur, sawali):
    _, h, _ = utilisateur
    _attendre(client, h)
    r = client.post("/api/garde/recherche", headers=h, json={"q": "Tampouy"}).json()
    assert [o["name"] for o in r["garde"]["appui"]] == ["Ar-rahma"] and r["garde"]["officines"] == [] and r["recherches_restantes"] == 9


def test_dixieme_recherche_ok_onzieme_refusee(client, utilisateur, sawali):
    _, h, _ = utilisateur
    _attendre(client, h)
    for i in range(10):
        r = client.post("/api/garde/recherche", headers=h, json={"q": "ama"})
        assert r.status_code == 200 and r.json()["recherches_restantes"] == 9 - i
    r = client.post("/api/garde/recherche", headers=h, json={"q": "ama"})
    assert r.status_code == 429 and "10 recherches" in r.json()["detail"]
    assert client.get("/api/garde", headers=h).json()["recherches_restantes"] == 0
    assert client.get("/api/garde", headers=h).status_code == 200               # la liste complète reste visible
