"""Lot 36 — rappels de paiements récurrents, rappels de médicaments et résumé du menu."""
from datetime import date, datetime, timedelta, timezone

import pytest

from routes import rappels_medicaments as med
from routes import rappels_paiements as pai


def aujourdhui():
    return datetime.now(timezone.utc).date()


# ---------------------------------------------------------------- paiements récurrents (fonctions pures)
def test_ajouter_mois_ramene_au_dernier_jour():
    assert pai.ajouter_mois(date(2026, 1, 31), 1, 31) == date(2026, 2, 28)
    assert pai.ajouter_mois(date(2026, 2, 28), 1, 31) == date(2026, 3, 31)        # retrouve le 31
    assert pai.ajouter_mois(date(2026, 11, 15), 3, 15) == date(2027, 2, 15)
    assert pai.ajouter_mois(date(2028, 2, 29), 12, 29) == date(2029, 2, 28)


def test_prochaine_echeance_jamais_dans_le_passe():
    auj = date(2026, 10, 17)
    assert pai.prochaine_echeance(date(2026, 10, 20), "mensuel", 20, auj) == date(2026, 11, 20)   # payé en avance
    assert pai.prochaine_echeance(date(2026, 7, 5), "mensuel", 5, auj) == date(2026, 11, 5)       # 3 mois de retard
    assert pai.prochaine_echeance(date(2026, 10, 9), "hebdomadaire", 9, auj) == date(2026, 10, 23)


def _paiement(**plus):
    return {"libelle": "Loyer", "frequence": "mensuel", "echeance": aujourdhui().isoformat(), **plus}


def test_paiements_creer_etats_et_paye(client, utilisateur):
    _, h, _ = utilisateur
    auj = aujourdhui()
    for lib, delta in (("Loyer", 0), ("Électricité", -3), ("Netflix", 10)):
        r = client.post("/api/rappels-paiements", headers=h, json=_paiement(libelle=lib, echeance=(auj + timedelta(days=delta)).isoformat(), montant=25000))
        assert r.status_code == 201
    liste = client.get("/api/rappels-paiements", headers=h).json()
    assert [r["libelle"] for r in liste["rappels"]] == ["Électricité", "Loyer", "Netflix"]       # du plus urgent au plus lointain
    assert [r["etat"] for r in liste["rappels"]] == ["retard", "aujourdhui", "a_venir"]
    assert liste["a_traiter"] == 2 and liste["maximum"] == 30 and "user_id" not in liste["rappels"][0]
    loyer = liste["rappels"][1]
    nouveau = client.post(f"/api/rappels-paiements/{loyer['id']}/paye", headers=h).json()
    assert date.fromisoformat(nouveau["echeance"]) > auj and nouveau["etat"] == "a_venir"


def test_paiement_unique_supprime_une_fois_paye(client, utilisateur):
    _, h, _ = utilisateur
    rid = client.post("/api/rappels-paiements", headers=h, json=_paiement(frequence="unique")).json()["id"]
    assert client.post(f"/api/rappels-paiements/{rid}/paye", headers=h).json() == {"termine": True}
    assert client.get("/api/rappels-paiements", headers=h).json()["total"] == 0


@pytest.mark.parametrize("corps", [_paiement(frequence="quotidien"), _paiement(libelle=" "), _paiement(rappel_jours=5),
                                   _paiement(montant=0), _paiement(echeance="2026-13-40")])
def test_paiement_invalide_refuse(client, utilisateur, corps):
    _, h, _ = utilisateur
    assert client.post("/api/rappels-paiements", headers=h, json=corps).status_code == 422


