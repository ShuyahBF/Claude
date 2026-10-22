"""Lot 56 — archives en ligne chiffrées : ce serveur relaie des octets illisibles vers SAWALI, sans jamais les lire."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings


class Recues(list):
    def __init__(self):
        super().__init__()
        self.reponse = (200, {})


@pytest.fixture
def sawali():
    recues = Recues()

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        return httpx.Response(recues.reponse[0], json=recues.reponse[1])

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


META = "M" * 40
CONTENU = "Q" * 80


def test_connexion_requise(client):
    assert client.get("/api/archives/etat").status_code == 401
    assert client.post("/api/archives", json={"meta": META, "contenu": CONTENU}).status_code == 401


def test_etat_et_liste_relayes_signes(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"abonne": True, "sel": "S" * 24, "verif": "V" * 40, "quota_octets": 200_000_000, "utilise_octets": 0, "nombre": 0, "fichier_max_octets": 8_000_000})
    r = client.get("/api/archives/etat", headers=h)
    assert r.status_code == 200 and r.json()["abonne"] is True
    q = sawali[0]
    assert q.url.path == "/api/formules-plateformes/archives/etat" and q.headers["X-Signature"] and json.loads(q.content)["utilisateur"]["id"]
    sawali.reponse = (200, {"archives": [{"id": "a1b2c3d4e5", "meta": META, "taille": 100, "cree_le": "2026-10-17T10:00:00+00:00"}]})
    assert client.get("/api/archives", headers=h).json()["archives"][0]["id"] == "a1b2c3d4e5"


def test_ajout_transmis_tel_quel_et_refus_avec_le_prix(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"id": "n1n2n3n4n5", "taille": 60, "cree_le": "x", "utilise_octets": 60})
    r = client.post("/api/archives", headers=h, json={"meta": META, "contenu": CONTENU})
    assert r.status_code == 200
    corps = json.loads(sawali[-1].content)
    assert corps["meta"] == META and corps["contenu"] == CONTENU                      # octets chiffrés relayés sans aucune modification
    detail = {"code": "abonnement_requis", "message": "Archives en ligne réservée aux abonnés. Formule « Archives » : 2 000 FCFA pour 30 jours.",
              "formule": {"id": "f1", "nom": "Archives", "prix": 2000, "duree_jours": 30}}
    sawali.reponse = (402, {"detail": detail})
    r = client.post("/api/archives", headers=h, json={"meta": META, "contenu": CONTENU})
    assert r.status_code == 402 and r.json()["detail"] == detail
    sawali.reponse = (413, {"detail": "Espace d'archives plein (200 Mo)"})
    assert client.post("/api/archives", headers=h, json={"meta": META, "contenu": CONTENU}).status_code == 413


def test_telechargement_et_suppression(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"id": "a1b2c3d4e5", "meta": META, "contenu": CONTENU})
    assert client.get("/api/archives/a1b2c3d4e5", headers=h).json()["contenu"] == CONTENU
    assert sawali[-1].url.path.endswith("/archives/telecharger") and json.loads(sawali[-1].content)["id"] == "a1b2c3d4e5"
    sawali.reponse = (200, {"ok": True})
    assert client.delete("/api/archives/a1b2c3d4e5", headers=h).json() == {"ok": True}
    sawali.reponse = (404, {"detail": "Document introuvable"})
    r = client.delete("/api/archives/zzzzzzzzzz", headers=h)
    assert r.status_code == 404 and r.json()["detail"] == "Document introuvable"


def test_validation_des_saisies(client, utilisateur, sawali):
    _, h, _ = utilisateur
    n = len(sawali)
    assert client.post("/api/archives/cle", headers=h, json={"sel": "court", "verif": "V" * 40}).status_code == 422
    assert client.post("/api/archives", headers=h, json={"meta": "x", "contenu": CONTENU}).status_code == 422
    assert len(sawali) == n


def test_modification_des_informations_chiffrees(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"ok": True})
    r = client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "N" * 48})
    assert r.status_code == 200
    q = sawali[-1]
    assert q.url.path.endswith("/archives/modifier") and json.loads(q.content)["meta"] == "N" * 48 and json.loads(q.content)["id"] == "a1b2c3d4e5"
    assert client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "court"}).status_code == 422


def test_cle_avec_enveloppe_et_secours_puis_nouvelles_enveloppes(client, utilisateur, sawali):
    """Lot 92 : l'enveloppe (clé chiffrée par la phrase) et le secours (clé chiffrée par le code) sont relayés tels quels."""
    _, h, _ = utilisateur
    sawali.reponse = (200, {"ok": True})
    assert client.post("/api/archives/cle", headers=h, json={"sel": "S" * 24, "verif": "V" * 40, "enveloppe": "E" * 40, "secours": "R" * 40}).status_code == 200
    corps = json.loads(sawali[-1].content)
    assert corps["enveloppe"] == "E" * 40 and corps["secours"] == "R" * 40 and sawali[-1].url.path.endswith("/archives/cle")
    # ancien appel sans enveloppe : toujours accepté (compatibilité)
    assert client.post("/api/archives/cle", headers=h, json={"sel": "S" * 24, "verif": "V" * 40}).status_code == 200
    assert "enveloppe" not in json.loads(sawali[-1].content)
    r = client.post("/api/archives/cle/enveloppes", headers=h, json={"verif_actuelle": "V" * 40, "enveloppe": "N" * 40})
    assert r.status_code == 200 and sawali[-1].url.path.endswith("/archives/enveloppes")
    assert json.loads(sawali[-1].content)["verif_actuelle"] == "V" * 40 and "secours" not in json.loads(sawali[-1].content)
    sawali.reponse = (409, {"detail": "Jeton de contrôle incorrect"})
    assert client.post("/api/archives/cle/enveloppes", headers=h, json={"verif_actuelle": "X" * 40, "enveloppe": "N" * 40}).status_code == 409
    n = len(sawali)
    assert client.post("/api/archives/cle/enveloppes", headers=h, json={"verif_actuelle": "court", "enveloppe": "N" * 40}).status_code == 422
    assert len(sawali) == n


