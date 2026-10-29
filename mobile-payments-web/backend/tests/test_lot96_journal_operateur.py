"""Lot 96 — auRor : import du journal des transactions de l'opérateur (Excel) et nom du bénéficiaire modifiable après coup."""
import base64
import io
from datetime import datetime, timedelta, timezone

from openpyxl import Workbook

ENTETE = ["ID", "Date/Heure\nTrans.", "Transfer ID", "MSISDN", "STATEMENT", "PhoneTrans", "Type", "Amount", "Debit", "Credit", "Fees", "Contact", "Observations", "M"]


def _journal(lignes):
    """Classeur Excel de même structure que celui remis par Orange (+ la ligne « Somme » finale à ignorer)."""
    wb = Workbook()
    ws = wb.active
    ws.append(ENTETE)
    for ligne in lignes:
        ws.append(ligne)
    ws.append(["Somme", None, None, None, None, None, None, "=SUM(H2:H4)", None, None, None, None, None, None])
    tampon = io.BytesIO()
    wb.save(tampon)
    return base64.b64encode(tampon.getvalue()).decode()


def _sortie(ref, quand, tel, montant, contact="MASSARA DAGNOGO"):
    return [1, quand, ref, "77000155", f"77000155 MONEY PAID TO {tel}", tel, "OUT", montant, montant, 0, "0", contact, None, 0]


def _entree(ref, quand, tel, montant, contact="AWA SAWADOGO"):
    return [2, quand, ref, "77000155", f"{tel} MONEY RECEIVED", tel, "IN", montant, 0, montant, "0", contact, None, 0]


def _importer(client, h, lignes, appliquer, operateur="Orange"):
    return client.post("/api/journal-operateur/import", headers=h, json={"operateur": operateur, "fichier": _journal(lignes), "appliquer": appliquer})


def test_analyse_puis_import_et_reimport(client, utilisateur):
    _, h, _ = utilisateur
    lignes = [_sortie("PP241011.0921.71395083", datetime(2024, 10, 11, 9, 21), "67072823", 15000),
              _sortie("PP240918.2322.19388877", datetime(2024, 9, 18, 23, 22), "67072823", 2700),
              _entree("PP240920.1010.11111111", datetime(2024, 9, 20, 10, 10), "70112233", 5000)]
    # Analyse : rien n'est écrit
    r = _importer(client, h, lignes, False).json()
    assert r["applique"] is False and r["lues"] == 3 and r["nouvelles"] == 3 and r["ignorees"] == 0
    assert client.get("/api/paiements", headers=h, params={"statut": "effectue"}).json() == []
    # Import : les trois transactions arrivent, payées, avec le nom du contact
    r = _importer(client, h, lignes, True).json()
    assert r["nouvelles"] == 3
    hist = client.get("/api/paiements", headers=h, params={"limite": 50}).json()
    assert len(hist) == 3 and {p["statut"] for p in hist} == {"effectue"}
    sortie = next(p for p in hist if p["reference_operateur"] == "PP241011.0921.71395083")
    assert sortie["service_nom"] == "Transfert d'argent" and sortie["montant"] == 15000 and sortie["nom_beneficiaire"] == "MASSARA DAGNOGO"
    assert sortie["cree_le"].startswith("2024-10-11T09:21")
    # Le même fichier une seconde fois n'ajoute rien
    r = _importer(client, h, lignes, True).json()
    assert r["nouvelles"] == 0 and r["deja_presentes"] == 3
    assert len(client.get("/api/paiements", headers=h).json()) == 3
    # L'argent reçu ne compte pas dans les dépenses
    stats = client.get("/api/paiements/statistiques", headers=h).json()
    assert stats["totaux"]["montant_total"] == 17700 and stats["totaux"]["nombre"] == 2


def test_rapprochement_d_un_paiement_prepare(client, utilisateur):
    _, h, _ = utilisateur
    s = next(x for x in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if x["nom"] == "Transfert d'argent")
    p = client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"phone": "67072823", "amount": "15000"}}).json()
    assert p["statut"] == "prepare"
    quand = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=3)       # l'opérateur enregistre quelques minutes après
    r = _importer(client, h, [_sortie("PP999.1", quand, "226 67 07 28 23", 15000)], True).json()
    assert r["rapprochees"] == 1 and r["nouvelles"] == 0
    hist = client.get("/api/paiements", headers=h).json()
    assert len(hist) == 1 and hist[0]["id"] == p["id"]
    assert hist[0]["statut"] == "effectue" and hist[0]["reference_operateur"] == "PP999.1" and hist[0]["nom_beneficiaire"] == "MASSARA DAGNOGO"


