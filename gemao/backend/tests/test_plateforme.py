"""Parcours complet : clients, isolation, interventions, stock, préventif, WhatsApp signé."""
import hashlib
import hmac
import json
import time

from conftest import connecter, entete


def signer_webhook(cle, emetteur, corps, ts=None):
    ts = str(ts or int(time.time()))
    sig = hmac.new(cle.encode(), f"{ts}.{corps}".encode(), hashlib.sha256).hexdigest()
    return {"X-Emetteur": emetteur, "X-Timestamp": ts, "X-Signature": sig, "Content-Type": "application/json"}


def test_cle_hmac_montree_une_seule_fois(app_client, monde):
    root = monde["root"]
    liste = app_client.get("/api/clients", headers=entete(root)).json()
    assert {c["code"] for c in liste} >= {"alpha", "beta"}
    assert all("cle_hmac" not in c and "cle_hmac_chiffree" not in c for c in liste)
    assert all(c["cle_hmac_empreinte"] for c in liste)
    # Un admin de client ne peut pas gérer les clients
    assert app_client.get("/api/clients", headers=entete(monde["Alpha"]["jeton"])).status_code == 403


def test_rotation_invalide_ancienne_cle(app_client, monde, faux_sawali):
    z = monde["Alpha"]
    vieille = z["cle"]
    r = app_client.post(f"/api/clients/{z['client']['id']}/rotation-cle", headers=entete(monde["root"]))
    z["cle"] = r.json()["cle_hmac"]
    assert z["cle"] != vieille
    corps = json.dumps({"id": "r1", "de": "22670000001", "message": "bonjour"})
    h = signer_webhook(vieille, z["client"]["emetteur"], corps)
    assert app_client.post("/api/webhooks/sawali", content=corps, headers=h).status_code == 401


def test_isolation_entre_clients(app_client, monde):
    za, al = monde["Alpha"], monde["Beta"]
    r = app_client.post("/api/equipements", headers=entete(za["jeton"]), json={"code": "GEN-1", "nom": "Groupe électrogène"})
    assert r.status_code == 201
    # Même code autorisé chez un autre client, mais les listes sont étanches
    assert app_client.post("/api/equipements", headers=entete(al["jeton"]), json={"code": "GEN-1", "nom": "Autre"}).status_code == 201
    assert [e["nom"] for e in app_client.get("/api/equipements", headers=entete(za["jeton"])).json()] == ["Groupe électrogène"]
    assert [e["nom"] for e in app_client.get("/api/equipements", headers=entete(al["jeton"])).json()] == ["Autre"]
    # Un admin ne peut pas se faire passer pour un autre client avec X-Client-Id
    e = app_client.get("/api/equipements", headers=entete(za["jeton"], al["client"]["id"])).json()
    assert [x["nom"] for x in e] == ["Groupe électrogène"]
    # Le super-admin doit choisir un client
    assert app_client.get("/api/equipements", headers=entete(monde["root"])).status_code == 400


def test_intervention_cloture_stock_et_whatsapp(app_client, monde, faux_sawali):
    z = monde["Alpha"]
    H = entete(z["jeton"])
    cid = z["client"]["id"]
    tech = app_client.post("/api/utilisateurs", headers=H, json={"nom": "Issa", "email": "issa@alpha.bf", "telephone": "22670111111",
                                                                "role": "technicien", "mot_de_passe": "technicien-1"}).json()
    eq = [e for e in app_client.get("/api/equipements", headers=H).json() if e["code"] == "GEN-1"][0]
    piece = app_client.post("/api/pieces", headers=H, json={"code": "FIL-1", "nom": "Filtre", "stock": 5, "seuil": 3, "prix_unitaire": 2000}).json()
    ot = app_client.post("/api/interventions", headers=H, json={"equipement_id": eq["id"], "titre": "Ne démarre plus", "arret_production": True}).json()
    assert ot["numero"].startswith("OT-") and ot["numero"].endswith("-0001")
    assert [e for e in app_client.get("/api/equipements", headers=H).json() if e["id"] == eq["id"]][0]["etat"] == "en_panne"

    faux_sawali.clear()
    assert app_client.post(f"/api/interventions/{ot['id']}/planifier", headers=H, json={"technicien_id": tech["id"]}).status_code == 200
    # WhatsApp sortant signé avec la clé de CE client, émetteur de CE client
    wa = faux_sawali[-1]
    assert wa["entetes"]["x-emetteur"] == z["client"]["emetteur"]
    ts, sig = wa["entetes"]["x-timestamp"], wa["entetes"]["x-signature"]
    assert sig == hmac.new(z["cle"].encode(), f"{ts}.{wa['corps']}".encode(), hashlib.sha256).hexdigest()
    assert json.loads(wa["corps"])["a"] == "22670111111"

    # Transition interdite : clôturer sans avoir démarré
    assert app_client.post(f"/api/interventions/{ot['id']}/cloturer", headers=H, json={"rapport": "Rapport ok"}).status_code == 409
    assert app_client.post(f"/api/interventions/{ot['id']}/demarrer", headers=H).status_code == 200
    # Stock insuffisant : rien n'est sorti
    assert app_client.post(f"/api/interventions/{ot['id']}/cloturer", headers=H,
                           json={"rapport": "Rapport ok", "pieces": [{"piece_id": piece["id"], "quantite": 9}]}).status_code == 409
    assert [p for p in app_client.get("/api/pieces", headers=H).json() if p["id"] == piece["id"]][0]["stock"] == 5
    r = app_client.post(f"/api/interventions/{ot['id']}/cloturer", headers=H,
                        json={"rapport": "Filtre remplacé", "pieces": [{"piece_id": piece["id"], "quantite": 3}], "cout_main_oeuvre": 5000})
    assert r.status_code == 200, r.text
    assert r.json()["cout_total"] == 11000 and r.json()["statut"] == "terminee"
    assert [e for e in app_client.get("/api/equipements", headers=H).json() if e["id"] == eq["id"]][0]["etat"] == "en_service"
    t = app_client.get("/api/tableau", headers=H).json()
    assert t["interventions_par_statut"]["terminee"] == 1 and t["cout_total"] == 11000
    assert [p["code"] for p in t["pieces_sous_seuil"]] == ["FIL-1"]       # stock 2 <= seuil 3


