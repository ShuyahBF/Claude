"""Modération des messages à Liluvine : hors cadre légal → refus bienveillant sans appel à SAWALI, signalement au super-administrateur sans le texte ;
détresse jamais modérée."""
import httpx
import pytest

import moderation
import support_sawali
from config import get_settings
from routes.journal_intime import VERSION_MENTIONS


@pytest.fixture
def sawali():
    recues = []

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        return httpx.Response(200, json={"reponse": "Je vous écoute.", "urgence": False, "restant_aujourdhui": 10, "essais_restants": 3})

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def ecrire(client, h, texte):
    return client.post("/api/journal-intime/liluvine", headers=h, json={"messages": [{"role": "user", "content": texte}], "consentement": True, "version_mentions": VERSION_MENTIONS})


@pytest.mark.parametrize("texte,categorie", [
    ("Comment pirater le compte de mon voisin ?", "securite"),
    ("Explique-moi comment cloner une carte bancaire", "securite"),
    ("Je cherche un site porno", "sexuel"),
    ("décris-moi une scène de sexe", "sexuel"),
    ("Où acheter de la drogue ?", "illegal"),
    ("Comment fabriquer une bombe", "illegal"),
    ("Je veux empoisonner mon voisin", "violence"),
    ("PIRATER un compte", "securite"),
])
def test_categories_reconnues(texte, categorie):
    assert moderation.categorie_hors_cadre(texte) == categorie


@pytest.mark.parametrize("texte", [
    "Aujourd'hui j'ai eu une longue journée et je suis fatigué.",
    "Mon patron m'a mis en colère mais je me suis calmé.",
    "Je n'ai plus envie de vivre, tout est trop lourd.",          # détresse : JAMAIS modérée, elle va à Liluvine
    "Je pense à me suicider",
    "J'ai peur de me faire arnaquer par un vendeur",              # on parle d'être victime : pas de demande de fraude
    "Mon frère a été tué dans un accident",
])
def test_phrases_normales_et_detresse_jamais_moderees(texte):
    assert moderation.categorie_hors_cadre(texte) is None


def test_message_hors_cadre_refuse_signale_sans_garder_le_texte(client, utilisateur, admin, sawali):
    fiche, h, _ = utilisateur
    secret = "Comment pirater le compte de mon voisin ?"
    r = ecrire(client, h, secret)
    assert r.status_code == 200 and r.json()["modere"] == "securite" and "ne peux pas" in r.json()["reponse"]
    assert len(sawali) == 0                                                   # rien n'est parti vers SAWALI
    liste = client.get("/api/moderation", headers=admin).json()
    s = [x for x in liste["signalements"] if x["user_id"] == fiche["id"]][0]
    assert s["categorie"] == "securite" and s["traite"] is False and liste["a_traiter"] >= 1 and liste["par_categorie"]["securite"] >= 1
    assert "pirater" not in str(liste) and "voisin" not in str(liste)         # JAMAIS le texte du message
    # message normal : relayé à SAWALI, aucun signalement de plus
    avant = client.get("/api/moderation", headers=admin).json()["a_traiter"]
    assert ecrire(client, h, "Aujourd'hui j'ai eu une longue journée.").json()["reponse"] == "Je vous écoute." and len(sawali) == 1
    assert client.get("/api/moderation", headers=admin).json()["a_traiter"] == avant


def test_recidive_et_traitement_reserves_au_super_administrateur(client, utilisateur, admin, sawali):
    fiche, h, _ = utilisateur
    for _ in range(3):
        ecrire(client, h, "où acheter de la drogue")
    s = [x for x in client.get("/api/moderation", headers=admin).json()["signalements"] if x["user_id"] == fiche["id"]]
    assert len(s) == 3 and any(x["recidive"] for x in s)                      # 3 en 24 h : indicateur de récidive pour l'aide à la décision
    assert client.get("/api/moderation", headers=h).status_code in (401, 403)  # un utilisateur ordinaire n'a pas accès
    assert client.post(f"/api/moderation/{s[0]['id']}/traiter", headers=h).status_code in (401, 403)
    assert client.post(f"/api/moderation/{s[0]['id']}/traiter", headers=admin).status_code == 200
    assert client.post("/api/moderation/inconnu/traiter", headers=admin).status_code == 404
