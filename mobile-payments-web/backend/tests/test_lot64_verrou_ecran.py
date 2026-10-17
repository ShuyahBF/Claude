"""Lot 64 — verrou de l'écran : délai réglé par l'administrateur, mot de passe du compte redemandé, blocage après trop d'essais."""
import reglages_securite


def test_verrou_connexion_requise(client):
    assert client.get("/api/auth/verrou").status_code == 401
    assert client.post("/api/auth/deverrouiller", json={"mot_de_passe": "x"}).status_code == 401


def test_delai_par_defaut_et_reglage_admin(client, admin, utilisateur):
    reglages_securite.vider_cache_verrou()
    _, h, _ = utilisateur
    assert client.get("/api/auth/verrou", headers=h).json()["secondes"] == 30
    # Réservé à l'administrateur, durée prise dans la liste proposée
    assert client.put("/api/admin/comptes/reglage-verrou", headers=h, json={"secondes": 60}).status_code in (401, 403)
    assert client.put("/api/admin/comptes/reglage-verrou", headers=admin, json={"secondes": 45}).status_code == 422
    assert client.put("/api/admin/comptes/reglage-verrou", headers=admin, json={"secondes": 0}).json()["verrou_secondes"] == 0
    assert client.get("/api/auth/verrou", headers=h).json()["secondes"] == 0
    liste = client.get("/api/admin/comptes", headers=admin).json()
    assert liste["verrou_secondes"] == 0 and 0 in liste["choix_verrou"]
    reglages_securite.vider_cache_verrou()


def test_deverrouillage_par_mot_de_passe(client, utilisateur):
    _, h, mdp = utilisateur
    assert client.post("/api/auth/deverrouiller", headers=h, json={"mot_de_passe": "mauvais-mot-de-passe"}).status_code == 401
    assert client.post("/api/auth/deverrouiller", headers=h, json={"mot_de_passe": mdp}).json() == {"ok": True}


def test_deverrouillage_bloque_apres_trop_d_essais(client, utilisateur):
    _, h, mdp = utilisateur
    for _ in range(10):
        client.post("/api/auth/deverrouiller", headers=h, json={"mot_de_passe": "faux-faux-faux"})
    # Même le bon mot de passe est refusé pendant le blocage temporaire
    assert client.post("/api/auth/deverrouiller", headers=h, json={"mot_de_passe": mdp}).status_code == 429
