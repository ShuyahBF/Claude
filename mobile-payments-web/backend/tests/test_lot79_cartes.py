"""Lot 79 — cartes virtuelles : génération relayée vers SAWALI, 3 variantes au plus, accord obligatoire, envoi par Liluvine."""
import json

import httpx
import pytest

import limiteur
import support_sawali
from config import get_settings

IMAGE = "data:image/jpeg;base64,/9j/" + "A" * 60
CARTE = {"theme": "Anniversaire avec des ballons", "message": "Joyeux anniversaire, Fatou !", "destinataire": "Fatou", "telephone": "70 11 22 33"}


class Recues(list):
    def __init__(self):
        super().__init__()
        self.generer = (200, {"ok": True, "image": IMAGE, "restant_aujourdhui": 5})
        self.envoi = (200, {"ok": True, "mode": "modele"})


@pytest.fixture
def sawali():
    # Limite d'appels par minute et par adresse : partagée par toute la série de tests, on la vide pour ne pas la dépasser
    limiteur.limiteur_public.vider()
    limiteur.limiteur_lecture.vider()
    recues = Recues()

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        code, corps = recues.envoi if q.url.path == "/api/webhook/liluvine-send" else recues.generer
        return httpx.Response(code, json=corps)

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def creer(client, h):
    r = client.post("/api/cartes", headers=h, json=CARTE)
    assert r.status_code == 201, r.text
    return r.json()


def test_connexion_requise(client):
    assert client.post("/api/cartes", json=CARTE).status_code == 401


def test_creation_demande_une_image_a_sawali(client, utilisateur, sawali):
    _, h, _ = utilisateur
    c = creer(client, h)
    assert c["telephone"] == "+22670112233" and len(c["variantes"]) == 1 and c["nb_variantes"] == 1
    q = sawali[0]
    assert q.url.path == "/api/cartes-plateformes/generer" and q.headers["X-Signature"]
    corps = json.loads(q.content)
    assert corps["theme"] == CARTE["theme"] and corps["destinataire"] == "Fatou" and corps["utilisateur"]["id"]


def test_abonnement_requis_rien_enregistre(client, utilisateur, sawali):
    _, h, _ = utilisateur
    detail = {"code": "abonnement_requis", "message": "Les cartes virtuelles réservées aux abonnés. Formule « Cartes » : 1 500 FCFA pour 30 jours.",
              "formule": {"id": "f3", "nom": "Cartes", "prix": 1500, "duree_jours": 30}}
    sawali.generer = (402, {"detail": detail})
    r = client.post("/api/cartes", headers=h, json=CARTE)
    assert r.status_code == 402 and r.json()["detail"] == detail
    assert client.get("/api/cartes", headers=h).json()["cartes"] == []


def test_trois_variantes_au_plus(client, utilisateur, sawali):
    _, h, _ = utilisateur
    c = creer(client, h)
    assert client.post(f"/api/cartes/{c['id']}/variante", headers=h).json()["nb_variantes"] == 2
    assert client.post(f"/api/cartes/{c['id']}/variante", headers=h).json()["nb_variantes"] == 3
    r = client.post(f"/api/cartes/{c['id']}/variante", headers=h)
    assert r.status_code == 409
    nb_appels_ia = sum(1 for q in sawali if q.url.path.endswith("/generer"))
    assert nb_appels_ia == 3                      # la 4e demande n'a pas coûté d'image


def test_numero_invalide(client, utilisateur, sawali):
    _, h, _ = utilisateur
    r = client.post("/api/cartes", headers=h, json={**CARTE, "telephone": "12"})
    assert r.status_code == 422 and not sawali


def test_envoi_sans_accord_refuse(client, utilisateur, sawali):
    _, h, _ = utilisateur
    c = creer(client, h)
    r = client.post(f"/api/cartes/{c['id']}/envoyer", headers=h, json={"variante_id": c["variantes"][0]["id"], "accord": False})
    assert r.status_code == 422
    assert not any(q.url.path.endswith("liluvine-send") for q in sawali)


def test_envoi_par_liluvine_puis_images_liberees(client, utilisateur, sawali):
    _, h, _ = utilisateur
    c = creer(client, h)
    r = client.post(f"/api/cartes/{c['id']}/envoyer", headers=h, json={"variante_id": c["variantes"][0]["id"], "accord": True})
    assert r.status_code == 200 and r.json()["carte"]["statut"] == "envoyee"
    q = [q for q in sawali if q.url.path == "/api/webhook/liluvine-send"][0]
    corps = json.loads(q.content)
    assert corps["to"] == "+22670112233" and corps["id"] == f"carte-{c['id']}" and corps["media"]["type"] == "image"
    assert corps["media"]["contenu_base64"] == IMAGE.split(",")[1] and q.headers["X-Signature"] and q.headers["X-Emetteur"]
    # Plus d'images gardées, et un second envoi est refusé
    assert client.get(f"/api/cartes/{c['id']}", headers=h).json()["variantes"] == []
    assert client.post(f"/api/cartes/{c['id']}/envoyer", headers=h, json={"variante_id": "x" * 10, "accord": True}).status_code == 409


def test_numero_desinscrit_409(client, utilisateur, sawali):
    _, h, _ = utilisateur
    c = creer(client, h)
    sawali.envoi = (409, {"detail": "stop"})
    r = client.post(f"/api/cartes/{c['id']}/envoyer", headers=h, json={"variante_id": c["variantes"][0]["id"], "accord": True})
    assert r.status_code == 409 and "ne plus recevoir" in r.json()["detail"]
    assert client.get("/api/cartes", headers=h).json()["cartes"][0]["statut"] == "brouillon"   # la carte reste envoyable plus tard


def test_cartes_cloisonnees_et_suppression(client, utilisateur, sawali):
    _, h, _ = utilisateur
    c = creer(client, h)
    assert client.get(f"/api/cartes/{c['id']}", headers=h).status_code == 200
    assert client.delete(f"/api/cartes/{c['id']}", headers=h).json() == {"ok": True}
    assert client.get(f"/api/cartes/{c['id']}", headers=h).status_code == 404