def test_pin_relais_enregistrer_et_ouvrir(client, utilisateur, sawali):
    """Lot 93 : la preuve du code est relayée telle quelle ; les refus de SAWALI (essais, pause) sont rendus avec leur message."""
    _, h, _ = utilisateur
    PREUVE = "P" * 43 + "="
    sawali.reponse = (200, {"ok": True, "poivre": "Z" * 44})
    r = client.post("/api/archives/pin/enregistrer", headers=h, json={"preuve": PREUVE, "type_secret": "pin"})
    assert r.status_code == 200 and r.json()["poivre"] == "Z" * 44
    q = sawali[-1]
    assert q.url.path.endswith("/archives/pin/enregistrer") and json.loads(q.content)["preuve"] == PREUVE and "verif_actuelle" not in json.loads(q.content)
    client.post("/api/archives/pin/enregistrer", headers=h, json={"preuve": PREUVE, "type_secret": "phrase", "verif_actuelle": "V" * 40})
    assert json.loads(sawali[-1].content)["verif_actuelle"] == "V" * 40 and json.loads(sawali[-1].content)["type_secret"] == "phrase"
    assert client.post("/api/archives/pin/ouvrir", headers=h, json={"preuve": PREUVE}).json()["poivre"] == "Z" * 44
    sawali.reponse = (409, {"detail": "Code ou phrase incorrect (4 essais avant une pause)"})
    r = client.post("/api/archives/pin/ouvrir", headers=h, json={"preuve": PREUVE})
    assert r.status_code == 409 and "4 essais" in r.json()["detail"]
    sawali.reponse = (429, {"detail": "Trop d'essais : réessayez dans 15 min (ou utilisez votre code de secours)"})
    r = client.post("/api/archives/pin/ouvrir", headers=h, json={"preuve": PREUVE})
    assert r.status_code == 429 and "15 min" in r.json()["detail"]
    n = len(sawali)
    assert client.post("/api/archives/pin/ouvrir", headers=h, json={"preuve": "court"}).status_code == 422
    assert client.post("/api/archives/pin/enregistrer", headers=h, json={"preuve": PREUVE, "type_secret": "autre"}).status_code == 422
    assert len(sawali) == n