def test_nom_modifiable_apres_coup(client, utilisateur):
    _, h, _ = utilisateur
    s = next(x for x in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if x["nom"] == "Transfert d'argent")
    p = client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"phone": "67072823", "amount": "1000"}}).json()
    r = client.put(f"/api/paiements/{p['id']}/nom", headers=h, json={"nom": "  Maman  "})
    assert r.status_code == 200 and r.json()["nom_beneficiaire"] == "Maman"
    assert [x["id"] for x in client.get("/api/paiements", headers=h, params={"q": "maman"}).json()] == [p["id"]]    # retrouvé par son nom
    top = client.get("/api/paiements/statistiques", headers=h, params={"statut": "prepare", "classement": "tous"}).json()["top_beneficiaires"]
    assert top[0]["libelle"] == "Maman"
    assert "nom_beneficiaire" not in client.put(f"/api/paiements/{p['id']}/nom", headers=h, json={"nom": ""}).json()    # vide = retour au numéro
    # Un achat de crédit n'a pas de bénéficiaire à nommer
    credit = next(x for x in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if x["categorie"] == "airtime_topup")
    c = client.post("/api/paiements", headers=h, json={"service_id": credit["id"], "valeurs": {"amount": "500"}}).json()
    assert client.put(f"/api/paiements/{c['id']}/nom", headers=h, json={"nom": "x"}).status_code == 409
    assert client.put(f"/api/paiements/{p['id']}/nom", headers=h, json={"nom": "x" * 81}).status_code == 422


def test_fichiers_refuses_et_historique_prive(client, utilisateur):
    _, h, _ = utilisateur
    pas_un_journal = base64.b64encode(b"ceci n'est pas un fichier Excel" * 10).decode()
    assert client.post("/api/journal-operateur/import", headers=h, json={"operateur": "Orange", "fichier": pas_un_journal}).status_code == 422
    sans_colonnes = Workbook()
    sans_colonnes.active.append(["Nom", "Prénom"])
    tampon = io.BytesIO()
    sans_colonnes.save(tampon)
    r = client.post("/api/journal-operateur/import", headers=h, json={"operateur": "Orange", "fichier": base64.b64encode(tampon.getvalue()).decode()})
    assert r.status_code == 422 and "Transfer ID" in r.json()["detail"]
    assert _importer(client, h, [_sortie("PP1", datetime(2024, 1, 1, 8, 0), "67072823", 100)], False, operateur="Inconnu").status_code == 422
    # Un autre utilisateur n'a pas ces transactions dans son historique
    _importer(client, h, [_sortie("PP-PRIVE", datetime(2024, 1, 1, 8, 0), "67072823", 100)], True)
    autre = client.post("/api/auth/register", json={"email": "autre96@test.bf", "password": "motdepasse-96", "nom": "Autre"})
    if autre.status_code in (200, 201):
        h2 = {"Authorization": f"Bearer {autre.json()['access_token']}"}
        assert client.get("/api/paiements", headers=h2).json() == []


def test_nom_applique_aux_autres_paiements_du_meme_numero(client, utilisateur):
    """Lot 97 — « Appliquer aussi aux autres paiements vers ce numéro » : sans écraser un nom différent saisi à la main."""
    _, h, _ = utilisateur
    s = next(x for x in client.get("/api/services", params={"operateur": "Orange"}, headers=h).json() if x["nom"] == "Transfert d'argent")
    def faire(tel, montant):
        return client.post("/api/paiements", headers=h, json={"service_id": s["id"], "valeurs": {"phone": tel, "amount": montant}}).json()
    a, b, c, autre_numero = faire("67072823", "1000"), faire("67072823", "2000"), faire("67072823", "3000"), faire("70112233", "4000")
    client.put(f"/api/paiements/{c['id']}/nom", headers=h, json={"nom": "Tonton"})                  # nom différent déjà saisi à la main
    r = client.put(f"/api/paiements/{a['id']}/nom", headers=h, json={"nom": "Maman", "aux_autres": True}).json()
    assert r["nom_beneficiaire"] == "Maman" and r["autres_modifies"] == 1                              # seul « b » (sans nom) est complété
    noms = {x["id"]: x.get("nom_beneficiaire") for x in client.get("/api/paiements", headers=h).json()}
    assert noms[b["id"]] == "Maman" and noms[c["id"]] == "Tonton" and noms[autre_numero["id"]] is None
    # Renommer : les paiements qui portaient « Maman » suivent
    r = client.put(f"/api/paiements/{a['id']}/nom", headers=h, json={"nom": "Maman Awa", "aux_autres": True}).json()
    assert r["autres_modifies"] == 1
    # Sans la case cochée, un seul paiement change
    assert client.put(f"/api/paiements/{a['id']}/nom", headers=h, json={"nom": "Awa"}).json()["autres_modifies"] == 0
