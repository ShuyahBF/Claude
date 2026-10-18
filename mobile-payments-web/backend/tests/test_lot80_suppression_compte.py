"""Lot 80 — suppression de son compte (Google Play) : mot de passe, archives en ligne, données effacées, admin protégé."""
import httpx
import pytest

import limiteur
import support_sawali
from config import get_settings
from db import db


class Recues(list):
    def __init__(self):
        super().__init__()
        self.archives = [{"id": "arch-0001"}, {"id": "arch-0002"}]
        self.liste = (200, None)


@pytest.fixture
def sawali():
    limiteur.limiteur_public.vider()
    limiteur.limiteur_lecture.vider()
    recues = Recues()

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        if q.url.path.endswith("/archives/liste"):
            code, corps = recues.liste
            return httpx.Response(code, json=corps if corps is not None else {"archives": recues.archives})
        return httpx.Response(200, json={"ok": True})

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def test_connexion_requise(client):
    assert client.post("/api/compte/supprimer", json={"mot_de_passe": "x"}).status_code == 401


def test_mauvais_mot_de_passe_rien_efface(client, utilisateur, sawali):
    fiche, h, _ = utilisateur
    assert client.post("/api/compte/supprimer", headers=h, json={"mot_de_passe": "faux"}).status_code == 403
    assert not sawali                                    # SAWALI n'est même pas appelé
    assert client.get("/api/auth/moi", headers=h).status_code == 200


def test_suppression_complete(client, utilisateur, sawali):
    fiche, h, mdp = utilisateur
    client.post("/api/anniversaires", headers=h, json={"nom": "Fatou", "jour": 5, "mois": 3})
    r = client.post("/api/compte/supprimer", headers=h, json={"mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["archives_supprimees"] == 2 and d["supprime"]["anniversaires"] == 1
    chemins = [q.url.path for q in sawali]
    assert chemins.count("/api/formules-plateformes/archives/supprimer") == 2
    # Le compte n'existe plus : la session ne marche plus et le numéro peut se réinscrire
    assert client.get("/api/auth/moi", headers=h).status_code == 401
    r2 = client.post("/api/auth/inscription", json={"nom": "N", "prenom": "P", "telephone": fiche["telephone"], "mot_de_passe": "motdepasse-123"})
    assert r2.status_code == 201
    client.cookies.clear()


def test_sawali_en_panne_compte_intact(client, utilisateur, sawali):
    fiche, h, mdp = utilisateur
    sawali.liste = (500, {"detail": "panne"})
    r = client.post("/api/compte/supprimer", headers=h, json={"mot_de_passe": mdp})
    assert r.status_code == 502 and "n'a pas été supprimé" in r.json()["detail"]
    assert client.get("/api/auth/moi", headers=h).status_code == 200


def test_sans_archives_en_ligne(client, utilisateur, sawali):
    _, h, mdp = utilisateur
    sawali.liste = (402, {"detail": "abonnement"})
    r = client.post("/api/compte/supprimer", headers=h, json={"mot_de_passe": mdp})
    assert r.status_code == 200 and r.json()["archives_supprimees"] == 0


def test_administrateur_refuse(client, admin, sawali):
    r = client.post("/api/compte/supprimer", headers=admin, json={"mot_de_passe": "admin-motdepasse"})
    assert r.status_code == 409
