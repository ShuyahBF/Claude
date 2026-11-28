"""Règles permanentes du propriétaire : version/lot, nouveautés, mesure, présence SAWALI, envoi non bloquant."""
import asyncio
import time

import httpx
import pytest

import lot
import mesure
import nouveautes
import presence_sawali
import whatsapp
from conftest import attendre, entete


def test_regle_nouveautes_le_lot_courant_a_sa_carte():
    """Règle 5 : chaque lot déployé a sa carte « Nouveautés » (même numéro que lot.py) qui ouvre une rubrique des Paramètres."""
    cartes = [n for n in nouveautes.NOUVEAUTES if n["lot"] == lot.LOT]
    assert cartes, f"Ajouter la carte du lot {lot.LOT} dans nouveautes.py"
    assert all(c["rubrique"] in nouveautes.RUBRIQUES for c in cartes)


def test_version_publique(app_client):
    r = app_client.get("/api/version").json()
    assert r["version"] == lot.VERSION and r["lot"] == lot.LOT and r["deploye_le"]


def test_nouveautes_et_performances_reservees_aux_admins(app_client, monde):
    za = monde["Alpha"]["jeton"]
    assert app_client.get("/api/nouveautes", headers=entete(za)).json()["lot"] == lot.LOT
    app_client.get("/api/equipements", headers=entete(za))
    routes = [x["route"] for x in app_client.get("/api/performances", headers=entete(za)).json()]
    assert "GET /api/equipements" in routes                                     # règle 7 : chaque appel est mesuré
    assert app_client.get("/api/performances").status_code == 401


def test_rapport_de_mesure():
    mesure.STATS.clear()
    for d in (0.1, 0.3):
        mesure.noter("GET /x", d)
    r = mesure.rapport()[0]
    assert r["nombre"] == 2 and r["moyenne_ms"] == 200 and r["max_ms"] == 300 and not r["lente"]


def test_envoi_whatsapp_ne_bloque_pas_la_requete(app_client, monde):
    """Règle 7 : SAWALI lent (1,5 s) ne ralentit pas la page ; le message part quand même en arrière-plan."""
    recus = []

    async def lent(req):                      # asynchrone : un vrai réseau lent ne gèle pas la boucle
        await asyncio.sleep(1.5)
        recus.append(req)
        return httpx.Response(200, json={})

    ancien = whatsapp._transport
    whatsapp._transport = httpx.MockTransport(lent)
    try:
        z = monde["Alpha"]
        H = entete(z["jeton"])
        tech = [u for u in app_client.get("/api/utilisateurs", headers=H).json() if u["role"] == "technicien"][0]
        eq = app_client.get("/api/equipements", headers=H).json()[0]
        ot = app_client.post("/api/interventions", headers=H, json={"equipement_id": eq["id"], "titre": "Test lenteur"}).json()
        debut = time.time()
        assert app_client.post(f"/api/interventions/{ot['id']}/planifier", headers=H, json={"technicien_id": tech["id"]}).status_code == 200
        assert time.time() - debut < 1.0
        attendre(recus, 1, delai=5)
        assert len(recus) == 1
    finally:
        whatsapp._transport = ancien


@pytest.mark.asyncio
async def test_nouvel_essai_sur_5xx_meme_id_pas_sur_4xx():
    """Comme ZandGo : un seul nouvel essai (même id) sur 5xx, aucun sur 4xx."""
    import hmac_sawali
    client = {"id": "c", "emetteur": "gemao-x", **hmac_sawali.champs_cle("k")}
    appels = []

    def serveur(code):
        def h(req):
            appels.append(req.content)
            return httpx.Response(code)
        return h

    ancien = whatsapp._transport
    try:
        whatsapp._transport = httpx.MockTransport(serveur(503))
        assert await whatsapp.envoyer(client, "22670000000", "a") == "echec"
        assert len(appels) == 2 and appels[0] == appels[1]
        appels.clear()
        whatsapp._transport = httpx.MockTransport(serveur(400))
        assert await whatsapp.envoyer(client, "22670000000", "a") == "echec" and len(appels) == 1
    finally:
        whatsapp._transport = ancien


@pytest.mark.asyncio
async def test_presence_sawali_signal_sans_secret():
    envoyes = []
    presence_sawali._transport = httpx.MockTransport(lambda r: (envoyes.append(r), httpx.Response(200))[1])
    assert await presence_sawali.signaler()
    import json
    corps = json.loads(envoyes[0].content)
    assert corps["application"] == "GeMAO" and corps["version"] == lot.VERSION and corps["machine"]
    assert "cle" not in json.dumps(corps).lower() and "token" not in json.dumps(corps).lower()
