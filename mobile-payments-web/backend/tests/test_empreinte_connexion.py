"""Connexion par l'empreinte du téléphone : activation, ouverture de session, refus, annulation au changement de mot de passe."""


def _connecter(client, user, mdp):
    r = client.post("/api/auth/connexion", json={"identifiant": user["telephone"], "mot_de_passe": mdp})
    assert r.status_code == 200
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_activation_puis_connexion_sans_mot_de_passe(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    # mot de passe faux : refusé
    assert client.post("/api/auth/empreinte/activer", json={"mot_de_passe": "faux"}, headers=h).status_code == 400
    r = client.post("/api/auth/empreinte/activer", json={"mot_de_passe": mdp, "appareil": "Pixel"}, headers=h)
    assert r.status_code == 200
    cle = r.json()
    # connexion par empreinte : session ouverte pour le bon compte
    o = client.post("/api/auth/empreinte", json=cle)
    assert o.status_code == 200 and o.json()["user"]["id"] == user["id"]
    assert client.get("/api/auth/moi").status_code == 200           # le cookie de session est posé
    # mauvais secret : refusé, même message
    client.cookies.clear()
    mauvais = client.post("/api/auth/empreinte", json={"id": cle["id"], "secret": "x" * 43})
    assert mauvais.status_code == 401
    assert client.post("/api/auth/empreinte", json={"id": "inconnu-inconnu", "secret": "x" * 43}).status_code == 401


def test_changement_de_mot_de_passe_annule_les_empreintes(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    cle = client.post("/api/auth/empreinte/activer", json={"mot_de_passe": mdp}, headers=h).json()
    assert client.put("/api/auth/mot-de-passe", json={"ancien": mdp, "nouveau": "NouveauMdp123"}, headers=h).status_code == 200
    client.cookies.clear()
    assert client.post("/api/auth/empreinte", json=cle).status_code == 401


def test_retrait_des_empreintes(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    cle = client.post("/api/auth/empreinte/activer", json={"mot_de_passe": mdp}, headers=h).json()
    assert client.post("/api/auth/empreinte/retirer", headers=h).status_code == 200
    assert client.post("/api/auth/empreinte", json=cle).status_code == 401


def test_deverrouillage_ecran_par_empreinte_sans_mot_de_passe(client, utilisateur):
    """L'empreinte déverrouille l'écran du compte connecté (sans mot de passe) ; secret faux, empreinte retirée ou autre compte : refusé."""
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    cle = client.post("/api/auth/empreinte/activer", json={"mot_de_passe": mdp, "appareil": "Pixel"}, headers=h).json()
    assert client.post("/api/auth/empreinte/deverrouiller", json=cle, headers=h).status_code == 200
    assert client.post("/api/auth/empreinte/deverrouiller", json={"id": cle["id"], "secret": "x" * 43}, headers=h).status_code == 401
    assert client.post("/api/auth/empreinte/deverrouiller", json={"id": "inconnu-inconnu", "secret": cle["secret"]}, headers=h).status_code == 401
    assert client.post("/api/auth/empreinte/deverrouiller", json=cle).status_code == 401            # sans session : refusé
    assert client.post("/api/auth/empreinte/retirer", headers=h).status_code == 200
    assert client.post("/api/auth/empreinte/deverrouiller", json=cle, headers=h).status_code == 401   # empreintes retirées
