"""Lot 13 — mise en service : routes de l'app Android, version, présence et alerte SAWALI.

Aucun accès réseau : SAWALI est remplacé par un faux serveur (httpx.MockTransport)."""
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

import httpx
import pytest

import limiteur
import presence_sawali
import signal_connexion
import version_plateforme
from config import get_settings


# ---------------------------------------------------------------------------
# Faux serveur SAWALI : enregistre les requêtes reçues
# ---------------------------------------------------------------------------
@pytest.fixture
def sawali():
    """Active la clé HMAC et capture les signaux envoyés ; tout est remis en état ensuite."""
    recues: list[httpx.Request] = []

    def repondre(requete: httpx.Request) -> httpx.Response:
        recues.append(requete)
        return httpx.Response(200, json={"ok": True})

    reglages = get_settings()
    ancienne_cle = reglages.liluvine_wa_hmac
    reglages.liluvine_wa_hmac = "cle-de-test"
    signal_connexion._transport = httpx.MockTransport(repondre)
    yield recues
    reglages.liluvine_wa_hmac = ancienne_cle
    signal_connexion._transport = None


def attendre(recues, n=1, delai=3.0):
    """Le signal part en arrière-plan : on attend qu'il arrive (au plus `delai` secondes)."""
    fin = time.time() + delai
    while len(recues) < n and time.time() < fin:
        time.sleep(0.02)
    return recues


@pytest.fixture(autouse=True)
def _limiteurs_vides():
    """Chaque test repart avec des compteurs d'appels vides."""
    limiteur.limiteur_public.vider()
    limiteur.limiteur_lecture.vider()
    yield


# ---------------------------------------------------------------------------
# Routes de l'application Android (/api/android/…)
# ---------------------------------------------------------------------------
def test_android_operateurs_et_services_au_format_de_l_app(client):
    # Routes PUBLIQUES : aucune session nécessaire
    r = client.get("/api/android/operators")
    assert r.status_code == 200, r.text
    assert {"Orange", "Moov Africa", "Telecel Faso"} <= set(r.json())

    r = client.get("/api/android/services", params={"operator": "Orange"})
    assert r.status_code == 200, r.text
    services = r.json()
    assert services, "le catalogue de départ doit être chargé au démarrage"
    # Noms de champs EXACTS de Models.kt (Service / ServiceField)
    for s in services:
        assert set(s) == {"_id", "operator", "country", "name", "category", "ussdTemplate", "fields", "description"}
        assert s["operator"] == "Orange" and s["country"] == "BF"
        for f in s["fields"]:
            assert set(f) == {"key", "label", "type", "isMerchantCode"}
    marchand = next(s for s in services if s["category"] == "merchant_payment")
    assert marchand["ussdTemplate"] == "*144*10*{code}*{amount}#"
    assert [f["key"] for f in marchand["fields"] if f["isMerchantCode"]] == ["code"]


def test_android_services_exige_l_operateur(client):
    assert client.get("/api/android/services").status_code == 422


def test_android_service_desactive_n_est_plus_envoye(client, admin):
    services = client.get("/api/admin/services", headers=admin).json()
    cible = next(s for s in services if s["operateur"] == "Telecel Faso")
    corps = {k: v for k, v in cible.items() if k not in ("id", "cree_le", "modifie_le")}
    assert client.put(f"/api/admin/services/{cible['id']}", json={**corps, "actif": False}, headers=admin).status_code == 200
    try:
        assert "Telecel Faso" not in client.get("/api/android/operators").json()
        assert client.get("/api/android/services", params={"operator": "Telecel Faso"}).json() == []
    finally:
        client.put(f"/api/admin/services/{cible['id']}", json={**corps, "actif": True}, headers=admin)


def test_android_marchand_partage_avec_le_site(client, utilisateur):
    _, entetes, _ = utilisateur
    # Inconnu : 404 (l'app demande alors un intitulé)
    assert client.get("/api/android/merchants/Orange/778899").status_code == 404
    # Création par l'app (intitulé nettoyé de ses caractères non admis)
    r = client.post("/api/android/merchants", json={"code": "778899", "operator": "Orange", "label": "Boutique <Awa>  & fils"})
    assert r.status_code == 201, r.text
    assert r.json() == {"_id": "Orange:778899", "code": "778899", "operator": "Orange", "label": "Boutique Awa fils"}
    # Relu par l'app…
    r = client.get("/api/android/merchants/Orange/778899")
    assert r.status_code == 200 and r.json()["label"] == "Boutique Awa fils"
    # … et par le site : MÊME annuaire
    r = client.get("/api/marchands/Orange/778899", headers=entetes)
    assert r.status_code == 200 and r.json()["libelle"] == "Boutique Awa fils"
    # Un second envoi ne remplace pas l'intitulé existant
    r = client.post("/api/android/merchants", json={"code": "778899", "operator": "Orange", "label": "Autre nom"})
    assert r.status_code == 201 and r.json()["label"] == "Boutique Awa fils"