def test_application_d_authentification_relayee(client, utilisateur, sawali):
    """Lot 94 : le secret et les codes de l'application d'authentification sont relayés tels quels ; les refus de SAWALI sont rendus."""
    _, h, _ = utilisateur
    PREUVE = "P" * 43 + "="
    sawali.reponse = (200, {"secret": "ABCDEFGHIJKLMNOP", "uri": "otpauth://totp/auRor%3Ax?secret=ABCDEFGHIJKLMNOP"})
    r = client.post("/api/archives/totp/preparer", headers=h, json={"verif_actuelle": "V" * 40})
    assert r.status_code == 200 and r.json()["uri"].startswith("otpauth://") and sawali[-1].url.path.endswith("/archives/totp/preparer")
    sawali.reponse = (200, {"ok": True})
    assert client.post("/api/archives/totp/activer", headers=h, json={"code": "123456"}).status_code == 200
    assert json.loads(sawali[-1].content)["code"] == "123456"
    assert client.post("/api/archives/totp/desactiver", headers=h, json={"preuve": PREUVE, "code": "123456"}).status_code == 200
    assert json.loads(sawali[-1].content)["preuve"] == PREUVE
    # ouverture : le code de l'application est transmis seulement s'il est fourni
    sawali.reponse = (200, {"ok": True, "poivre": "Z" * 44})
    client.post("/api/archives/pin/ouvrir", headers=h, json={"preuve": PREUVE})
    assert "code_totp" not in json.loads(sawali[-1].content)
    client.post("/api/archives/pin/ouvrir", headers=h, json={"preuve": PREUVE, "code_totp": "654321"})
    assert json.loads(sawali[-1].content)["code_totp"] == "654321"
    sawali.reponse = (409, {"detail": "Code incorrect : vérifiez l'heure de votre téléphone"})
    r = client.post("/api/archives/totp/activer", headers=h, json={"code": "000000"})
    assert r.status_code == 409 and "heure" in r.json()["detail"]
    n = len(sawali)
    assert client.post("/api/archives/totp/activer", headers=h, json={"code": "12"}).status_code == 422
    assert len(sawali) == n


def test_modification_avec_preuve_et_nouvelle_image(client, utilisateur, sawali):
    """Lot 95 : la preuve du code et la nouvelle image (chiffrée) sont relayées telles quelles ; les refus de SAWALI sont rendus."""
    _, h, _ = utilisateur
    PREUVE = "P" * 43 + "="
    sawali.reponse = (200, {"ok": True, "taille": 250, "utilise_octets": 250})
    r = client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "N" * 48, "preuve": PREUVE, "contenu": CONTENU})
    assert r.status_code == 200 and r.json()["taille"] == 250
    corps = json.loads(sawali[-1].content)
    assert corps["preuve"] == PREUVE and corps["contenu"] == CONTENU and corps["id"] == "a1b2c3d4e5" and sawali[-1].url.path.endswith("/archives/modifier")
    # sans image ni preuve : comme avant (anciennes archives)
    client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "N" * 48})
    assert "preuve" not in json.loads(sawali[-1].content) and "contenu" not in json.loads(sawali[-1].content)
    sawali.reponse = (409, {"detail": "Code ou phrase incorrect (4 essais avant une pause)"})
    r = client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "N" * 48, "preuve": PREUVE})
    assert r.status_code == 409 and "4 essais" in r.json()["detail"]
    n = len(sawali)
    assert client.put("/api/archives/a1b2c3d4e5", headers=h, json={"meta": "N" * 48, "preuve": "court"}).status_code == 422
    assert len(sawali) == n
