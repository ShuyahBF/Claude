"""Lot 44 — le super-administrateur utilise les fonctions payantes sans abonnement, sauf en « mode démo »."""
import json

import httpx
import pytest

import support_sawali
from config import get_settings

AUDIO = "data:audio/webm;base64," + "A" * 200


@pytest.fixture
def sawali():
    recues = []

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(json.loads(q.content))
        return httpx.Response(200, json={"ok": True, "texte": "ok", "duree_s": 3, "restant_aujourdhui": 9})

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def test_admin_dispense_puis_mode_demo(client, admin, utilisateur, sawali):
    h = admin[1] if isinstance(admin, tuple) else admin
    corps = {"audio": AUDIO, "duree_s": 3}
    client.post("/api/voix", headers=h, json=corps)
    assert sawali[-1]["utilisateur"]["acces_libre"] is True                       # admin : dispensé d'abonnement
    moi = client.put("/api/auth/mode-demo", headers=h, json={"actif": True})
    assert moi.status_code == 200 and moi.json()["mode_demo"] is True
    client.post("/api/voix", headers=h, json=corps)
    assert "acces_libre" not in sawali[-1]["utilisateur"]                         # mode démo : soumis à l'abonnement
    client.put("/api/auth/mode-demo", headers=h, json={"actif": False})           # on remet le réglage normal
    client.post("/api/voix", headers=h, json=corps)
    assert sawali[-1]["utilisateur"]["acces_libre"] is True


def test_utilisateur_ordinaire_jamais_dispense(client, utilisateur, sawali):
    _, h, _ = utilisateur
    client.post("/api/voix", headers=h, json={"audio": AUDIO, "duree_s": 3})
    assert "acces_libre" not in sawali[-1]["utilisateur"]
    assert client.put("/api/auth/mode-demo", headers=h, json={"actif": True}).status_code == 403   # réservé à l'administrateur
