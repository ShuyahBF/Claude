"""Lot 222 : connexion par compte Google. Aucun accès réseau : l'échange du code avec Google est simulé."""
import base64
import json
import time

import pytest

import google_auth
from config import get_settings

CLIENT = "client-test.apps.googleusercontent.com"


def _id_token(**corps):
    base = {"iss": "https://accounts.google.com", "aud": CLIENT, "exp": int(time.time()) + 600, "sub": "g-123", "email": "awa.badini@gmail.com", "email_verified": True, "name": "BADINI Awa"}
    base.update(corps)
    brut = base64.urlsafe_b64encode(json.dumps(base).encode()).decode().rstrip("=")
    return f"x.{brut}.y"


def test_etat_signe_refuse_une_falsification_et_un_etat_perime():
    e = google_auth.signer_etat("app", "u1", "secret")
    assert google_auth.lire_etat(e, "secret")["l"] == "u1"
    assert google_auth.lire_etat(e, "autre-secret") is None
    assert google_auth.lire_etat(e[:-3] + "AAA", "secret") is None
    assert google_auth.lire_etat(e, "secret", maintenant=time.time() + 5000) is None
    assert google_auth.lire_etat("n'importe quoi", "secret") is None


def test_identite_controle_emetteur_destinataire_echeance_et_email_verifie():
    assert google_auth.identite_depuis_jeton(_id_token(), CLIENT)["email"] == "awa.badini@gmail.com"
    assert google_auth.identite_depuis_jeton(_id_token(aud="autre"), CLIENT) is None
    assert google_auth.identite_depuis_jeton(_id_token(iss="https://evil.test"), CLIENT) is None
    assert google_auth.identite_depuis_jeton(_id_token(exp=1), CLIENT) is None
    assert google_auth.identite_depuis_jeton(_id_token(email_verified=False), CLIENT) is None
    assert google_auth.identite_depuis_jeton("pas-un-jeton", CLIENT) is None


class _Reponse:
    status_code = 200

    def __init__(self, jeton):
        self._j = jeton

    def json(self):
        return {"id_token": self._j}


@pytest.fixture
def google_actif(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "google_client_id", CLIENT)
    monkeypatch.setattr(s, "google_client_secret", "secret-client-test")
    monkeypatch.setattr(s, "google_redirect_uri", "https://api.test/api/auth/google/retour")
    return s


def _simuler_google(monkeypatch, jeton):
    import httpx

    class Faux:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): return _Reponse(jeton)
    monkeypatch.setattr(httpx, "AsyncClient", Faux)


def test_inactif_sans_configuration(client):
    assert client.get("/api/auth/google/config").json() == {"disponible": False}
    assert client.get("/api/auth/google/demarrer", follow_redirects=False).status_code == 503


def test_liaison_puis_connexion_puis_code_a_usage_unique(client, utilisateur, google_actif, monkeypatch):
    fiche, entetes, mdp = utilisateur
    assert client.get("/api/auth/google/config").json() == {"disponible": True}
    # Liaison depuis le profil (connecté)
    url = client.post("/api/auth/google/lier-url", json={"cible": "web"}, headers=entetes).json()["url"]
    assert url.startswith("https://accounts.google.com/") and "prompt=select_account" in url
    etat = url.split("state=")[1].split("&")[0]
    from urllib.parse import unquote
    _simuler_google(monkeypatch, _id_token(sub="g-lie-1"))
    r = client.get("/api/auth/google/retour", params={"code": "c", "state": unquote(etat)}, follow_redirects=False)
    assert r.status_code == 302 and "lie=1" in r.headers["location"]
    assert client.get("/api/auth/google/etat", headers=entetes).json()["lie"] is True
    # Connexion : un compte lié obtient un code, qui ne sert QU'UNE fois
    etat2 = google_auth.signer_etat("web", None, get_settings().jwt_secret)
    r = client.get("/api/auth/google/retour", params={"code": "c", "state": etat2}, follow_redirects=False)
    code = r.headers["location"].split("code=")[1]
    ok = client.post("/api/auth/google/echange", json={"code": code})
    assert ok.status_code == 200 and ok.json()["user"]["id"] == fiche["id"]
    assert client.post("/api/auth/google/echange", json={"code": code}).status_code == 401


def test_identite_inconnue_ne_cree_aucun_compte(client, google_actif, monkeypatch):
    _simuler_google(monkeypatch, _id_token(sub="g-inconnu", email="inconnu@gmail.com"))
    etat = google_auth.signer_etat("web", None, get_settings().jwt_secret)
    r = client.get("/api/auth/google/retour", params={"code": "c", "state": etat}, follow_redirects=False)
    assert "erreur=aucun_compte" in r.headers["location"]


def test_un_etat_falsifie_est_refuse(client, google_actif):
    r = client.get("/api/auth/google/retour", params={"code": "c", "state": "faux.faux"}, follow_redirects=False)
    assert "erreur=etat" in r.headers["location"]


def test_cible_application_renvoie_la_page_avec_le_lien_auror(client, google_actif, monkeypatch):
    _simuler_google(monkeypatch, _id_token(sub="g-inconnu2"))
    etat = google_auth.signer_etat("app", None, get_settings().jwt_secret)
    r = client.get("/api/auth/google/retour", params={"code": "c", "state": etat})
    assert r.status_code == 200 and "auror://google?" in r.text


def test_delier_exige_le_mot_de_passe(client, utilisateur, google_actif, monkeypatch):
    fiche, entetes, mdp = utilisateur
    _simuler_google(monkeypatch, _id_token(sub="g-delier"))
    etat = google_auth.signer_etat("web", fiche["id"], get_settings().jwt_secret)
    client.get("/api/auth/google/retour", params={"code": "c", "state": etat}, follow_redirects=False)
    assert client.post("/api/auth/google/delier", json={"mot_de_passe": "faux-faux-faux"}, headers=entetes).status_code == 401
    assert client.post("/api/auth/google/delier", json={"mot_de_passe": mdp}, headers=entetes).status_code == 200
    assert client.get("/api/auth/google/etat", headers=entetes).json()["lie"] is False