def test_android_marchand_cree_par_le_site_visible_dans_l_app(client, utilisateur):
    _, entetes, _ = utilisateur
    r = client.post("/api/marchands", json={"operateur": "Moov Africa", "code": "551122", "libelle": "Pharmacie Wend"},
                    headers=entetes)
    assert r.status_code == 201, r.text
    r = client.get("/api/android/merchants/Moov Africa/551122")
    assert r.status_code == 200
    assert r.json() == {"_id": "Moov Africa:551122", "code": "551122", "operator": "Moov Africa", "label": "Pharmacie Wend"}


@pytest.mark.parametrize("corps", [
    {"code": "12a4", "operator": "Orange", "label": "Boutique"},          # code non numérique
    {"code": "1" * 21, "operator": "Orange", "label": "Boutique"},         # code trop long
    {"code": "1234", "operator": "Opérateur fantôme", "label": "Boutique"},  # opérateur hors catalogue
    {"code": "1234", "operator": "Orange", "label": "<<>>"},               # intitulé vide une fois nettoyé
    {"code": "1234", "operator": "Orange", "label": "x" * 121},            # intitulé trop long
])
def test_android_marchand_refuse_les_saisies_invalides(client, corps):
    assert client.post("/api/android/merchants", json=corps).status_code == 422


def test_android_profil_upsert_par_telephone(client):
    corps = {"nom": "Sawadogo", "prenom": "Moussa", "email": None, "telephone": "71 22 33 44"}
    r = client.post("/api/android/users", json=corps)
    assert r.status_code == 201, r.text
    assert r.json()["telephone"] == "+22671223344"
    # Même numéro écrit autrement : mise à jour, pas de doublon ; e-mail invalide ignoré
    r = client.post("/api/android/users", json={**corps, "telephone": "+226 71 22 33 44", "prenom": "Moussa B.",
                                                "email": "pas-un-email"})
    assert r.status_code == 201, r.text
    assert client.post("/api/android/users", json={**corps, "telephone": "12"}).status_code == 422
    assert client.post("/api/android/users", json={**corps, "nom": ""}).status_code == 422


def test_android_profil_ne_cree_pas_de_compte_sur_le_site(client):
    client.post("/api/android/users", json={"nom": "Zongo", "prenom": "Ali", "telephone": "72 00 11 22"})
    r = client.post("/api/auth/connexion", json={"identifiant": "72 00 11 22", "mot_de_passe": "n-importe-quoi"})
    assert r.status_code == 401


def test_android_limitation_des_appels(client, monkeypatch):
    monkeypatch.setattr(limiteur.limiteur_public, "maximum", 3)
    corps = {"nom": "Ilboudo", "prenom": "Rasmata", "telephone": "73 00 00 01"}
    codes = [client.post("/api/android/users", json=corps).status_code for _ in range(4)]
    assert codes == [201, 201, 201, 429]


def test_limiteur_fenetre_glissante():
    lim = limiteur.Limiteur(2, fenetre=60)
    assert lim.autoriser("ip", 0) and lim.autoriser("ip", 1)
    assert not lim.autoriser("ip", 2)
    assert lim.autoriser("autre-ip", 2)
    assert lim.autoriser("ip", 61)  # le premier appel est sorti de la fenêtre


# ---------------------------------------------------------------------------
# Version (source unique frontend/src/version.js)
# ---------------------------------------------------------------------------
def test_version_lue_dans_version_js(client):
    r = client.get("/api/version")
    assert r.status_code == 200
    infos = r.json()
    assert set(infos) == {"version", "lot", "commit", "demarrage", "libelle", "libelle_detaille"}
    assert infos["lot"] == 13 and isinstance(infos["version"], int)
    assert infos["libelle"].startswith(f"Version {infos['version']} · déployée le ")
    assert "Lot" not in infos["libelle"]
    assert infos["libelle_detaille"].startswith(f"Version {infos['version']} · Lot 13 · {infos['commit']} · déployée le ")


def test_libelle_version_formats():
    date = datetime(2026, 10, 11, 21, 5, tzinfo=timezone.utc)
    assert version_plateforme.libelle(4, 13, date) == "Version 4 · déployée le 11/10/2026 21:05"
    assert version_plateforme.libelle(4, 13, date, "abc1234", detaille=True) == \
        "Version 4 · Lot 13 · abc1234 · déployée le 11/10/2026 21:05"
    assert version_plateforme.libelle(None, None, date) == "Version inconnue"


# ---------------------------------------------------------------------------
# Présence auprès de SAWALI
# ---------------------------------------------------------------------------
def test_corps_du_signal_de_presence():
    date = datetime(2026, 10, 11, 8, 0, tzinfo=timezone.utc)
    corps = presence_sawali.corps_signal("1", "paiement-mobile-api", date, date)
    assert corps["application"] == "paiement-mobile" and corps["site"] == "paiement-mobile"
    assert corps["version"] == "1" and corps["machine"] == "paiement-mobile-api"
    assert corps["deploye_le"] == corps["demarre_le"] == "2026-10-11T08:00:00+00:00"
    assert {"application", "version", "machine"} <= set(corps)


