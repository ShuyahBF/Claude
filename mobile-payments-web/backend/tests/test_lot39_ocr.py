"""Lot 39 — OCR (plaques de marchands, ordonnances) relayé vers SAWALI : abonnement requis, nettoyage des champs lus."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings
from routes import ocr

IMAGE = "data:image/jpeg;base64," + "A" * 200


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


def test_nettoyage_plaque():
    cat = ["Orange", "Moov Africa", "Telecel Faso"]
    out = ocr.nettoyer_plaque({"operateur": "Orange Money", "code_marchand": " 336 6444 ", "nom_marchand": "Pharmacie  du Marché",
                               "numero_sous_qr": "0002011164", "texte_complet": "Flashez le QR"}, cat)
    assert out == {"operateur": "Orange", "code": "3366444", "nom": "Pharmacie du Marché", "numero_sous_qr": "0002011164", "texte": "Flashez le QR"}
    assert ocr.nettoyer_plaque({"operateur": "Moov Money"}, cat)["operateur"] == "Moov Africa"
    assert ocr.nettoyer_plaque({"operateur": "Telecel Cash"}, cat)["operateur"] == "Telecel Faso"
    douteux = ocr.nettoyer_plaque({"operateur": "Wave", "code_marchand": "12", "nom_marchand": "<b>x</b>", "numero_sous_qr": "ab"}, cat)
    assert douteux["operateur"] is None and douteux["code"] is None and douteux["nom"] is None and douteux["numero_sous_qr"] is None
    assert ocr.nettoyer_plaque({"code_marchand": "1234567890123"}, cat)["code"] is None        # trop long : jamais deviné


def test_nettoyage_ordonnance():
    out = ocr.nettoyer_ordonnance({"prescripteur": " Dr Ouédraogo ", "date": "2026-10-15", "patient": None, "texte_complet": "…",
                                   "medicaments": [{"nom": "Paracétamol 500 mg", "dose": "1 comprimé", "posologie": "3 fois par jour", "duree": "5 jours"},
                                                   {"nom": None, "dose": "x"}, "bizarre"]})
    assert out["prescripteur"] == "Dr Ouédraogo" and out["date"] == "2026-10-15" and len(out["medicaments"]) == 1
    assert out["medicaments"][0]["posologie"] == "3 fois par jour"
    assert ocr.nettoyer_ordonnance({"date": "15/10/2026"})["date"] is None


def test_connexion_requise(client):
    assert client.post("/api/ocr", json={"type": "plaque_marchand", "image": IMAGE}).status_code == 401


def test_plaque_lue_et_nettoyee(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (200, {"type": "plaque_marchand", "champs": {"operateur": "Orange", "code_marchand": "3366444", "nom_marchand": "Pharmacie"},
                            "incertains": ["nom_marchand"], "confiance": 0.9, "restant_aujourdhui": 29, "avertissements": []})
    r = client.post("/api/ocr", headers=h, json={"type": "plaque_marchand", "image": IMAGE})
    assert r.status_code == 200
    j = r.json()
    assert j["operateur"] == "Orange" and j["code"] == "3366444" and j["incertains"] == ["nom_marchand"] and j["restant_aujourdhui"] == 29
    q = sawali[0]
    assert q.url.path == "/api/formules-plateformes/ocr" and q.headers["X-Signature"]
    corps = json.loads(q.content)
    assert corps["type"] == "plaque_marchand" and corps["image"] == IMAGE and corps["utilisateur"]["id"]


def test_abonnement_requis_message_avec_le_prix(client, utilisateur, sawali):
    _, h, _ = utilisateur
    detail = {"code": "abonnement_requis", "message": "Lecture OCR réservée aux abonnés. Formule « OCR Ordonnances » : 2 500 FCFA pour 30 jours.",
              "formule": {"id": "f1", "nom": "OCR Ordonnances", "prix": 2500, "duree_jours": 30}}
    sawali.reponse = (402, {"detail": detail})
    r = client.post("/api/ocr", headers=h, json={"type": "ordonnance", "image": IMAGE})
    assert r.status_code == 402 and r.json()["detail"] == detail and "2 500 FCFA" in r.json()["detail"]["message"]


def test_limite_du_jour_et_lecture_impossible(client, utilisateur, sawali):
    _, h, _ = utilisateur
    sawali.reponse = (429, {"detail": "Limite atteinte : 30 lectures OCR par jour. Réessayez demain."})
    r = client.post("/api/ocr", headers=h, json={"type": "plaque_marchand", "image": IMAGE})
    assert r.status_code == 429 and "30 lectures" in r.json()["detail"]
    sawali.reponse = (502, {"detail": "x"})
    assert client.post("/api/ocr", headers=h, json={"type": "plaque_marchand", "image": IMAGE}).status_code == 502


def test_type_invalide(client, utilisateur, sawali):
    _, h, _ = utilisateur
    assert client.post("/api/ocr", headers=h, json={"type": "autre", "image": IMAGE}).status_code == 422
    assert not sawali
