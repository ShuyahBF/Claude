"""Lot 98 — auRor : histogramme par mois et répartition des bénéficiaires par opérateur (camembert)."""
import base64
import io
from datetime import datetime

from openpyxl import Workbook

ENTETE = ["ID", "Date/Heure\nTrans.", "Transfer ID", "MSISDN", "STATEMENT", "PhoneTrans", "Type", "Amount", "Debit", "Credit", "Fees", "Contact", "Observations", "M"]


def _importer(client, h, lignes):
    wb = Workbook()
    wb.active.append(ENTETE)
    for ligne in lignes:
        wb.active.append(ligne)
    tampon = io.BytesIO()
    wb.save(tampon)
    return client.post("/api/journal-operateur/import", headers=h, json={"operateur": "Orange", "appliquer": True,
                                                                          "fichier": base64.b64encode(tampon.getvalue()).decode()})


def _ligne(ref, quand, tel, montant, contact):
    return [1, quand, ref, "77000155", "x", tel, "OUT", montant, montant, 0, "0", contact, None, 0]


def test_stats_par_mois_et_camembert_par_operateur(client, utilisateur):
    _, h, _ = utilisateur
    lignes = [_ligne("A1", datetime(2024, 1, 5, 9, 0), "67000001", 10000, "ALICE"), _ligne("A2", datetime(2024, 1, 20, 9, 0), "67000001", 5000, "ALICE"),
              _ligne("A3", datetime(2024, 3, 2, 9, 0), "67000002", 20000, "BOUBA")]
    # 7 bénéficiaires de plus petits montants : au-delà de 6 parts nommées, le reste est regroupé en « Autres »
    lignes += [_ligne(f"B{i}", datetime(2024, 4, 1 + i, 9, 0), f"6800000{i}", 100 + i, f"PETIT{i}") for i in range(7)]
    assert _importer(client, h, lignes).status_code == 200
    s = client.get("/api/paiements/statistiques", headers=h).json()
    # Histogramme mensuel : janvier = 2 paiements, 15 000 FCFA ; les mois sans paiement n'apparaissent pas
    mois = {m["mois"]: m for m in s["par_mois"]}
    assert mois["2024-01"] == {"mois": "2024-01", "nombre": 2, "montant": 15000} and mois["2024-03"]["montant"] == 20000 and "2024-02" not in mois
    # Le montant diffère d'un jour à l'autre (l'ancien histogramme ne comptait que le NOMBRE de paiements)
    assert len({j["montant"] for j in s["par_jour"]}) > 2
    # Camembert : bénéficiaires d'Orange, triés par montant, 6 parts nommées + « Autres »
    orange = s["beneficiaires_par_operateur"]["Orange"]
    parts = orange["parts"]
    assert [p["libelle"] for p in parts[:2]] == ["BOUBA", "ALICE"] and len(parts) == 7 and parts[-1]["libelle"].startswith("Autres")
    assert sum(p["montant"] for p in parts) == orange["total"]
