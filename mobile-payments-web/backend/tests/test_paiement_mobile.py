"""Tests de bout en bout de l'API : connexion par téléphone ou e-mail,
catalogue, annuaire des marchands, préparation des codes USSD, historique."""
import pytest

from ussd import ErreurSaisie, construire_code, lien_tel, normaliser_telephone

CHAMPS = [{"key": "code", "label": "Code marchand", "type": "numeric", "isMerchantCode": True},
          {"key": "amount", "label": "Montant (FCFA)", "type": "numeric"}]


# --- Construction des codes USSD (fonctions pures) ---
def test_construire_code_remplace_les_placeholders():
    assert construire_code("*144*10*{code}*{amount}#", CHAMPS, {"code": "1234", "amount": "005000"}) == "*144*10*1234*5000#"


@pytest.mark.parametrize("valeurs, message", [
    ({"code": "1234"}, "obligatoire"),
    ({"code": "12a4", "amount": "500"}, "chiffres"),
    ({"code": "1234", "amount": "0"}, "supérieur à 0"),
    ({"code": "1234", "amount": "99999999999"}, "trop élevé"),
])
def test_construire_code_refuse_les_saisies_invalides(valeurs, message):
    with pytest.raises(ErreurSaisie, match=message):
        construire_code("*144*10*{code}*{amount}#", CHAMPS, valeurs)


def test_lien_tel_encode_le_diese():
    assert lien_tel("*144*10*1234*5000#") == "tel:*144*10*1234*5000%23"


@pytest.mark.parametrize("saisie, attendu", [
    ("70 00 00 00", "+22670000000"), ("+226 70 00 00 00", "+22670000000"), ("0022670000000", "+22670000000"),
])
def test_normaliser_telephone(saisie, attendu):
    assert normaliser_telephone(saisie) == attendu


# --- Comptes ---
def test_connexion_par_telephone_et_par_email(client, utilisateur):
    user, _, mdp = utilisateur
    local = user["telephone"][4:]  # même numéro saisi sans indicatif
    for identifiant in (user["telephone"], local, user["email"].upper()):
        r = client.post("/api/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mdp})
        assert r.status_code == 200, (identifiant, r.text)
        assert r.json()["user"]["id"] == user["id"]
    client.cookies.clear()


def test_inscription_sans_email_et_doublon(client):
    donnees = {"nom": "Kaboré", "prenom": "Issa", "telephone": "76 11 22 33", "mot_de_passe": "motdepasse-123"}
    r = client.post("/api/auth/inscription", json=donnees)
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] is None
    # Deuxième compte sans e-mail : pas de conflit sur l'e-mail absent
    assert client.post("/api/auth/inscription", json={**donnees, "telephone": "76 11 22 34"}).status_code == 201
    # Même téléphone : refusé
    assert client.post("/api/auth/inscription", json=donnees).status_code == 409
    client.cookies.clear()


def test_mauvais_mot_de_passe_puis_blocage(client, utilisateur):
    user, _, _ = utilisateur
    for _ in range(10):
        r = client.post("/api/auth/connexion", json={"identifiant": user["email"], "mot_de_passe": "faux"})
        assert r.status_code == 401
    r = client.post("/api/auth/connexion", json={"identifiant": user["email"], "mot_de_passe": "motdepasse-123"})
    assert r.status_code == 429


def test_session_par_cookie_exige_l_entete_csrf(client, utilisateur):
    user, _, mdp = utilisateur
    client.post("/api/auth/connexion", json={"identifiant": user["email"], "mot_de_passe": mdp})
    assert client.get("/api/auth/moi").status_code == 200  # lecture : cookie seul suffit
    services = client.get("/api/services").json()
    corps = {"service_id": services[0]["id"], "valeurs": {}}
    assert client.post("/api/paiements", json=corps).status_code == 403  # écriture sans en-tête
    assert client.post("/api/paiements", json=corps, headers={"X-Paiement-Mobile": "1"}).status_code != 403
    client.post("/api/auth/deconnexion", headers={"X-Paiement-Mobile": "1"})
    client.cookies.clear()