def test_presence_desactivee_pendant_les_tests():
    assert presence_sawali.presence_active() is False


# ---------------------------------------------------------------------------
# Alerte WhatsApp : connexions et visites signalées à SAWALI
# ---------------------------------------------------------------------------
def _verifier_signature(requete: httpx.Request) -> dict:
    """Contrôle les en-têtes signés comme le fait SAWALI et renvoie le corps JSON."""
    brut = requete.content.decode("utf-8")
    ts = requete.headers["X-Timestamp"]
    attendu = hmac.new(b"cle-de-test", f"{ts}.{brut}".encode("utf-8"), hashlib.sha256).hexdigest()
    assert requete.headers["X-Signature"] == attendu
    assert requete.headers["X-Emetteur"] == "paiementmobile"
    assert abs(int(ts) - time.time()) < 60
    assert str(requete.url) == "https://api.sawalismartsystems.com/api/webhook/plateforme-connexion"
    return json.loads(brut)


def test_connexion_au_site_signalee(client, utilisateur, sawali):
    user, _, mdp = utilisateur
    r = client.post("/api/auth/connexion", json={"identifiant": user["telephone"], "mot_de_passe": mdp},
                    headers={"User-Agent": "Mozilla/5.0 Test", "X-Forwarded-For": "41.1.2.3, 10.0.0.1"})
    client.cookies.clear()
    assert r.status_code == 200
    corps = _verifier_signature(attendre(sawali)[0])
    assert corps["type"] == "connexion" and corps["role"] == "utilisateur"
    assert corps["utilisateur"] == f"{user['prenom']} {user['nom']}"
    assert corps["telephone"] == user["telephone"].lstrip("+")
    assert corps["ip"] == "41.1.2.3" and corps["agent"] == "Mozilla/5.0 Test"
    assert corps["url_site"] == "https://paiement-mobile-site.onrender.com"
    assert corps["page"] == "/connexion"
    assert "mot_de_passe" not in json.dumps(corps) and mdp not in json.dumps(corps)


def test_echec_de_connexion_non_signale(client, utilisateur, sawali):
    user, _, _ = utilisateur
    client.post("/api/auth/connexion", json={"identifiant": user["telephone"], "mot_de_passe": "faux"})
    time.sleep(0.3)
    assert sawali == []


def test_profil_android_signale_comme_connexion(client, sawali):
    r = client.post("/api/android/users", json={"nom": "Ouattara", "prenom": "Fanta", "telephone": "74 55 66 77"},
                    headers={"User-Agent": "okhttp/4.12.0"})
    assert r.status_code == 201
    corps = _verifier_signature(attendre(sawali)[0])
    assert corps["type"] == "connexion" and corps["telephone"] == "22674556677"
    assert corps["utilisateur"] == "Fanta Ouattara" and corps["page"] == "app-android"


def test_visite_signalee_sauf_robots(client, sawali):
    r = client.post("/api/presence/visite", json={"visiteur": "abc123XYZ", "page": "/connexion?suite=/x"},
                    headers={"User-Agent": "Mozilla/5.0 Test"})
    assert r.json() == {"ok": True}
    corps = _verifier_signature(attendre(sawali)[0])
    assert corps["type"] == "visite" and corps["visiteur"] == "abc123XYZ"
    assert corps["page"] == "/connexion" and corps["utilisateur"] is None
    # Robot : réponse identique, mais rien n'est envoyé
    assert client.post("/api/presence/visite", json={"visiteur": "robot1"},
                       headers={"User-Agent": "Googlebot/2.1"}).json() == {"ok": True}
    time.sleep(0.3)
    assert len(sawali) == 1
    # Identifiant de visiteur mal formé : refusé
    assert client.post("/api/presence/visite", json={"visiteur": "<script>"}).status_code == 422


def test_sans_cle_aucun_signal(client, utilisateur):
    recues = []
    signal_connexion._transport = httpx.MockTransport(lambda req: recues.append(req) or httpx.Response(200))
    try:
        user, _, mdp = utilisateur
        assert get_settings().liluvine_wa_hmac == ""
        client.post("/api/auth/connexion", json={"identifiant": user["telephone"], "mot_de_passe": mdp})
        client.cookies.clear()
        time.sleep(0.3)
        assert recues == []
    finally:
        signal_connexion._transport = None


def test_sawali_en_panne_ne_gene_pas_la_connexion(client, utilisateur, sawali):
    def panne(_):
        raise httpx.ConnectError("SAWALI injoignable")
    signal_connexion._transport = httpx.MockTransport(panne)
    user, _, mdp = utilisateur
    r = client.post("/api/auth/connexion", json={"identifiant": user["telephone"], "mot_de_passe": mdp})
    client.cookies.clear()
    assert r.status_code == 200
