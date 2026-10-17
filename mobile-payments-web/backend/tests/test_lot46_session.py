"""Lot 46 — sessions qui expirent après inactivité, déconnexion forcée par l'administrateur avec compte à rebours."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

import reglages_securite
from db import db


@pytest.fixture(autouse=True)
def reglage_par_defaut():
    reglages_securite.vider_cache()
    yield
    reglages_securite.vider_cache()


def _connecter(client, user, mdp):
    r = client.post("/api/auth/connexion", json={"identifiant": user["telephone"], "mot_de_passe": mdp})
    client.cookies.clear()
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _vieillir(client, user, secondes):
    """Recule l'activité de toutes les sessions du compte (simule un téléphone resté sans toucher)."""
    passe = datetime.now(timezone.utc) - timedelta(seconds=secondes)
    client.portal.call(db.journal_connexions.update_many, {"user_id": user["id"]}, {"$set": {"activite_le": passe}})


def test_la_session_expire_apres_inactivite(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    assert client.get("/api/auth/moi", headers=h).status_code == 200
    assert client.get("/api/auth/inactivite", headers=h).json() == {"secondes": 180, "avertissement_secondes": 30}
    _vieillir(client, user, 180 + 120)                                              # bien au-delà de 3 min + marge
    r = client.get("/api/auth/moi", headers=h)
    assert r.status_code == 401 and "inactivité" in r.json()["detail"]
    assert client.get("/api/auth/moi", headers=h).status_code == 401                # reste fermée
    assert _connecter(client, user, mdp)                                            # une nouvelle connexion fonctionne


def test_l_activite_signalee_garde_la_session(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    _vieillir(client, user, 150)                                                    # 2 min 30 : pas encore expirée
    assert client.post("/api/auth/activite", headers=h).status_code == 200          # l'utilisateur a touché l'écran
    _vieillir(client, user, 0)
    assert client.get("/api/auth/moi", headers=h).status_code == 200


def test_les_lectures_de_fond_ne_comptent_pas_comme_activite(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    _vieillir(client, user, 200)
    client.get("/api/auth/session", headers=h)                                       # lecture de fond du site
    client.get("/api/auth/moi", headers=h)
    _vieillir(client, user, 400)
    assert client.get("/api/auth/moi", headers=h).status_code == 401


def test_deux_appareils_sont_independants(client, utilisateur):
    user, _, mdp = utilisateur
    telephone, ordinateur = _connecter(client, user, mdp), _connecter(client, user, mdp)
    _vieillir(client, user, 400)                                                     # les deux sont restés inactifs…
    sid = jwt.decode(ordinateur["Authorization"][7:], options={"verify_signature": False})["sid"]
    client.portal.call(db.journal_connexions.update_one, {"id": sid},
                       {"$set": {"activite_le": datetime.now(timezone.utc)}})        # …l'ordinateur reprend vie
    assert client.get("/api/auth/moi", headers=telephone).status_code == 401         # le téléphone délaissé est fermé, même si l'ordinateur est actif
    assert client.get("/api/auth/moi", headers=ordinateur).status_code == 200


def test_reglage_de_la_duree_par_l_administrateur(client, admin, utilisateur):
    user, h, _ = utilisateur
    assert client.put("/api/admin/comptes/reglage-inactivite", headers=h, json={"secondes": 60}).status_code == 403
    assert client.put("/api/admin/comptes/reglage-inactivite", headers=admin, json={"secondes": 7}).status_code == 422   # durée non proposée
    assert client.put("/api/admin/comptes/reglage-inactivite", headers=admin, json={"secondes": 60}).json() == {"inactivite_secondes": 60}
    assert client.get("/api/auth/inactivite", headers=h).json()["secondes"] == 60
    assert client.get("/api/admin/comptes", headers=admin).json()["inactivite_secondes"] == 60
    client.put("/api/admin/comptes/reglage-inactivite", headers=admin, json={"secondes": 180})


def test_deconnexion_forcee_compte_a_rebours_puis_fermeture(client, admin, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    assert client.get("/api/auth/session", headers=h).json() == {"deconnexion_dans": None}
    assert client.put(f"/api/admin/comptes/{user['id']}/deconnexion", headers=admin).json() == {"delai_s": 30}
    reste = client.get("/api/auth/session", headers=h).json()["deconnexion_dans"]
    assert 0 < reste <= 30                                                           # compte à rebours affiché à l'utilisateur
    assert client.get("/api/auth/moi", headers=h).status_code == 200                 # il peut encore finir ce qu'il faisait
    # Échéance atteinte
    passe = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    client.portal.call(db.users.update_one, {"id": user["id"]}, {"$set": {"deconnexion_a": passe}})
    r = client.get("/api/auth/moi", headers=h)
    assert r.status_code == 401 and "administrateur" in r.json()["detail"]
    assert client.get("/api/auth/moi", headers=h).status_code == 401
    assert _connecter(client, user, mdp)                                             # connexion forcée à nouveau possible


def test_annulation_et_connexion_pendant_l_annonce(client, admin, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    client.put(f"/api/admin/comptes/{user['id']}/deconnexion", headers=admin)
    assert client.delete(f"/api/admin/comptes/{user['id']}/deconnexion", headers=admin).status_code == 200
    assert client.get("/api/auth/session", headers=h).json() == {"deconnexion_dans": None}


def test_deconnexion_generale_epargne_les_administrateurs(client, admin, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    r = client.post("/api/admin/comptes/deconnexion-generale", headers=admin)
    assert r.status_code == 200 and r.json()["annonces"] >= 1
    assert client.get("/api/auth/session", headers=h).json()["deconnexion_dans"] is not None
    assert client.get("/api/auth/session", headers=admin).json() == {"deconnexion_dans": None}   # l'administrateur n'est pas annoncé
    assert client.put(f"/api/admin/comptes/{client.get('/api/auth/moi', headers=admin).json()['id']}/deconnexion", headers=admin).status_code == 422
    client.portal.call(db.users.update_many, {}, {"$unset": {"deconnexion_a": ""}})


def test_un_administrateur_peut_en_deconnecter_un_autre(client, admin):
    client.portal.call(db.users.insert_one, {"id": "second-admin", "nom": "Autre", "prenom": "Admin", "telephone": "+22670999901", "role": "admin",
                                              "password_hash": "x", "version_session": 0, "cree_le": datetime.now(timezone.utc).isoformat()})
    assert client.put("/api/admin/comptes/second-admin/deconnexion", headers=admin).status_code == 200      # un autre administrateur : permis
    assert client.get("/api/auth/session", headers=admin).json() == {"deconnexion_dans": None}               # l'administrateur lui-même : jamais annoncé
    client.portal.call(db.users.delete_one, {"id": "second-admin"})


def test_la_deconnexion_volontaire_ferme_la_session(client, utilisateur):
    user, _, mdp = utilisateur
    h = _connecter(client, user, mdp)
    assert client.post("/api/auth/deconnexion", headers=h).status_code == 200
    assert client.get("/api/auth/moi", headers=h).status_code == 401                 # le jeton ne rouvre plus rien