def test_paiements_trente_au_plus_et_isolation(client, utilisateur, admin):
    _, h, _ = utilisateur
    for i in range(30):
        assert client.post("/api/rappels-paiements", headers=h, json=_paiement(libelle=f"R{i}")).status_code == 201
    assert client.post("/api/rappels-paiements", headers=h, json=_paiement()).status_code == 409
    rid = client.get("/api/rappels-paiements", headers=h).json()["rappels"][0]["id"]
    assert client.get("/api/rappels-paiements", headers=admin).json()["total"] == 0
    assert client.delete(f"/api/rappels-paiements/{rid}", headers=admin).status_code == 404
    assert client.delete(f"/api/rappels-paiements/{rid}", headers=h).status_code == 200


# ---------------------------------------------------------------- médicaments
def _traitement(**plus):
    return {"medicament": "Paracétamol", "dose": "1 comprimé", "heures": ["20:30", "08:00", "08:00"],
            "debut": aujourdhui().isoformat(), **plus}


def test_prises_du_jour_retard_et_a_prendre():
    maintenant = datetime(2026, 10, 17, 9, 0, tzinfo=timezone.utc)
    r = {"id": "m1", "medicament": "A", "dose": None, "heures": ["08:00", "09:15", "21:00"], "debut": "2026-10-01", "fin": None}
    fini = {"id": "m2", "medicament": "B", "heures": ["10:00"], "debut": "2026-09-01", "fin": "2026-10-10"}
    futur = {"id": "m3", "medicament": "C", "heures": ["10:00"], "debut": "2026-10-18", "fin": None}
    prises = med.prises_du_jour([r, fini, futur], {("m1", "08:00")}, maintenant)
    assert [(p["heure"], p["pris"], p["en_retard"]) for p in prises] == [("08:00", True, False), ("09:15", False, False), ("21:00", False, False)]
    assert med.a_prendre_compte(prises, maintenant) == 1                       # 09:15 est dans les 30 minutes
    prises2 = med.prises_du_jour([r], set(), maintenant)
    assert prises2[0]["en_retard"] is True and med.a_prendre_compte(prises2, maintenant) == 2   # 08:00 en retard + 09:15


def test_medicaments_creer_cocher_decocher(client, utilisateur):
    _, h, _ = utilisateur
    r = client.post("/api/rappels-medicaments", headers=h, json=_traitement())
    assert r.status_code == 201 and r.json()["heures"] == ["08:00", "20:30"] and r.json()["statut"] == "en_cours"
    rid = r.json()["id"]
    assert [p["heure"] for p in client.get("/api/rappels-medicaments", headers=h).json()["aujourdhui"]] == ["08:00", "20:30"]
    assert client.post(f"/api/rappels-medicaments/{rid}/prises", headers=h, json={"heure": "08:00", "pris": True}).status_code == 200
    client.post(f"/api/rappels-medicaments/{rid}/prises", headers=h, json={"heure": "08:00", "pris": True})   # idempotent
    jour = client.get("/api/rappels-medicaments", headers=h).json()["aujourdhui"]
    assert [p["pris"] for p in jour] == [True, False]
    client.post(f"/api/rappels-medicaments/{rid}/prises", headers=h, json={"heure": "08:00", "pris": False})
    assert client.get("/api/rappels-medicaments", headers=h).json()["aujourdhui"][0]["pris"] is False
    assert client.post(f"/api/rappels-medicaments/{rid}/prises", headers=h, json={"heure": "12:00"}).status_code == 404   # heure non prévue
    assert client.delete(f"/api/rappels-medicaments/{rid}", headers=h).status_code == 200
    assert client.get("/api/rappels-medicaments", headers=h).json()["total"] == 0


@pytest.mark.parametrize("corps", [_traitement(heures=[]), _traitement(heures=["25:00"]), _traitement(heures=["8h"]),
                                   _traitement(heures=["01:00"] * 1 + [f"0{i}:00" for i in range(2, 8)]),
                                   _traitement(fin="2000-01-01"), _traitement(medicament=" ")])
def test_traitement_invalide_refuse(client, utilisateur, corps):
    _, h, _ = utilisateur
    assert client.post("/api/rappels-medicaments", headers=h, json=corps).status_code == 422


