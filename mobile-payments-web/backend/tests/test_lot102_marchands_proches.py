"""Lot 102 — liste de TOUS les marchands proches (rayon réglable par l'administrateur) à choisir ; avant : 3 au plus, un seul proposé."""
import pytest

import reglages_securite
from db import db

CENTRE = (12.3714, -1.5197)
DEGRE = 111_000.0


@pytest.fixture(autouse=True)
def _rayon_par_defaut(client, admin):
    """Chaque test repart du rayon par défaut (50 m)."""
    reglages_securite.vider_cache_rayon()
    yield
    client.portal.call(db.reglages_plateforme.delete_one, {"_id": "rayon_marchands"})
    client.portal.call(db.marchands_lieux.delete_many, {"operateur": "OrangeProche"})
    reglages_securite.vider_cache_rayon()


def _poser(client, code, metres_nord, libelle=None):
    """Un marchand à `metres_nord` mètres au nord du centre (relevé direct, comme après un paiement géolocalisé)."""
    client.portal.call(db.marchands_lieux.insert_one, {"operateur": "OrangeProche", "code": code, "lat": CENTRE[0] + metres_nord / DEGRE,
                                                       "lon": CENTRE[1], "n": 3, "maj": "2026-10-29T10:00:00+00:00"})
    if libelle:
        client.portal.call(db.marchands.insert_one, {"operateur": "OrangeProche", "code": code, "libelle": libelle})


def test_toute_la_liste_dans_le_rayon_et_tri_par_distance(client, utilisateur):
    _, h, _ = utilisateur
    client.put("/api/auth/geolocalisation", headers=h, json={"actif": True})
    for i in range(10):                                           # dix marchands à 4, 8, … 40 m : avant le lot 102, seuls 3 étaient listés
        _poser(client, f"7000{i:02d}", 4 * (i + 1), libelle=f"Boutique {i}")
    _poser(client, "700099", 60)                                   # hors rayon de 50 m
    r = client.get("/api/marchands/proches", headers=h, params={"lat": CENTRE[0], "lon": CENTRE[1]}).json()
    assert r["rayon_m"] == 50
    codes = [m["code"] for m in r["marchands"] if m["operateur"] == "OrangeProche"]
    assert codes == [f"7000{i:02d}" for i in range(10)]            # les dix, le plus proche d'abord ; le 11e (60 m) est exclu
    assert r["marchands"][0]["libelle"] == "Boutique 0" and r["marchands"][0]["distance_m"] <= 5


def test_rayon_regle_par_l_administrateur_seulement(client, admin, utilisateur):
    _, h, _ = utilisateur
    client.put("/api/auth/geolocalisation", headers=h, json={"actif": True})
    _poser(client, "700201", 40)
    _poser(client, "700202", 90)
    chercher = lambda: [m["code"] for m in client.get("/api/marchands/proches", headers=h, params={"lat": CENTRE[0], "lon": CENTRE[1]}).json()["marchands"]
                        if m["operateur"] == "OrangeProche"]
    assert chercher() == ["700201"]                                # 50 m par défaut
    assert client.put("/api/admin/comptes/reglage-rayon-marchands", headers=h, json={"metres": 100}).status_code in (401, 403)   # pas un utilisateur
    assert client.put("/api/admin/comptes/reglage-rayon-marchands", headers=admin, json={"metres": 77}).status_code == 422       # liste fermée
    assert client.put("/api/admin/comptes/reglage-rayon-marchands", headers=admin, json={"metres": 100}).json()["rayon_marchands_m"] == 100
    assert chercher() == ["700201", "700202"]
    assert client.put("/api/admin/comptes/reglage-rayon-marchands", headers=admin, json={"metres": 20}).status_code == 200
    assert chercher() == []                                        # à 20 m, plus personne
    liste = client.get("/api/admin/comptes", headers=admin).json()
    assert liste["rayon_marchands_m"] == 20 and liste["choix_rayon_marchands"] == [20, 30, 50, 75, 100, 150, 200]
