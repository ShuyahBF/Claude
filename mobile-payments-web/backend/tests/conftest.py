"""Tests : base MongoDB EN MÉMOIRE (mongomock), aucun accès réseau.
Les variables d'environnement sont posées AVANT l'import de l'application."""
import os
import sys
from pathlib import Path

os.environ.update({
    "MONGO_URL": "mongomock://",
    "JWT_SECRET": "secret-de-test",
    "ADMIN_EMAIL": "admin@test.bf",
    "ADMIN_PASSWORD": "admin-motdepasse",
    # Pas de signal de présence vers SAWALI pendant les tests (aucun accès réseau)
    "PRESENCE_SAWALI": "0",
    "FRONTEND_ORIGIN": "https://paiement-mobile-site.onrender.com",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

_compteur = {"n": 0}


@pytest.fixture(scope="session")
def client():
    import server

    with TestClient(server.app) as c:  # « with » déclenche le démarrage (index, admin, catalogue)
        yield c


def _entetes(reponse):
    return {"Authorization": f"Bearer {reponse.json()['access_token']}"}


@pytest.fixture
def utilisateur(client):
    """Crée un utilisateur neuf ; renvoie (fiche, en-têtes, mot de passe)."""
    _compteur["n"] += 1
    n = _compteur["n"]
    r = client.post("/api/auth/inscription", json={
        "nom": f"Ouédraogo{n}", "prenom": "Awa", "telephone": f"70 {n // 100:02d} {n % 100:02d} 00",
        "email": f"awa{n}@test.bf", "mot_de_passe": "motdepasse-123"})
    assert r.status_code == 201, r.text
    client.cookies.clear()  # les tests s'authentifient par jeton « Bearer »
    return r.json()["user"], _entetes(r), "motdepasse-123"


@pytest.fixture(scope="session")
def admin(client):
    r = client.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "admin-motdepasse"})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return _entetes(r)
