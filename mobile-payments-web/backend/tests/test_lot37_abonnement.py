"""Lot 37 — abonnement et parrainage relayés vers SAWALI (requêtes signées). SAWALI simulé (httpx.MockTransport)."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings


class Recues(list):
    """Requêtes reçues par le faux SAWALI + réponses programmées par chemin."""
    def __init__(self):
        super().__init__()
        self.reponses = {}


@pytest.fixture
def sawali():
    recues = Recues()
    reponses = recues.reponses

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        chemin = q.url.path.rsplit("/", 1)[-1]
        code, corps = reponses.get(chemin, (200, {"ok": True}))
        return httpx.Response(code, json=corps)

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def test_connexion_requise(client):
    assert client.get("/api/abonnement").status_code == 401


def test_vitrine_signee_avec_l_identite_du_compte(client, utilisateur, sawali):
    fiche, h, _ = utilisateur
    sawali.reponses["catalogue"] = (200, {"formules": [{"id": "f1", "nom": "OCR Ordonnances", "prix": 1000}], "abonnements": [], "code_parrainage": "PA23456X"})
    r = client.get("/api/abonnement", headers=h)
    assert r.status_code == 200 and r.json()["formules"][0]["nom"] == "OCR Ordonnances"
    q = sawali[0]
    assert q.url.path == "/api/formules-plateformes/catalogue" and q.headers["X-Emetteur"] == "paiementmobile" and q.headers["X-Signature"]
    u = json.loads(q.content)["utilisateur"]
    assert u == {"id": fiche["id"], "nom": f"{fiche['prenom']} {fiche['nom']}", "telephone": fiche["telephone"]}


def test_achat_envoie_l_adresse_de_retour_du_site(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["acheter"] = (200, {"ok": True, "deposit_id": "d" * 36, "redirect_url": "https://pay.pawapay.test/x"})
    r = client.post("/api/abonnement/acheter", headers=h, json={"formule_id": "f1"})
    assert r.json()["redirect_url"] == "https://pay.pawapay.test/x"
    corps = json.loads(sawali[0].content)
    assert corps["formule_id"] == "f1" and corps["retour"] == "https://paiement-mobile-site.onrender.com/abonnement"


def test_etat_d_un_achat_et_acces(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["achat"] = (200, {"statut": "paye", "formule_id": "f1"})
    sawali.reponses["acces"] = (200, {"actif": True, "expire_le": "2026-11-16T00:00:00+00:00", "jours_restants": 30})
    assert client.get("/api/abonnement/achat?deposit_id=" + "d" * 36, headers=h).json()["statut"] == "paye"
    assert client.get("/api/abonnement/acces?fonction=ocr_ordonnances", headers=h).json()["jours_restants"] == 30
    assert json.loads(sawali[-1].content)["fonction"] == "ocr_ordonnances"


def test_parrainage_et_refus_metier_transmis(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["parrainage"] = (404, {"detail": "Code de parrainage inconnu"})
    r = client.post("/api/abonnement/parrainage", headers=h, json={"code": " pa23456x "})
    assert r.status_code == 404 and r.json()["detail"] == "Code de parrainage inconnu"
    assert json.loads(sawali[0].content)["code"] == "pa23456x"      # SAWALI met en majuscules


def test_sawali_injoignable_ou_non_configure(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/abonnement", headers=h).status_code == 503             # clé absente
    r = get_settings()
    r.liluvine_wa_hmac = "cle"
    support_sawali._transport = httpx.MockTransport(lambda q: (_ for _ in ()).throw(httpx.ConnectError("hors ligne")))
    try:
        rep = client.get("/api/abonnement", headers=h)
        assert rep.status_code == 503 and "abonnement" in rep.json()["detail"]
    finally:
        r.liluvine_wa_hmac = ""
        support_sawali._transport = None


# ----------------------------------------------------------------------------------------------- lot 81 : achat groupé
def test_devis_relaye_avec_les_formules_choisies(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["devis"] = (200, {"lignes": [{"id": "f1", "nom": "OCR", "prix": 1000, "duree_jours": 30},
                                                 {"id": "f2", "nom": "Cartes", "prix": 1500, "duree_jours": 30}], "nombre": 2, "total": 2500, "devise": "XOF"})
    r = client.post("/api/abonnement/devis", headers=h, json={"formule_ids": ["f1", "f2", "f1"]})
    assert r.status_code == 200 and r.json()["total"] == 2500
    q = sawali[-1]
    assert q.url.path == "/api/formules-plateformes/devis" and q.headers["X-Signature"]
    assert json.loads(q.content)["formule_ids"] == ["f1", "f2"]               # doublon retiré avant l'envoi
    assert client.post("/api/abonnement/devis", headers=h, json={"formule_ids": []}).status_code == 422


def test_achat_groupe_envoie_toutes_les_formules(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponses["acheter"] = (200, {"ok": True, "deposit_id": "d" * 36, "redirect_url": "https://pay.test/x", "total": 2500})
    r = client.post("/api/abonnement/acheter", headers=h, json={"formule_ids": ["f1", "f2"]})
    assert r.status_code == 200 and r.json()["redirect_url"] == "https://pay.test/x"
    corps = json.loads(sawali[-1].content)
    assert corps["formule_ids"] == ["f1", "f2"] and "formule_id" not in corps and corps["retour"].endswith("/abonnement")
    assert client.post("/api/abonnement/acheter", headers=h, json={}).status_code == 422
