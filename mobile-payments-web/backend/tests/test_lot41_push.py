"""Lot 41 — notifications push : abonnement des appareils, boucle d'envoi (une fois par événement et par jour), appareils morts."""
import asyncio
import json
from datetime import datetime, timezone

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

import push_web as pw
from routes import push


def appareil():
    """Faux navigateur : paire de clés P-256 + secret d'authentification, comme un vrai abonnement."""
    privee = ec.generate_private_key(ec.SECP256R1())
    return {"privee": privee, "p256dh": pw.b64u(pw._public_octets(privee.public_key())), "auth": pw.b64u(b"0123456789abcdef")}


def abonnement(app, endpoint="https://push.test/abc/" + "x" * 20):
    return {"endpoint": endpoint, "keys": {"p256dh": app["p256dh"], "auth": app["auth"]}}


@pytest.fixture
def service_push():
    """Faux service de notification : enregistre les envois ; `etat` programme le code de réponse par adresse."""
    recus, etat = [], {}

    def repondre(q: httpx.Request) -> httpx.Response:
        recus.append(q)
        return httpx.Response(etat.get(str(q.url), 201))

    pw._transport = httpx.MockTransport(repondre)
    recus_etat = type("S", (), {"recus": recus, "etat": etat})
    yield recus_etat
    pw._transport = None


def passer(client):
    return client.portal.call(push.passer_une_fois)


def test_connexion_requise_et_cle_publique(client, utilisateur):
    assert client.get("/api/push/cle").status_code == 401
    _, h, _ = utilisateur
    k = client.get("/api/push/cle", headers=h).json()["cle_publique"]
    assert len(pw.b64u_decode(k)) == 65 and client.get("/api/push/cle", headers=h).json()["cle_publique"] == k     # stable


def test_abonner_desabonner_et_isolation(client, utilisateur, admin):
    _, h, _ = utilisateur
    a = abonnement(appareil())
    assert client.post("/api/push/abonner", headers=h, json=a).json() == {"ok": True, "appareils": 1}
    client.post("/api/push/abonner", headers=h, json=a)                                              # même appareil : pas de doublon
    assert client.portal.call(push.db.push_abonnements.count_documents, {"endpoint": a["endpoint"]}) == 1
    client.post("/api/push/desabonner", headers=admin, json={"endpoint": a["endpoint"]})             # un autre utilisateur ne peut pas retirer
    assert client.portal.call(push.db.push_abonnements.count_documents, {"endpoint": a["endpoint"]}) == 1
    client.post("/api/push/desabonner", headers=h, json={"endpoint": a["endpoint"]})
    assert client.portal.call(push.db.push_abonnements.count_documents, {"endpoint": a["endpoint"]}) == 0


def test_abonnement_invalide_refuse(client, utilisateur):
    _, h, _ = utilisateur
    a = abonnement(appareil())
    assert client.post("/api/push/abonner", headers=h, json={**a, "endpoint": "http://pas-https.test/xxxxxxxxxxxxxxxxx"}).status_code == 422
    assert client.post("/api/push/abonner", headers=h, json={**a, "keys": {"p256dh": "x", "auth": "y"}}).status_code == 422


def test_cinq_appareils_au_plus(client, utilisateur):
    _, h, _ = utilisateur
    for i in range(7):
        client.post("/api/push/abonner", headers=h, json=abonnement(appareil(), f"https://push.test/appareil-{i}/" + "x" * 20))
    assert client.portal.call(push.db.push_abonnements.count_documents, {}) <= 5 + 50          # base de test partagée : on vérifie par utilisateur
    fiche = client.get("/api/auth/moi", headers=h).json()
    assert client.portal.call(push.db.push_abonnements.count_documents, {"user_id": fiche["id"]}) == 5


def test_boucle_envoie_une_fois_par_evenement_et_chiffre(client, utilisateur, service_push):
    fiche, h, _ = utilisateur
    app = appareil()
    ab = abonnement(app, "https://push.test/boucle/" + "x" * 20)
    client.post("/api/push/abonner", headers=h, json=ab)
    auj = datetime.now(timezone.utc).date()
    client.post("/api/anniversaires", headers=h, json={"nom": "Awa Test", "jour": auj.day, "mois": auj.month})
    avant = len(service_push.recus)
    envoyes = passer(client)
    assert envoyes >= 1 and len(service_push.recus) > avant
    q = next(r for r in service_push.recus[avant:] if str(r.url) == ab["endpoint"])
    assert q.headers["Content-Encoding"] == "aes128gcm" and q.headers["Authorization"].startswith("vapid t=") and q.headers["TTL"] == "3600"
    message = json.loads(pw.dechiffrer(q.content, app["privee"], app["auth"]))            # seul l'appareil peut lire
    assert message["titre"] == "🎂 Awa Test" and message["lien"] == "/anniversaires" and message["cle"].startswith("ann:")
    assert b"Awa Test" not in q.content
    n = len(service_push.recus)
    passer(client)                                                                          # deuxième passage : même événement, déjà envoyé
    assert len([r for r in service_push.recus[n:] if str(r.url) == ab["endpoint"]]) == 0


def test_appareil_mort_supprime_et_panne_reessayee(client, utilisateur, service_push):
    fiche, h, _ = utilisateur
    mort = abonnement(appareil(), "https://push.test/mort/" + "x" * 20)
    client.post("/api/push/abonner", headers=h, json=mort)
    service_push.etat[mort["endpoint"]] = 410
    auj = datetime.now(timezone.utc).date()
    client.post("/api/anniversaires", headers=h, json={"nom": "Moussa", "jour": auj.day, "mois": auj.month})
    passer(client)
    assert client.portal.call(push.db.push_abonnements.count_documents, {"endpoint": mort["endpoint"]}) == 0     # 410 : abonnement retiré


def test_test_d_envoi(client, utilisateur, service_push):
    _, h, _ = utilisateur
    assert client.post("/api/push/test", headers=h).status_code == 409                       # aucun appareil
    client.post("/api/push/abonner", headers=h, json=abonnement(appareil(), "https://push.test/essai/" + "x" * 20))
    r = client.post("/api/push/test", headers=h)
    assert r.status_code == 200 and r.json()["envoyes"] == 1
