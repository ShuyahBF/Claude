"""Lot 192 — paiement préparé HORS CONNEXION puis rattrapé : idempotent, code recalculé par le serveur, pas de retour en arrière du statut."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest

import routes.paiements as paiements
from db import db


@pytest.fixture(autouse=True)
def service_essai():
    async def poser():
        await db.services.delete_many({"nom": "Essai hors ligne"})
        await db.services.insert_one({"id": "svc-hl", "operateur": "Orange", "pays": "BF", "nom": "Essai hors ligne", "categorie": "merchant_payment",
                                      "gabarit_ussd": "*100*{code}*{amount}*{pin}#", "champs": [
                                          {"key": "code", "label": "Code", "type": "numeric", "isMerchantCode": True},
                                          {"key": "amount", "label": "Montant", "type": "numeric"},
                                          {"key": "pin", "label": "Code secret", "type": "numeric"}], "description": "", "actif": True})
    asyncio.run(poser())
    yield
    asyncio.run(db.services.delete_many({"nom": "Essai hors ligne"}))


DIRECT = {"X-AuRor-Direct": "1"}


def nouvel_id() -> str:
    """Identifiant « local-… » neuf (la base de test est partagée par toute la série)."""
    return "local-" + str(uuid.uuid4())


def corps(identifiant=None, **plus):
    return {"id": identifiant or nouvel_id(), "service_id": "svc-hl", "valeurs": {"code": "6557908", "amount": "2500"}, **plus}


def test_rattrapage_cree_le_paiement_avec_un_code_recalcule(client, utilisateur):
    _, h, _ = utilisateur
    c = corps(code_ussd="*999#", statut="envoye")
    r = client.post("/api/paiements/hors-ligne", headers={**h, **DIRECT}, json=c)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["id"] == c["id"] and p["code_ussd"] == "*100*6557908*2500*PIN#"      # le code vient du serveur, jamais du téléphone
    assert p["statut"] == "envoye" and p["montant"] == 2500 and p["hors_ligne"] is True
    assert "*999#" not in str(p)


def test_rattrapage_idempotent_et_statut_sans_retour_en_arriere(client, utilisateur):
    _, h, _ = utilisateur
    en = {**h, **DIRECT}
    ident = nouvel_id()
    assert client.post("/api/paiements/hors-ligne", headers=en, json=corps(ident, statut="prepare")).status_code == 201
    client.post("/api/paiements/hors-ligne", headers=en, json=corps(ident, statut="effectue"))
    r = client.post("/api/paiements/hors-ligne", headers=en, json=corps(ident, statut="prepare"))        # renvoi tardif d'un ancien état
    assert r.json()["statut"] == "effectue"
    historique = [p for p in client.get("/api/paiements", headers=h).json() if p["id"] == ident]
    assert len(historique) == 1                                                                         # jamais de doublon


def test_rattrapage_refuse_service_inconnu_saisie_invalide_et_identifiant_etranger(client, utilisateur):
    _, h, _ = utilisateur
    en = {**h, **DIRECT}
    assert client.post("/api/paiements/hors-ligne", headers=en, json={**corps(), "service_id": "inconnu"}).status_code == 404
    assert client.post("/api/paiements/hors-ligne", headers=en, json={**corps(), "valeurs": {"code": "12ab", "amount": "2500"}}).status_code == 400
    assert client.post("/api/paiements/hors-ligne", headers=en, json={**corps(), "id": "n-importe-quoi"}).status_code == 422             # préfixe « local- » obligatoire
    assert client.post("/api/paiements/hors-ligne", headers=en, json=corps()).status_code == 201


def test_identifiant_deja_pris_par_un_autre_compte(client, utilisateur):
    _, h, _ = utilisateur
    ident = nouvel_id()
    assert client.post("/api/paiements/hors-ligne", headers={**h, **DIRECT}, json=corps(ident)).status_code == 201
    r = client.post("/api/auth/inscription", json={"nom": "Autre", "prenom": "Compte", "telephone": "70 99 99 99", "email": "autre-hl@test.bf", "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.post("/api/paiements/hors-ligne", headers={**h2, **DIRECT}, json=corps(ident)).status_code == 409


def test_date_declaree_plausible_seulement():
    maintenant = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
    ok = (maintenant - timedelta(days=2)).isoformat()
    assert paiements.date_hors_ligne(ok, maintenant) == ok
    for mauvaise in ((maintenant + timedelta(days=3)).isoformat(), (maintenant - timedelta(days=90)).isoformat(), "n'importe quoi", None):
        assert paiements.date_hors_ligne(mauvaise, maintenant) == maintenant.isoformat()
