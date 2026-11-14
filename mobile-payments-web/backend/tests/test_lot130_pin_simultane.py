"""Lot 130 — réglage « PIN envoyé en même temps » par opérateur et chaîne affichée en débogage (propres à chaque compte)."""


def test_reglages_de_depart_et_par_operateur(client, utilisateur):
    _, h, _ = utilisateur
    moi = client.get("/api/auth/moi", headers=h).json()
    assert not moi.get("pin_simultane") and not moi.get("debug_chaine")          # départ : dialogue du code secret, pas de débogage
    r = client.put("/api/auth/pin-simultane", headers=h, json={"operateur": "Orange", "actif": True})
    assert r.status_code == 200 and r.json()["pin_simultane"] == {"Orange": True}
    r = client.put("/api/auth/pin-simultane", headers=h, json={"operateur": "Moov", "actif": False})
    assert r.json()["pin_simultane"] == {"Orange": True, "Moov": False}          # chaque opérateur garde son choix
    r = client.put("/api/auth/pin-simultane", headers=h, json={"operateur": "Orange", "actif": False})
    assert r.json()["pin_simultane"]["Orange"] is False


def test_debug_chaine_reserve_au_super_admin(client, utilisateur, admin):
    _, h, _ = utilisateur
    assert client.put("/api/auth/debug-chaine", headers=h, json={"actif": True}).status_code == 403        # un utilisateur ordinaire ne peut pas l'activer
    assert client.put("/api/auth/debug-chaine", headers=admin, json={"actif": True}).json()["debug_chaine"] is True
    assert client.put("/api/auth/debug-chaine", headers=admin, json={"actif": False}).json()["debug_chaine"] is False


def test_connexion_requise(client):
    assert client.put("/api/auth/pin-simultane", json={"operateur": "Orange", "actif": True}).status_code == 401
    assert client.put("/api/auth/debug-chaine", json={"actif": True}).status_code == 401