def test_webhook_whatsapp_cree_une_panne(app_client, monde, faux_sawali):
    z = monde["Alpha"]
    H = entete(z["jeton"])
    corps = json.dumps({"id": "wamid-1", "de": "+226 70 00 00 01", "message": "PANNE gen-1 Fuite d'huile"})
    h = signer_webhook(z["cle"], z["client"]["emetteur"], corps)
    faux_sawali.clear()
    r = app_client.post("/api/webhooks/sawali", content=corps, headers=h)
    assert r.status_code == 200, r.text
    assert "OT-" in json.loads(faux_sawali[-1]["corps"])["message"]              # réponse WhatsApp avec le numéro
    assert any(o["source"] == "whatsapp" and o["titre"] == "Fuite d'huile" for o in app_client.get("/api/interventions", headers=H).json())
    # Rejeu du même message : ignoré, pas de seconde intervention
    n = len(app_client.get("/api/interventions", headers=H).json())
    assert app_client.post("/api/webhooks/sawali", content=corps, headers=h).json().get("doublon") is True
    assert len(app_client.get("/api/interventions", headers=H).json()) == n


def test_webhook_refuse_mauvaise_signature_et_autre_client(app_client, monde):
    z, al = monde["Alpha"], monde["Beta"]
    corps = json.dumps({"id": "x", "de": "22670000001", "message": "PANNE GEN-1 test"})
    # Signé avec la clé de Beta mais présenté comme Alpha -> refusé
    h = signer_webhook(al["cle"], z["client"]["emetteur"], corps)
    assert app_client.post("/api/webhooks/sawali", content=corps, headers=h).status_code == 401
    # Émetteur inconnu / sans en-têtes
    assert app_client.post("/api/webhooks/sawali", content=corps, headers={"X-Emetteur": "inconnu"}).status_code == 401
    assert app_client.post("/api/webhooks/sawali", content=corps).status_code == 401
    # Horodatage trop ancien
    h = signer_webhook(z["cle"], z["client"]["emetteur"], corps, ts=int(time.time()) - 3600)
    assert app_client.post("/api/webhooks/sawali", content=corps, headers=h).status_code == 401


def test_numero_inconnu_et_aide(app_client, monde, faux_sawali):
    z = monde["Alpha"]
    for mid, de, texte, attendu in (("m1", "22699999999", "PANNE GEN-1 x", "pas enregistré"), ("m2", "22670000001", "bonjour", "PANNE <code")):
        corps = json.dumps({"id": mid, "de": de, "message": texte})
        faux_sawali.clear()
        assert app_client.post("/api/webhooks/sawali", content=corps, headers=signer_webhook(z["cle"], z["client"]["emetteur"], corps)).status_code == 200
        assert attendu in json.loads(faux_sawali[-1]["corps"])["message"]


def test_preventif_genere_les_ot_echus(app_client, monde):
    z = monde["Alpha"]
    H = entete(z["jeton"])
    eq = [e for e in app_client.get("/api/equipements", headers=H).json() if e["code"] == "GEN-1"][0]
    p = app_client.post("/api/preventif", headers=H, json={"equipement_id": eq["id"], "titre": "Vidange 250 h", "periodicite_jours": 30, "prochaine_date": "2020-01-01"})
    assert p.status_code == 201
    assert app_client.post("/api/preventif/generer", headers=H).json()["nombre"] == 1
    assert app_client.post("/api/preventif/generer", headers=H).json()["nombre"] == 0   # pas de doublon


def test_demandeur_ne_voit_que_ses_demandes(app_client, monde):
    z = monde["Alpha"]
    H = entete(z["jeton"])
    app_client.post("/api/utilisateurs", headers=H, json={"nom": "Awa", "email": "awa@alpha.bf", "role": "demandeur", "mot_de_passe": "demandeur-1"})
    jd = connecter(app_client, "awa@alpha.bf", "demandeur-1")
    eq = app_client.get("/api/equipements", headers=H).json()[0]
    assert app_client.post("/api/interventions", headers=entete(jd), json={"equipement_id": eq["id"], "titre": "Bruit anormal"}).status_code == 201
    assert len(app_client.get("/api/interventions", headers=entete(jd)).json()) == 1
    assert app_client.get("/api/tableau", headers=entete(jd)).status_code == 403
    assert app_client.post("/api/equipements", headers=entete(jd), json={"code": "Z", "nom": "z"}).status_code == 403


def test_connexion_refusee(app_client, monde):
    assert app_client.post("/api/auth/connexion", json={"email": "admin@alpha.bf", "mot_de_passe": "faux"}).status_code == 401
    assert app_client.get("/api/equipements").status_code == 401
