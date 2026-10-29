"""Lot 96 — auRor : import du JOURNAL DES TRANSACTIONS remis par l'opérateur (fichier Excel « Suivi des transactions électroniques »).

Le fichier est celui que l'opérateur (Orange…) remet à la demande du client. Une ligne = une transaction, avec ces colonnes :
    ID · Date/Heure Trans. · Transfer ID · MSISDN · STATEMENT · PhoneTrans · Type (OUT / IN) · Amount · Debit · Credit · Fees ·
    Contact · Observations · M
Les colonnes sont retrouvées PAR LEUR NOM (l'ordre importe peu) ; les lignes de total (« Somme ») ou sans date sont ignorées.

Ce que fait l'import, pour chaque ligne du journal :
  1. le « Transfer ID » est déjà dans l'historique (import précédent)  → on complète seulement ce qui manque (nom du contact…) ;
  2. un paiement préparé dans auRor correspond (même montant, même numéro ou code, juste avant l'heure de l'opérateur)
     → il est RAPPROCHÉ : il passe à « Payé » et reçoit le Transfer ID, la date exacte et les frais ;
  3. sinon la transaction est AJOUTÉE à l'historique (statut « Payé », mode « import »).
Une transaction reçue (IN) est gardée dans l'historique mais ne compte jamais dans les statistiques de dépenses ni dans le portefeuille.

Deux temps pour éviter toute surprise : `appliquer = false` (défaut) ANALYSE seulement et renvoie les chiffres et un aperçu ;
`appliquer = true` écrit. Aucune nouvelle collection : tout est rangé dans `paiements`.
    POST /api/journal-operateur/import   {operateur, fichier (base64 du .xlsx), appliquer}
"""
from __future__ import annotations

import base64
import binascii
import io
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from db import db
from securite import get_current_user

router = APIRouter(prefix="/journal-operateur", tags=["Journal opérateur"])

FICHIER_OCTETS_MAX = 5_000_000          # taille du .xlsx décodé
LIGNES_MAX = 5000                       # transactions lues au plus par fichier
APERCU = 8                              # lignes montrées à l'analyse
MARGE_AVANT = timedelta(days=1)         # un paiement préparé AVANT la transaction (jusqu'à 1 jour) peut lui correspondre
MARGE_APRES = timedelta(hours=1)        # …ou juste après (décalage d'horloge)

# Colonnes du journal : nom normalisé (minuscules, sans accent ni ponctuation) → clé interne
ALIAS = {"id": "numero", "transferid": "ref", "msisdn": "compte", "statement": "libelle",
         "phonetrans": "contrepartie", "type": "sens", "amount": "montant", "debit": "debit", "credit": "credit",
         "fees": "frais", "contact": "contact", "observations": "observations"}