def test_changement_de_mot_de_passe_deconnecte_les_autres_sessions(client, utilisateur):
    _, h, mdp = utilisateur
    r = client.put("/api/auth/mot-de-passe", headers=h, json={"ancien": mdp, "nouveau": "nouveau-mdp-456"})
    assert r.status_code == 200
    client.cookies.clear()
    assert client.get("/api/auth/moi", headers=h).status_code == 401  # ancien jeton refusé
    assert client.get("/api/auth/moi", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 200


# --- Catalogue, marchands, paiements ---
def test_catalogue_de_depart(client, utilisateur):
    _, h, _ = utilisateur
    assert client.get("/api/operateurs", headers=h).json() == ["Moov Africa", "Orange", "Telecel Faso"]
    orange = client.get("/api/services", params={"operateur": "Orange"}, headers=h).json()
    assert {s["nom"] for s in orange} >= {"Paiement marchand", "Transfert d'argent"}
    assert client.get("/api/operateurs").status_code == 401  # connexion obligatoire


def test_parcours_paiement_marchand(client, utilisateur):
    _, h, _ = utilisateur
    service = next(s for s in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json()
                   if s["nom"] == "Paiement marchand")
    # Code marchand inconnu -> 404, puis enregistrement avec un intitulé
    assert client.get("/api/marchands/Orange/445566", headers=h).status_code == 404
    r = client.post("/api/marchands", headers=h, json={"operateur": "Orange", "code": "445566", "libelle": "Boutique Étoile"})
    assert r.status_code == 201, r.text
    assert client.get("/api/marchands/Orange/445566", headers=h).json()["libelle"] == "Boutique Étoile"
    # Préparation du paiement : code USSD + lien tel:
    r = client.post("/api/paiements", headers=h, json={"service_id": service["id"],
                                                       "valeurs": {"code": "445566", "amount": "2 500"}})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["code_ussd"] == "*144*10*445566*2500#"
    assert p["lien_tel"] == "tel:*144*10*445566*2500%23"
    assert p["marchand"] == {"code": "445566", "libelle": "Boutique Étoile"} and p["montant"] == 2500
    # Historique et statut
    assert client.get("/api/paiements", headers=h).json()[0]["id"] == p["id"]
    r = client.put(f"/api/paiements/{p['id']}/statut", headers=h, json={"statut": "effectue"})
    assert r.json()["statut"] == "effectue"


def test_historique_cloisonne_par_utilisateur(client, utilisateur):
    _, h, _ = utilisateur
    service = client.get("/api/services", params={"operateur": "Orange"}, headers=h).json()[0]
    valeurs = {c["key"]: "1000" if c["key"] == "amount" else "70000000" for c in service["champs"]}
    p = client.post("/api/paiements", headers=h, json={"service_id": service["id"], "valeurs": valeurs}).json()
    autre = client.post("/api/auth/inscription", json={"nom": "Autre", "prenom": "X", "telephone": "65 43 21 09",
                                                       "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {autre.json()['access_token']}"}
    assert all(x["id"] != p["id"] for x in client.get("/api/paiements", headers=h2).json())
    assert client.put(f"/api/paiements/{p['id']}/statut", headers=h2, json={"statut": "abandonne"}).status_code == 404
    assert client.delete(f"/api/paiements/{p['id']}", headers=h2).status_code == 404


def test_intitule_d_un_marchand_non_ecrase_par_un_autre(client, utilisateur):
    _, h, _ = utilisateur
    client.post("/api/marchands", headers=h, json={"operateur": "Moov Africa", "code": "9911", "libelle": "Pharmacie A"})
    autre = client.post("/api/auth/inscription", json={"nom": "B", "prenom": "C", "telephone": "66 00 00 01",
                                                       "mot_de_passe": "motdepasse-123"})
    client.cookies.clear()
    h2 = {"Authorization": f"Bearer {autre.json()['access_token']}"}
    r = client.post("/api/marchands", headers=h2, json={"operateur": "Moov Africa", "code": "9911", "libelle": "Autre nom"})
    assert r.json()["libelle"] == "Pharmacie A"


# --- Administration du catalogue ---
def test_admin_gere_le_catalogue(client, admin, utilisateur):
    _, h, _ = utilisateur
    nouveau = {"operateur": "Orange", "nom": "Forfait Internet", "categorie": "internet_bundle",
               "gabarit_ussd": "*144*5*{amount}#", "champs": [{"key": "amount", "label": "Montant (FCFA)"}]}
    assert client.post("/api/admin/services", headers=h, json=nouveau).status_code == 403  # pas admin
    r = client.post("/api/admin/services", headers=admin, json=nouveau)
    assert r.status_code == 201, r.text
    # Gabarit et champs incohérents -> refus
    incoherent = {**nouveau, "nom": "X", "gabarit_ussd": "*144*5*{code}*{amount}#"}
    assert client.post("/api/admin/services", headers=admin, json=incoherent).status_code == 400
    assert client.post("/api/admin/services", headers=admin, json={**nouveau, "nom": "Y", "gabarit_ussd": "144"}).status_code == 400
    # Désactivation : le service disparaît de la liste des utilisateurs
    r = client.put(f"/api/admin/services/{r.json()['id']}", headers=admin, json={**nouveau, "actif": False})
    assert r.status_code == 200
    assert all(s["nom"] != "Forfait Internet" for s in client.get("/api/services", headers=h).json())