def test_medicaments_vingt_au_plus(client, utilisateur):
    _, h, _ = utilisateur
    for i in range(20):
        assert client.post("/api/rappels-medicaments", headers=h, json=_traitement(medicament=f"M{i}")).status_code == 201
    assert client.post("/api/rappels-medicaments", headers=h, json=_traitement()).status_code == 409


# ---------------------------------------------------------------- résumé
def test_resume_du_menu(client, utilisateur):
    _, h, _ = utilisateur
    auj = aujourdhui()
    client.post("/api/anniversaires", headers=h, json={"nom": "Awa", "jour": auj.day, "mois": auj.month})
    client.post("/api/rappels-paiements", headers=h, json=_paiement())
    client.post("/api/rappels-medicaments", headers=h, json=_traitement(heures=["00:00"]))   # 00:00 : toujours passée ou imminente
    r = client.get("/api/rappels/resume", headers=h).json()
    assert r["anniversaires"] == 1 and r["paiements"] == 1 and r["medicaments"] >= 0 and r["total"] == sum(r[k] for k in ("anniversaires", "paiements", "medicaments"))
    assert client.get("/api/rappels/resume").status_code == 401


# ---------------------------------------------------------------- lot 40 : événements sonores
def test_evenements_prises_repetes_puis_arretes():
    m = datetime(2026, 10, 17, 9, 0, tzinfo=timezone.utc)
    def prise(h, pris=False):
        return {"rappel_id": "m1", "medicament": "Paracétamol", "dose": "1 comprimé", "heure": h, "pris": pris, "en_retard": False}
    ev = med.evenements_prises([prise("09:00"), prise("09:20"), prise("08:50"), prise("08:00", pris=True), prise("05:30")], m)
    par_heure = {e["cle"].split(":", 2)[2]: e for e in ev}
    assert set(par_heure) == {"09:00:0", "08:50:0"}                       # 09:20 (futur), 08:00 (pris), 05:30 (> 3 h) : aucune alerte
    assert par_heure["08:50:0"]["texte"].endswith("(en retard de 10 min)") and "(en retard" not in par_heure["09:00:0"]["texte"]
    # Plus tard, la MÊME prise oubliée a une autre clé : le navigateur sonne de nouveau
    plus_tard = datetime(2026, 10, 17, 9, 35, tzinfo=timezone.utc)
    cles = {e["cle"] for e in med.evenements_prises([prise("09:00")], plus_tard)}
    assert cles == {"med:m1:09:00:2"}
    assert {e["cle"] for e in med.evenements_prises([prise("09:00")], datetime(2026, 10, 17, 11, 0, tzinfo=timezone.utc))} == {"med:m1:09:00:3"}   # plafonné à 3


def test_resume_contient_les_evenements(client, utilisateur):
    _, h, _ = utilisateur
    auj = aujourdhui()
    client.post("/api/anniversaires", headers=h, json={"nom": "Awa", "jour": auj.day, "mois": auj.month, "annee": 1990})
    client.post("/api/rappels-paiements", headers=h, json=_paiement(libelle="Loyer", montant=75000))
    client.post("/api/rappels-medicaments", headers=h, json=_traitement(heures=["00:00"]))
    ev = client.get("/api/rappels/resume", headers=h).json()["evenements"]
    types = [e["type"] for e in ev]
    assert "paiement" in types and "anniversaire" in types and types == sorted(types, key=["medicament", "paiement", "anniversaire"].index)
    pai = next(e for e in ev if e["type"] == "paiement")
    assert pai["titre"] == "🔁 Loyer" and "à payer aujourd'hui" in pai["texte"] and "75 000 FCFA" in pai["texte"] and pai["lien"] == "/rappels-paiements"
    ann = next(e for e in ev if e["type"] == "anniversaire")
    assert "36 ans" in ann["texte"] or "ans" in ann["texte"]
    assert len({e["cle"] for e in ev}) == len(ev)                         # clés uniques