def _normaliser(texte: Any) -> str:
    """« Date/Heure\\nTrans. » → « dateheuretrans » : minuscules, sans accent, lettres et chiffres seulement."""
    sans_accent = unicodedata.normalize("NFKD", str(texte or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", sans_accent.lower())


def _cle_colonne(titre: Any) -> Optional[str]:
    n = _normaliser(titre)
    if n.startswith("dateheure") or n == "date":
        return "date"
    return ALIAS.get(n)


def _nombre(valeur: Any) -> float:
    """Montant lisible dans une cellule (nombre, « 15 000 », « 1.500,50 »…) ; 0 si vide ou illisible."""
    if isinstance(valeur, (int, float)):
        return float(valeur)
    t = re.sub(r"[^\d,.\-]", "", str(valeur or "")).replace(",", ".")
    try:
        return float(t) if t not in ("", "-", ".") else 0.0
    except ValueError:
        return 0.0


def _date(valeur: Any) -> Optional[datetime]:
    """Date/heure d'une cellule (date Excel ou texte JJ/MM/AAAA HH:MM). Heure de l'opérateur = heure de Ouagadougou = UTC."""
    if isinstance(valeur, datetime):
        return valeur.replace(tzinfo=timezone.utc)
    texte = str(valeur or "").strip()
    for modele in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(texte, modele).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _chiffres_bf(valeur: Any) -> str:
    """Numéro ou code réduit à ses chiffres, sans l'indicatif 226 (comparaison fiable d'un numéro écrit de plusieurs façons)."""
    c = re.sub(r"\D", "", str(valeur or ""))
    return c[3:] if c.startswith("226") and len(c) == 11 else c


def _categorie(sens: str, libelle: str) -> tuple[str, str]:
    """(catégorie, nom du service) d'après le sens et le libellé de l'opérateur."""
    t = _normaliser(libelle)
    if sens == "entree":
        return "money_receipt", "Argent reçu"
    if "merchant" in t or "marchand" in t:
        return "merchant_payment", "Paiement marchand"
    if "bill" in t or "facture" in t:
        return "bill_payment", "Paiement de facture"
    if "airtime" in t or ("credit" in t and "communication" in t):
        return "airtime_topup", "Achat de crédit de communication"
    return "money_transfer", "Transfert d'argent"


def lire_journal(octets: bytes) -> tuple[list[dict], int]:
    """Lit le classeur Excel. Renvoie (transactions, nombre de lignes ignorées). Fonction pure (aucun accès base).
    Lève ValueError avec un message clair si le fichier n'est pas un journal reconnu."""
    from openpyxl import load_workbook
    try:
        classeur = load_workbook(io.BytesIO(octets), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 — fichier abîmé, mauvais format…
        raise ValueError("Fichier illisible : choisissez le fichier Excel (.xlsx) remis par l'opérateur") from exc
    feuille = classeur.worksheets[0]
    lignes = feuille.iter_rows(values_only=True)
    colonnes: dict[str, int] = {}
    for ligne in lignes:                                   # en-tête : la première ligne qui contient le « Transfer ID »
        trouvees = {_cle_colonne(c): i for i, c in enumerate(ligne) if _cle_colonne(c)}
        if "ref" in trouvees:
            colonnes = trouvees
            break
    manquantes = [n for n, k in (("Transfer ID", "ref"), ("Date/Heure Trans.", "date"), ("Amount", "montant")) if k not in colonnes]
    if manquantes:
        raise ValueError("Ce fichier n'est pas un journal de transactions reconnu : colonne(s) absente(s) — " + ", ".join(manquantes))

    def cellule(ligne: tuple, cle: str) -> Any:
        i = colonnes.get(cle)
        return ligne[i] if i is not None and i < len(ligne) else None

    transactions: list[dict] = []
    ignorees = 0
    for ligne in lignes:
        if len(transactions) >= LIGNES_MAX:
            break
        ref = str(cellule(ligne, "ref") or "").strip()
        quand = _date(cellule(ligne, "date"))
        montant = int(round(_nombre(cellule(ligne, "montant")) or max(_nombre(cellule(ligne, "debit")), _nombre(cellule(ligne, "credit")))))
        if not ref:                                        # ligne vide ou ligne de total (« Somme ») : sautée sans bruit
            continue
        if not quand or montant <= 0:                      # transaction illisible (date ou montant absent) : comptée à part
            ignorees += 1
            continue
        type_brut = str(cellule(ligne, "sens") or "").strip().upper()
        entree = type_brut == "IN" or (not type_brut and _nombre(cellule(ligne, "credit")) > 0)
        sens = "entree" if entree else "sortie"
        libelle = str(cellule(ligne, "libelle") or "").strip()
        categorie, service = _categorie(sens, libelle)
        transactions.append({
            "ref": ref[:60], "quand": quand, "montant": montant, "sens": sens, "categorie": categorie, "service": service,
            "contrepartie": re.sub(r"\D", "", str(cellule(ligne, "contrepartie") or "")) or None,
            "compte": re.sub(r"\D", "", str(cellule(ligne, "compte") or "")) or None,
            "contact": str(cellule(ligne, "contact") or "").strip()[:80] or None,
            "frais": int(round(_nombre(cellule(ligne, "frais")))), "libelle": libelle[:160] or None,
            "observations": str(cellule(ligne, "observations") or "").strip()[:200] or None,
            "numero": str(cellule(ligne, "numero") or "").strip()[:20] or None,
        })
    if not transactions and not ignorees:
        raise ValueError("Aucune transaction trouvée dans ce fichier")
    return transactions, ignorees


def _correspond(p: dict, t: dict) -> bool:
    """Un paiement préparé dans auRor correspond-il à cette transaction ? Même opérateur, même montant, même numéro / code, proche dans le temps."""
    if p.get("montant") != t["montant"] or not t["contrepartie"]:
        return False
    cibles = {_chiffres_bf(v) for k, v in (p.get("valeurs") or {}).items() if k != "amount"} | {_chiffres_bf((p.get("marchand") or {}).get("code"))}
    if _chiffres_bf(t["contrepartie"]) not in cibles:
        return False
    try:
        cree = datetime.fromisoformat(p["cree_le"])
    except (KeyError, ValueError):
        return False
    return t["quand"] - MARGE_AVANT <= cree <= t["quand"] + MARGE_APRES


def _document(t: dict, operateur: str, user_id: str) -> dict:
    """Paiement créé pour une transaction du journal qui n'était pas dans l'historique."""
    valeurs = {"phone": t["contrepartie"]} if t["contrepartie"] else {}
    doc = {
        "id": str(uuid.uuid4()), "user_id": user_id, "service_id": None, "operateur": operateur, "service_nom": t["service"],
        "categorie": t["categorie"], "valeurs": {**valeurs, "amount": str(t["montant"])}, "marchand": None, "montant": t["montant"],
        "code_ussd": None, "mode": "import", "statut": "effectue", "cree_le": t["quand"].isoformat(), "sens": t["sens"],
        "reference_operateur": t["ref"], "frais": t["frais"], "compte_operateur": t["compte"],
        "libelle_operateur": t["libelle"], "observations_operateur": t["observations"], "numero_journal": t["numero"],
        "import_le": datetime.now(timezone.utc).isoformat(),
    }
    if t["contact"]:
        doc["nom_beneficiaire"] = t["contact"]
    return doc


class Import(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    fichier: str = Field(min_length=100, max_length=7_500_000)      # le .xlsx en base64
    appliquer: bool = False


@router.post("/import")
async def importer(data: Import, user: dict = Depends(get_current_user)):
    """Analyse (par défaut) ou applique un journal de transactions de l'opérateur à l'historique de l'utilisateur."""
    if data.operateur not in await db.services.distinct("operateur"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Opérateur inconnu : {data.operateur}")
    try:
        octets = base64.b64decode(data.fichier.partition(",")[2] if data.fichier.startswith("data:") else data.fichier, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fichier illisible")
    if len(octets) > FICHIER_OCTETS_MAX:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Fichier trop lourd (5 Mo au plus)")
    try:
        transactions, ignorees = lire_journal(octets)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    # UNE lecture des transactions déjà connues (Transfer ID) et UNE lecture des paiements préparés de la période (jamais une lecture par ligne)
    connus = {p["reference_operateur"]: p async for p in db.paiements.find(
        {"user_id": user["id"], "operateur": data.operateur, "reference_operateur": {"$in": [t["ref"] for t in transactions]}},
        {"_id": 0, "id": 1, "reference_operateur": 1, "nom_beneficiaire": 1})}
    if transactions:
        debut = min(t["quand"] for t in transactions) - MARGE_AVANT
        fin = max(t["quand"] for t in transactions) + MARGE_APRES
        candidats = await db.paiements.find(
            {"user_id": user["id"], "operateur": data.operateur, "reference_operateur": {"$exists": False},
             "cree_le": {"$gte": debut.isoformat(), "$lte": fin.isoformat()}},
            {"_id": 0, "id": 1, "cree_le": 1, "montant": 1, "valeurs": 1, "marchand": 1}).to_list(LIGNES_MAX)
    else:
        candidats = []

    nouveaux, rapproches, completes, deja = [], [], [], 0
    pris: set[str] = set()                                  # un paiement préparé ne correspond qu'à UNE transaction
    for t in transactions:
        existant = connus.get(t["ref"])
        if existant:
            if t["contact"] and not existant.get("nom_beneficiaire"):
                completes.append((existant["id"], t))        # le journal apporte un nom que l'historique n'avait pas
            else:
                deja += 1
            continue
        prepare = next((p for p in candidats if p["id"] not in pris and t["sens"] == "sortie" and _correspond(p, t)), None)
        if prepare:
            pris.add(prepare["id"])
            rapproches.append((prepare["id"], t))
        else:
            nouveaux.append(t)

    if data.appliquer:
        if nouveaux:
            await db.paiements.insert_many([_document(t, data.operateur, user["id"]) for t in nouveaux])
        for pid, t in rapproches:                            # le paiement préparé devient « Payé » avec les données de l'opérateur
            maj = {"statut": "effectue", "statut_le": datetime.now(timezone.utc).isoformat(), "cree_le": t["quand"].isoformat(),
                   "reference_operateur": t["ref"], "frais": t["frais"], "compte_operateur": t["compte"],
                   "libelle_operateur": t["libelle"], "import_le": datetime.now(timezone.utc).isoformat()}
            await db.paiements.update_one({"id": pid, "user_id": user["id"]}, {"$set": maj})
            if t["contact"]:                                  # sans écraser un nom déjà saisi à la main
                await db.paiements.update_one({"id": pid, "user_id": user["id"], "nom_beneficiaire": {"$exists": False}},
                                              {"$set": {"nom_beneficiaire": t["contact"]}})
        for pid, t in completes:
            await db.paiements.update_one({"id": pid, "user_id": user["id"], "nom_beneficiaire": {"$exists": False}},
                                          {"$set": {"nom_beneficiaire": t["contact"]}})
    return {
        "applique": data.appliquer, "lues": len(transactions), "ignorees": ignorees,
        "nouvelles": len(nouveaux), "rapprochees": len(rapproches), "completees": len(completes), "deja_presentes": deja,
        "apercu": [{"ref": t["ref"], "le": t["quand"].isoformat(), "montant": t["montant"], "sens": t["sens"], "contact": t["contact"],
                    "contrepartie": t["contrepartie"], "statut": "nouvelle"} for t in nouveaux[:APERCU]],
    }
