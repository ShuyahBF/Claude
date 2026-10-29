"""Lot 106 — modifier un marchand déjà enregistré : son nom et son service de paiement (le code ne change jamais)."""


def _services(client, h, operateur="Orange"):
    return {s["nom"]: s for s in client.get("/api/services", params={"operateur": operateur}, headers=h).json()}


def test_modifier_nom_et_service_du_marchand(client, utilisateur):
    _, h, _ = utilisateur
    svc = _services(client, h)
    marchand, facture = svc["Paiement marchand"], svc["Paiement de facture"]            # *144*10*… et *144*4*…
    assert client.post("/api/marchands", headers=h, json={"operateur": "Orange", "code": "60001", "libelle": "Boutique Étoile"}).status_code == 201
    base = "/api/marchands/Orange/60001"
    assert client.get(base, headers=h).json()["modifiable"] is True and client.get(base, headers=h).json().get("service_id") is None
    # Nom seul : le service reste inchangé
    r = client.put(base, headers=h, json={"libelle": "Boutique Étoile du Sud"}).json()
    assert r["libelle"] == "Boutique Étoile du Sud" and r["code"] == "60001"
    # Service : le marchand passe de *144*4* à *144*10*
    assert client.put(base, headers=h, json={"service_id": facture["id"]}).json()["service_id"] == facture["id"]
    r = client.put(base, headers=h, json={"service_id": marchand["id"]}).json()
    assert r["service_id"] == marchand["id"] and r["libelle"] == "Boutique Étoile du Sud"       # le nom n'a pas bougé
    assert client.get(base, headers=h).json()["service_id"] == marchand["id"]
    # "" = retour au service par défaut
    assert client.put(base, headers=h, json={"service_id": ""}).json()["service_id"] is None
    # Le code n'est pas modifiable (ignoré s'il est envoyé) ; nom trop court ou caractères interdits : refusés
    assert client.put(base, headers=h, json={"code": "99999"}).json()["code"] == "60001"
    assert client.put(base, headers=h, json={"libelle": "A"}).status_code == 422
    assert client.put(base, headers=h, json={"libelle": "<script>"}).status_code == 422


def test_service_d_un_autre_operateur_ou_sans_code_refuse(client, utilisateur):
    _, h, _ = utilisateur
    assert client.post("/api/marchands", headers=h, json={"operateur": "Orange", "code": "60002", "libelle": "Kiosque Nord"}).status_code == 201
    moov = _services(client, h, "Moov Africa")["Paiement marchand"]
    base = "/api/marchands/Orange/60002"
    assert client.put(base, headers=h, json={"service_id": moov["id"]}).status_code == 422                 # service d'un autre opérateur
    assert client.put(base, headers=h, json={"service_id": "inconnu"}).status_code == 422
    credit = _services(client, h)["Achat de crédit de communication"]                                       # pas de code marchand dans ce service
    assert client.put(base, headers=h, json={"service_id": credit["id"]}).status_code == 422
    assert client.put("/api/marchands/Orange/00000000", headers=h, json={"libelle": "Fantôme"}).status_code == 404


def test_seuls_l_auteur_et_l_administrateur_modifient(client, utilisateur, admin):
    _, h1, _ = utilisateur
    assert client.post("/api/marchands", headers=h1, json={"operateur": "Orange", "code": "60003", "libelle": "Maison Sawadogo"}).status_code == 201
    base = "/api/marchands/Orange/60003"
    # Un autre utilisateur le voit, mais ne peut pas le modifier
    autre = client.post("/api/auth/inscription", json={"nom": "Autre", "prenom": "Awa", "telephone": "70 91 92 93", "email": "autre106@test.bf", "mot_de_passe": "motdepasse-123"}).json()
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {autre['access_token']}"}
    assert client.get(base, headers=h2).json()["modifiable"] is False
    assert [m["modifiable"] for m in client.get("/api/marchands", headers=h2, params={"q": "Sawadogo"}).json()] == [False]
    assert client.put(base, headers=h2, json={"libelle": "Piraté"}).status_code == 403
    assert client.get(base, headers=h1).json()["libelle"] == "Maison Sawadogo"
    # L'administrateur peut
    assert client.put(base, headers=admin, json={"libelle": "Maison Sawadogo et fils"}).json()["libelle"] == "Maison Sawadogo et fils"
