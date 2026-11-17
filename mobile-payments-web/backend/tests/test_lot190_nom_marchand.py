"""Lot 190 — réglage « proposer le nom du marchand d'après le SMS » : actif par défaut, propre à chaque compte."""


def test_reglage_propose_nom_marchand(client, utilisateur):
    _, h, _ = utilisateur
    moi = client.get("/api/auth/moi", headers=h).json()
    assert moi.get("proposer_nom_marchand") is None                      # absent = actif (valeur de départ côté site)
    r = client.put("/api/auth/proposer-nom-marchand", headers=h, json={"actif": False})
    assert r.status_code == 200 and r.json()["proposer_nom_marchand"] is False
    assert client.put("/api/auth/proposer-nom-marchand", headers=h, json={"actif": True}).json()["proposer_nom_marchand"] is True
    assert client.put("/api/auth/proposer-nom-marchand", headers=h, json={}).status_code == 422
