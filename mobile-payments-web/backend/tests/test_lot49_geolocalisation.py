"""Lot 49 — géolocalisation par compte : position des paiements, lieu des marchands, marchand retrouvé à l'arrivée."""
import pytest

import lieux_marchands
from db import db

OUAGA = (12.3714, -1.5197)


@pytest.fixture(scope="module")
def service_id(client, admin):
    """Un service « paiement marchand » actif (champ code marchand), créé une fois puis retiré (le catalogue de départ reste intact)."""
    r = client.post("/api/admin/services", headers=admin, json={
        "operateur": "OrangeGeo", "pays": "BF", "nom": "Paiement marchand", "categorie": "merchant_payment",
        "gabarit_ussd": "*144*4*{code}*{amount}#", "actif": True,
        "champs": [{"key": "code", "label": "Code marchand", "type": "numeric", "isMerchantCode": True},
                   {"key": "amount", "label": "Montant", "type": "numeric", "isMerchantCode": False}]})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    yield sid
    client.portal.call(db.services.delete_one, {"id": sid})
    client.portal.call(db.marchands_lieux.delete_many, {"operateur": "OrangeGeo"})


def _payer(client, h, service_id, code, lat, lon, precision=10):
    return client.post("/api/paiements", headers=h, json={"service_id": service_id, "valeurs": {"code": code, "amount": "500"},
                                                          "position": {"lat": lat, "lon": lon, "precision": precision}})


def test_reglage_par_compte_desactive_au_depart(client, utilisateur):
    user, h, _ = utilisateur
    assert client.get("/api/auth/moi", headers=h).json().get("geoloc") in (None, False)
    r = client.put("/api/auth/geolocalisation", headers=h, json={"actif": True})
    assert r.status_code == 200 and r.json()["geoloc"] is True
    assert client.put("/api/auth/geolocalisation", headers=h, json={"actif": False}).json()["geoloc"] is False


def test_sans_geolocalisation_aucune_position_n_est_gardee(client, utilisateur, service_id):
    _, h, _ = utilisateur
    sid = service_id
    p = _payer(client, h, sid, "100001", *OUAGA).json()
    assert "position" not in p                                                       # compte non activé : position ignorée
    assert client.portal.call(db.marchands_lieux.count_documents, {"code": "100001"}) == 0


def test_paiement_avec_geolocalisation_situe_le_marchand(client, utilisateur, service_id):
    _, h, _ = utilisateur
    client.put("/api/auth/geolocalisation", headers=h, json={"actif": True})
    sid = service_id
    p = _payer(client, h, sid, "100002", *OUAGA).json()
    assert p["position"]["lat"] == round(OUAGA[0], 4)                                # gardée (arrondie) dans l'historique du compte
    lieu = client.portal.call(db.marchands_lieux.find_one, {"code": "100002"}, {"_id": 0})
    assert lieu["n"] == 1 and abs(lieu["lat"] - OUAGA[0]) < 1e-9
    # Relevé trop imprécis : ignoré
    _payer(client, h, sid, "100002", OUAGA[0] + 0.0001, OUAGA[1], precision=900)
    assert client.portal.call(db.marchands_lieux.find_one, {"code": "100002"}, {"_id": 0})["n"] == 1


def test_marchand_retrouve_a_l_arrivee(client, utilisateur, service_id):
    _, h, _ = utilisateur
    client.put("/api/auth/geolocalisation", headers=h, json={"actif": True})
    sid = service_id
    client.post("/api/marchands", headers=h, json={"operateur": "OrangeGeo", "code": "100003", "libelle": "Boutique Salif"})
    _payer(client, h, sid, "100003", *OUAGA)
    # À 30 m : retrouvé, avec son intitulé et sa distance
    r = client.get("/api/marchands/proches", headers=h, params={"lat": OUAGA[0] + 0.00027, "lon": OUAGA[1]})
    trouves = [m for m in r.json()["marchands"] if m["code"] == "100003"]
    assert trouves and trouves[0]["libelle"] == "Boutique Salif" and 20 <= trouves[0]["distance_m"] <= 40
    # À 500 m : rien
    r = client.get("/api/marchands/proches", headers=h, params={"lat": OUAGA[0] + 0.0045, "lon": OUAGA[1]})
    assert all(m["code"] != "100003" for m in r.json()["marchands"])


def test_recherche_refusee_sans_geolocalisation_active(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/marchands/proches", headers=h, params={"lat": 12.37, "lon": -1.52}).status_code == 403


def test_releve_aberrant_ignore_quand_le_lieu_est_etabli(client):
    async def scenario():
        await db.marchands_lieux.delete_many({"code": "100004"})
        for _ in range(3):
            assert await lieux_marchands.noter("OrangeGeo", "100004", *OUAGA, 10)
        assert not await lieux_marchands.noter("OrangeGeo", "100004", OUAGA[0] + 0.01, OUAGA[1], 10)     # à ~1,1 km : paiement préparé ailleurs
        assert (await db.marchands_lieux.find_one({"code": "100004"}))["n"] == 3
    client.portal.call(scenario)
