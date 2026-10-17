"""Lot 34 — anniversaires à souhaiter : 30 personnes au plus, prochaine date, âge, isolation par utilisateur."""
from datetime import date

import pytest

from routes import anniversaires as an


def _fiche(nom="Awa", jour=15, mois=3, **plus):
    return {"nom": nom, "jour": jour, "mois": mois, **plus}


def test_prochain_anniversaire_et_bissextile():
    auj = date(2026, 10, 17)
    assert an.prochain_anniversaire(17, 10, auj) == date(2026, 10, 17)      # aujourd'hui
    assert an.prochain_anniversaire(16, 10, auj) == date(2027, 10, 16)      # passé : l'an prochain
    assert an.prochain_anniversaire(29, 2, auj) == date(2027, 2, 28)        # 29/02 → 28/02 (2027 non bissextile)
    assert an.prochain_anniversaire(29, 2, date(2027, 10, 1)) == date(2028, 2, 29)
    f = an.enrichir({"nom": "A", "jour": 20, "mois": 10, "annee": 1990}, auj)
    assert f["dans_jours"] == 3 and f["age"] == 36


def test_creation_liste_triee_et_age(client, utilisateur):
    _, h, _ = utilisateur
    for n, j, m in (("Zoé", 1, 1), ("Aimé", 2, 1)):
        assert client.post("/api/anniversaires", headers=h, json=_fiche(n, j, m, annee=1990)).status_code == 201
    r = client.post("/api/anniversaires", headers=h, json=_fiche("Moussa", 15, 6, telephone="70 11 22 33", note="Frère"))
    assert r.status_code == 201 and r.json()["telephone"] == "+22670112233" and r.json()["age"] is None
    liste = client.get("/api/anniversaires", headers=h).json()
    assert liste["total"] == 3 and liste["maximum"] == 30
    assert [f["dans_jours"] for f in liste["fiches"]] == sorted(f["dans_jours"] for f in liste["fiches"])
    assert "user_id" not in liste["fiches"][0]


@pytest.mark.parametrize("corps", [
    _fiche(jour=31, mois=4), _fiche(jour=29, mois=2, annee=1999), _fiche(annee=2100),
    _fiche(nom=" "), _fiche(telephone="abc"), _fiche(jour=0)])
def test_fiche_invalide_refusee(client, utilisateur, corps):
    _, h, _ = utilisateur
    assert client.post("/api/anniversaires", headers=h, json=corps).status_code == 422


def test_trente_personnes_au_plus(client, utilisateur):
    _, h, _ = utilisateur
    for i in range(30):
        assert client.post("/api/anniversaires", headers=h, json=_fiche(f"P{i}", 1 + i % 28, 1 + i % 12)).status_code == 201
    r = client.post("/api/anniversaires", headers=h, json=_fiche("Trente et unième"))
    assert r.status_code == 409 and "30" in r.json()["detail"]
    # Supprimer une fiche libère une place
    une = client.get("/api/anniversaires", headers=h).json()["fiches"][0]["id"]
    assert client.delete(f"/api/anniversaires/{une}", headers=h).status_code == 200
    assert client.post("/api/anniversaires", headers=h, json=_fiche("Nouvelle")).status_code == 201


def test_modifier_supprimer_et_isolation(client, utilisateur, admin):
    _, h, _ = utilisateur
    fid = client.post("/api/anniversaires", headers=h, json=_fiche("Awa")).json()["id"]
    r = client.put(f"/api/anniversaires/{fid}", headers=h, json=_fiche("Awa T.", 2, 2))
    assert r.status_code == 200 and r.json()["nom"] == "Awa T." and r.json()["jour"] == 2
    # Un autre utilisateur (l'administrateur) ne voit ni ne touche cette fiche
    assert client.get("/api/anniversaires", headers=admin).json()["total"] == 0
    assert client.put(f"/api/anniversaires/{fid}", headers=admin, json=_fiche("Pirate")).status_code == 404
    assert client.delete(f"/api/anniversaires/{fid}", headers=admin).status_code == 404
    assert client.delete(f"/api/anniversaires/{fid}", headers=h).status_code == 200
    assert client.delete(f"/api/anniversaires/{fid}", headers=h).status_code == 404


def test_connexion_requise(client):
    assert client.get("/api/anniversaires").status_code == 401
