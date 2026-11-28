"""Tests : base EN MÉMOIRE (mongomock), aucun accès réseau. Variables posées AVANT l'import de l'application."""
import os
import sys
from pathlib import Path

os.environ.update({"MONGO_URL": "mongomock://", "JWT_SECRET": "secret-de-test", "ADMIN_EMAIL": "root@test.bf",
                   "ADMIN_PASSWORD": "root-motdepasse", "SAWALI_URL": "https://sawali.test"})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def app_client():
    import server
    with TestClient(server.app) as c:
        yield c


@pytest.fixture(scope="session")
def faux_sawali():
    """Remplace SAWALI : mémorise chaque requête reçue (en-têtes + corps) pour que les tests la contrôlent."""
    import whatsapp
    recus = []

    def reponse(req: httpx.Request):
        recus.append({"entetes": dict(req.headers), "corps": req.content.decode(), "url": str(req.url)})
        return httpx.Response(200, json={"ok": True})

    whatsapp._transport = httpx.MockTransport(reponse)
    return recus


def entete(jeton, client_id=None):
    return {"Authorization": f"Bearer {jeton}", **({"X-Client-Id": client_id} if client_id else {})}


def connecter(c, email, mdp):
    r = c.post("/api/auth/connexion", json={"email": email, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return r.json()["jeton"]


@pytest.fixture(scope="session")
def monde(app_client, faux_sawali):
    """Deux clients (Alpha, Beta) avec leur admin ; renvoie jetons, ids et clés HMAC (montrées une fois)."""
    c = app_client
    root = connecter(c, "root@test.bf", "root-motdepasse")
    m = {"root": root}
    for nom, tel in (("Alpha", "22670000001"), ("Beta", "22670000002")):
        r = c.post("/api/clients", headers=entete(root), json={
            "nom": nom, "admin_nom": f"Admin {nom}", "admin_email": f"admin@{nom.lower()}.bf",
            "admin_mot_de_passe": "motdepasse-ok", "admin_telephone": tel})
        assert r.status_code == 201, r.text
        m[nom] = {"client": r.json(), "cle": r.json()["cle_hmac"], "jeton": connecter(c, f"admin@{nom.lower()}.bf", "motdepasse-ok")}
    return m
