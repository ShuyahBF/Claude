"""Lot 111 — « paiement direct » : un service au code secret ({pin}) n'est visible que de la version directe de l'application Android."""
import pytest

from db import db
import asyncio


@pytest.fixture(autouse=True)
def service_secret():
    # Service FICTIF avec code secret, créé directement en base (le catalogue de départ n'en contient aucun)
    async def poser():
        await db.services.delete_many({"nom": "Essai code secret"})
        await db.services.insert_one({"id": "svc-secret", "operateur": "Orange", "pays": "BF", "nom": "Essai code secret", "categorie": "merchant_payment",
                                      "gabarit_ussd": "*100*{code}*{amount}*{pin}#", "champs": [
                                          {"key": "code", "label": "Code", "type": "numeric", "isMerchantCode": True},
                                          {"key": "amount", "label": "Montant", "type": "numeric"},
                                          {"key": "pin", "label": "Code secret", "type": "numeric"}], "description": "", "actif": True})
    asyncio.run(poser())
    yield
    asyncio.run(db.services.delete_many({"nom": "Essai code secret"}))


def test_play_store_ne_voit_jamais_le_code_secret(client):
    noms = [s["name"] for s in client.get("/api/android/services?operator=Orange").json()]
    assert "Essai code secret" not in noms and noms                       # les autres services restent proposés
    direct = [s["name"] for s in client.get("/api/android/services?operator=Orange&direct=true").json()]
    assert "Essai code secret" in direct


def test_le_site_ne_propose_ni_ne_garde_le_code_secret(client, utilisateur):
    _, h, _ = utilisateur
    assert "svc-secret" not in [s["id"] for s in client.get("/api/services?operateur=Orange", headers=h).json()]
    assert client.get("/api/services/svc-secret", headers=h).status_code == 404
    r = client.post("/api/paiements", headers=h, json={"service_id": "svc-secret", "valeurs": {"code": "445566", "amount": "2500", "pin": "1234"}})
    assert r.status_code == 404                                           # jamais de code secret dans l'historique du site
