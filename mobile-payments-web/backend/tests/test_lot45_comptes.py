"""Lot 45 — liste des comptes (connexion, déconnexion, IP, abonnements actifs) et blocage par l'administrateur."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings
from routes import comptes


class Recues(list):
    """Liste des corps reçus par le faux SAWALI ; `.reponse` = ce qu'il répond."""
    def __init__(self):
        super().__init__()
        self.reponse = {"abonnes": {}}


@pytest.fixture
def sawali():
    comptes.vider_cache()
    recues = Recues()

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(json.loads(q.content))
        return httpx.Response(200, json=recues.reponse)

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None
    comptes.vider_cache()


def _connecter(client, user, mdp, ip="41.138.1.2"):
    """Connexion de l'utilisateur ; on efface le cookie reçu (il passerait avant l'en-tête « Bearer » de l'administrateur)."""
    r = client.post("/api/auth/connexion", headers={"X-Forwarded-For": ip}, json={"identifiant": user["telephone"], "mot_de_passe": mdp})
    client.cookies.clear()
    return r


def _fiche(client, admin, user):
    r = client.get("/api/admin/comptes", headers=admin, params={"q": user["telephone"]})
    assert r.status_code == 200
    return r.json()["comptes"][0]


def test_reserve_a_l_administrateur(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/admin/comptes", headers=h).status_code == 403
    assert client.post("/api/admin/comptes/abonnements", headers=h, json={"ids": []}).status_code == 403


def test_connexion_ip_puis_deconnexion(client, admin, utilisateur):
    user, _, mdp = utilisateur
    assert _fiche(client, admin, user)["derniere_connexion"]                     # l'inscription ouvre déjà une session
    r = _connecter(client, user, mdp)
    assert r.status_code == 200
    f = _fiche(client, admin, user)
    assert f["derniere_ip"] == "41.138.1.2" and f["derniere_connexion"] and f["session_ouverte"] is True
    jeton = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.cookies.clear()
    assert client.post("/api/auth/deconnexion", headers=jeton).status_code == 200
    f = _fiche(client, admin, user)
    assert f["derniere_deconnexion"] and f["session_ouverte"] is False
    c = client.get(f"/api/admin/comptes/{user['id']}/connexions", headers=admin).json()["connexions"]
    assert c[0]["ip"] == "41.138.1.2" and c[0]["fermee_le"]


def test_abonnements_actifs_lus_chez_sawali_et_mis_en_cache(client, admin, utilisateur, sawali):
    user, _, _ = utilisateur
    actif = [{"formule": "Voix", "fonctions": ["transcription_vocale"], "expire_le": "2026-11-16T00:00:00+00:00", "jours_restants": 30}]
    sawali.reponse["abonnes"] = {user["id"]: actif}
    r = client.post("/api/admin/comptes/abonnements", headers=admin, json={"ids": [user["id"], "sans-abonnement"]})
    assert r.json() == {"abonnes": {user["id"]: actif}}                          # seul le compte abonné figure, avec son expiration
    assert sawali[0]["utilisateurs"] == [user["id"], "sans-abonnement"]
    client.post("/api/admin/comptes/abonnements", headers=admin, json={"ids": [user["id"]]})
    assert len(sawali) == 1                                                       # 2e lecture servie par le cache de 60 s


def test_blocage_deconnecte_et_empeche_la_connexion(client, admin, utilisateur):
    user, h, mdp = utilisateur
    assert client.get("/api/auth/moi", headers=h).status_code == 200
    r = client.put(f"/api/admin/comptes/{user['id']}/blocage", headers=admin, json={"bloque": True})
    assert r.status_code == 200 and r.json()["bloque"] is True
    assert client.get("/api/auth/moi", headers=h).status_code == 401              # session coupée aussitôt
    refus = _connecter(client, user, mdp)
    assert refus.status_code == 403 and "bloqué" in refus.json()["detail"]
    mauvais = _connecter(client, user, "faux-mot-de-passe")
    assert mauvais.status_code == 401 and "bloqué" not in mauvais.json()["detail"]   # rien révélé sans le bon mot de passe
    assert client.put(f"/api/admin/comptes/{user['id']}/blocage", headers=admin, json={"bloque": False}).json()["bloque"] is False
    assert _connecter(client, user, mdp).status_code == 200


def test_un_administrateur_ne_peut_pas_etre_bloque(client, admin):
    moi = client.get("/api/auth/moi", headers=admin).json()
    assert client.put(f"/api/admin/comptes/{moi['id']}/blocage", headers=admin, json={"bloque": True}).status_code == 422
    assert client.put("/api/admin/comptes/inconnu/blocage", headers=admin, json={"bloque": True}).status_code == 404
