"""Lot 120 — paiement direct par la liste des marchands : services à code secret, statut « envoyé », position des marchands."""
import asyncio

import pytest

from db import db

SERVICE = "svc-direct-essai"


@pytest.fixture(autouse=True)
def donnees():
    async def poser():
        await db.services.delete_many({"id": SERVICE})
        await db.services.insert_one({"id": SERVICE, "operateur": "Orange", "pays": "BF", "nom": "Essai direct", "categorie": "merchant_payment",
                                      "gabarit_ussd": "*100*{code}*{amount}*{pin}#", "champs": [
                                          {"key": "code", "label": "Code", "type": "numeric", "isMerchantCode": True},
                                          {"key": "amount", "label": "Montant", "type": "numeric"},
                                          {"key": "pin", "label": "Code secret", "type": "numeric"}], "description": "", "actif": True})
        await db.marchands.delete_many({"code": "445566"})
        await db.marchands.insert_one({"operateur": "Orange", "code": "445566", "libelle": "BOUTIQUE TEST", "modifie_le": "2026-01-01"})
        await db.marchands_lieux.delete_many({"code": "445566"})
    asyncio.run(poser())
    yield
    asyncio.run(db.services.delete_many({"id": SERVICE}))


def test_le_code_secret_reste_un_mot_et_jamais_une_valeur(client, utilisateur):
    _, h, _ = utilisateur
    corps = {"service_id": SERVICE, "valeurs": {"code": "445566", "amount": "2500"}}
    assert client.post("/api/paiements", headers=h, json=corps).status_code == 404            # site / Play Store : service invisible
    direct = {**h, "X-AuRor-Direct": "1"}
    r = client.post("/api/paiements", headers=direct, json=corps)
    assert r.status_code == 201
    p = r.json()
    assert p["code_ussd"] == "*100*445566*2500*PIN#" and p["lien_tel"] is None and "pin" not in p["valeurs"]    # le mot PIN, jamais de valeur
    # le catalogue montre le service à l'application direct seulement
    assert SERVICE not in [s["id"] for s in client.get("/api/services?operateur=Orange", headers=h).json()]
    assert SERVICE in [s["id"] for s in client.get("/api/services?operateur=Orange", headers=direct).json()]


def test_un_paiement_envoye_ne_peut_plus_etre_abandonne(client, utilisateur):
    _, h, _ = utilisateur
    direct = {**h, "X-AuRor-Direct": "1"}
    p = client.post("/api/paiements", headers=direct, json={"service_id": SERVICE, "valeurs": {"code": "445566", "amount": "100"}}).json()
    assert client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "envoye"}).status_code == 200
    r = client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "abandonne"})
    assert r.status_code == 403 and "J'ai payé" in r.json()["detail"]
    assert client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "effectue"}).status_code == 200        # « J'ai payé » / SMS reçu
    # un paiement seulement préparé reste abandonnable
    q = client.post("/api/paiements", headers=direct, json={"service_id": SERVICE, "valeurs": {"code": "445566", "amount": "100"}}).json()
    assert client.put(f"/api/paiements/{q['id']}/statut", headers=h, json={"statut": "abandonne"}).status_code == 200


def test_liste_des_marchands_et_position(client, utilisateur):
    _, h, _ = utilisateur
    m = [x for x in client.get("/api/marchands?q=445566", headers=h).json() if x["code"] == "445566"][0]
    assert m["a_position"] is False
    position = {"lat": 12.37, "lon": -1.52, "precision": 20}
    # compte sans géolocalisation : refusé (la position de l'utilisateur ne sert que s'il l'a activée)
    client.put("/api/auth/geolocalisation", headers=h, json={"actif": False})
    assert client.post("/api/marchands/Orange/445566/position", headers=h, json=position).status_code == 403
    client.put("/api/auth/geolocalisation", headers=h, json={"actif": True})
    assert client.post("/api/marchands/Orange/999999/position", headers=h, json=position).status_code == 404         # marchand inconnu
    assert client.post("/api/marchands/Orange/445566/position", headers=h, json=position).json() == {"retenu": True}
    m = [x for x in client.get("/api/marchands?q=445566", headers=h).json() if x["code"] == "445566"][0]
    assert m["a_position"] is True                                                                                    # la liste n'affiche plus « enregistrer la position »
    # une position trop imprécise est ignorée
    assert client.post("/api/marchands/Orange/445566/position", headers=h, json={**position, "precision": 500}).json() == {"retenu": False}
