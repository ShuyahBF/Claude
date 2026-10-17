"""Préparation des paiements : le serveur construit le code USSD à partir du
service choisi et des valeurs saisies, puis le range dans l'historique de
l'utilisateur. Le site l'affiche en QR code (lien « tel: ») à scanner avec le
téléphone, qui ouvre alors son composeur avec le code pré-rempli.

⚠️ Le site ne sait pas si l'opérateur a validé la transaction (c'est le
téléphone qui dialogue avec l'opérateur) : l'utilisateur indique lui-même
« payé » ou « abandonné ».
"""
from __future__ import annotations

import re
import secrets
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

import lieux_marchands
from db import SANS_ID, db
from securite import get_current_user
from ussd import ErreurSaisie, construire_code, lien_tel

router = APIRouter(prefix="/paiements", tags=["Paiements"])


class Position(BaseModel):
    """Position du téléphone au moment du paiement (envoyée seulement si le compte a activé sa géolocalisation)."""
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    precision: Optional[float] = Field(None, ge=0, le=100_000)    # mètres


class Preparation(BaseModel):
    service_id: str = Field(min_length=1, max_length=64)
    valeurs: dict[str, str] = Field(default_factory=dict)
    position: Optional[Position] = None


class Statut(BaseModel):
    statut: Literal["prepare", "effectue", "abandonne"]


def _avec_lien(p: dict) -> dict:
    """Ajoute le lien « tel: » (calculé, jamais stocké). Un paiement PI-SPI n'a pas de code USSD."""
    return {**p, "lien_tel": lien_tel(p["code_ussd"]) if p.get("code_ussd") else None}


@router.post("", status_code=status.HTTP_201_CREATED)
async def preparer(data: Preparation, user: dict = Depends(get_current_user)):
    service = await db.services.find_one({"id": data.service_id, "actif": True}, SANS_ID)
    if not service:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable ou désactivé")
    champs = service.get("champs", [])
    try:
        code = construire_code(service["gabarit_ussd"], champs, data.valeurs)
    except ErreurSaisie as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    # Seules les valeurs des champs du service sont gardées (rien d'autre n'est stocké)
    valeurs = {c["key"]: str(data.valeurs.get(c["key"], "")).strip().replace(" ", "") for c in champs}
    # Marchand concerné (si le service a un champ « code marchand »)
    marchand = None
    champ_marchand = next((c for c in champs if c.get("isMerchantCode")), None)
    if champ_marchand:
        doc = await db.marchands.find_one({"operateur": service["operateur"], "code": valeurs[champ_marchand["key"]]},
                                          SANS_ID)
        marchand = {"code": valeurs[champ_marchand["key"]], "libelle": (doc or {}).get("libelle")}
    montant = int(valeurs["amount"]) if valeurs.get("amount", "").isdigit() else None
    paiement = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "service_id": service["id"],
        "operateur": service["operateur"], "service_nom": service["nom"], "categorie": service["categorie"],
        "valeurs": valeurs, "marchand": marchand, "montant": montant, "code_ussd": code, "statut": "prepare",
        "cree_le": datetime.now(timezone.utc).isoformat(),
    }
    # Géolocalisation (lot 49) : seulement si le compte l'a activée. La position est gardée dans l'historique de CE compte (arrondie à
    # environ 10 m) et sert à situer le marchand ; sans géolocalisation, toute position envoyée est ignorée.
    if data.position and user.get("geoloc"):
        paiement["position"] = {"lat": round(data.position.lat, 4), "lon": round(data.position.lon, 4), "precision": data.position.precision}
        if marchand:
            await lieux_marchands.noter(service["operateur"], marchand["code"], data.position.lat, data.position.lon, data.position.precision)
    await db.paiements.insert_one(paiement.copy())
    return _avec_lien(paiement)


class DemandePispi(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    code: str = Field(pattern=r"^[0-9]{1,20}$")
    montant: int = Field(ge=100, le=100_000_000)


class DeclarationPispi(BaseModel):
    reference_bancaire: str = Field(min_length=4, max_length=120)


def _montant_texte(n: int) -> str:
    return f"{n:,}".replace(",", " ") + " FCFA"


@router.post("/pispi", status_code=status.HTTP_201_CREATED)
async def preparer_pispi(data: DemandePispi, user: dict = Depends(get_current_user)):
    """Paiement chez un marchand par PI-SPI (lot 58) : bloc de paiement du marchand VÉRIFIÉ (QR de sa banque, référence à indiquer)."""
    from routes.comptes_marchands import compte_verifie_pour
    compte = await compte_verifie_pour(data.operateur, data.code)
    if not compte:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce marchand n'accepte pas le paiement PI-SPI")
    reference = "PM-" + secrets.token_hex(4).upper()
    p = compte["pispi"]
    paiement = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "service_id": None, "operateur": data.operateur, "service_nom": "Paiement marchand par PI-SPI",
        "categorie": "merchant_payment", "valeurs": {"code": data.code, "amount": str(data.montant)}, "marchand": {"code": data.code, "libelle": compte["nom"]},
        "montant": data.montant, "code_ussd": None, "mode": "pispi", "reference": reference, "compte_marchand_id": compte["id"], "statut": "prepare",
        "cree_le": datetime.now(timezone.utc).isoformat(),
    }
    await db.paiements.insert_one(paiement.copy())
    bloc = {"marchand": compte["nom"], "banque": p["banque"], "titulaire": p["titulaire"], "adresse_paiement": p["adresse_paiement"],
            "montant": data.montant, "montant_texte": _montant_texte(data.montant), "reference": reference, "consigne": p.get("consigne") or "",
            "qr_data_url": f"data:{p.get('qr_image_type') or 'image/png'};base64,{p['qr_image_b64']}"}
    return {"paiement": _avec_lien(paiement), "bloc": bloc}


@router.post("/{paiement_id}/pispi/declarer")
async def declarer_pispi(paiement_id: str, data: DeclarationPispi, user: dict = Depends(get_current_user)):
    """Le client a payé : il indique la référence bancaire ; le marchand la vérifie sur son relevé puis confirme."""
    r = await db.paiements.update_one({"id": paiement_id, "user_id": user["id"], "mode": "pispi", "statut": {"$in": ["prepare", "declare"]}},
                                      {"$set": {"statut": "declare", "reference_bancaire": data.reference_bancaire.strip(), "declare_le": datetime.now(timezone.utc).isoformat()}})
    if not r.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement PI-SPI introuvable ou déjà traité")
    return _avec_lien(await db.paiements.find_one({"id": paiement_id}, SANS_ID))


# --------------------------------------------------------------------------------------------------------------------
# Historique filtré et statistiques (lot 22)
# --------------------------------------------------------------------------------------------------------------------
FORMAT_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LIMITE_ANALYSE = 5000   # nombre maximum de paiements analysés par appel (une seule lecture, regroupement en mémoire)


def beneficiaire(p: dict) -> dict:
    """Bénéficiaire d'un paiement : le marchand (intitulé et code) s'il y en a un, sinon la première valeur saisie
    qui n'est pas le montant (ex. numéro du destinataire d'un transfert)."""
    m = p.get("marchand") or {}
    if m.get("code"):
        return {"libelle": m.get("libelle") or m["code"], "code": m["code"]}
    for cle, valeur in (p.get("valeurs") or {}).items():
        if cle != "amount" and valeur:
            return {"libelle": valeur, "code": valeur}
    return {"libelle": "—", "code": ""}


def _texte_recherche(p: dict) -> str:
    """Tout ce qui peut servir à retrouver un paiement : bénéficiaire, code, valeurs saisies, service, opérateur."""
    b = beneficiaire(p)
    morceaux = [b["libelle"], b["code"], p.get("service_nom", ""), p.get("operateur", "")]
    morceaux += [v for k, v in (p.get("valeurs") or {}).items() if k != "amount"]
    return " ".join(str(x) for x in morceaux if x).lower()


def _verifier_dates(du: Optional[str], au: Optional[str]) -> None:
    for valeur in (du, au):
        if valeur and not FORMAT_DATE.match(valeur):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Date invalide : utilisez AAAA-MM-JJ")
    if du and au and du > au:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La date de début doit précéder la date de fin")


async def _charger(user: dict, du: Optional[str], au: Optional[str], operateur: Optional[str],
                   statut: Optional[str], q: Optional[str]) -> list[dict]:
    """Paiements de l'utilisateur filtrés par période, opérateur, statut et texte (du plus récent au plus ancien)."""
    _verifier_dates(du, au)
    filtre: dict = {"user_id": user["id"]}
    if du or au:
        # « cree_le » est un texte ISO : la comparaison de textes suit l'ordre chronologique (heure UTC = Ouagadougou)
        filtre["cree_le"] = {**({"$gte": f"{du}T00:00:00"} if du else {}), **({"$lte": f"{au}T23:59:59.999999"} if au else {})}
    if operateur:
        filtre["operateur"] = operateur
    if statut:
        filtre["statut"] = statut
    docs = await db.paiements.find(filtre, SANS_ID).sort("cree_le", -1).to_list(LIMITE_ANALYSE)
    if q and q.strip():
        mots = q.lower().split()
        docs = [p for p in docs if all(m in _texte_recherche(p) for m in mots)]   # tous les mots saisis doivent s'y trouver
    return docs


def calculer_statistiques(paiements: list[dict], top_statut: str = "effectue") -> dict:
    """Totaux, répartition par opérateur / service / jour, et classements (Top 10 montants et bénéficiaires).
    Seuls les paiements marqués « Payé » (statut « effectue ») entrent dans les chiffres et les graphiques :
    un code seulement préparé ou abandonné n'est jamais un paiement effectué (il est compté à part).
    top_statut : « effectue » = classements sur les paiements payés ; « tous » = tous les statuts."""
    compte = defaultdict(int)
    for p in paiements:
        compte[p.get("statut", "prepare")] += 1
    payes = [p for p in paiements if p.get("statut") == "effectue"]
    montants = [p["montant"] for p in payes if p.get("montant") is not None]
    montant_paye = sum(montants)

    par_op: dict[str, dict] = {}
    par_service: dict[tuple, dict] = {}
    par_jour: dict[str, dict] = {}
    for p in paiements:
        o = par_op.setdefault(p["operateur"], {"operateur": p["operateur"], "nombre": 0, "montant": 0, "payes": 0,
                                               "montant_paye": 0, "non_payes": 0})
        if p.get("statut") != "effectue":
            o["non_payes"] += 1          # préparé ou abandonné : affiché à part, hors des chiffres
            continue
        m = p.get("montant") or 0
        o["nombre"] += 1
        o["montant"] += m
        o["payes"] += 1
        o["montant_paye"] += m
        sv = par_service.setdefault((p["operateur"], p["service_nom"]),
                                    {"operateur": p["operateur"], "service": p["service_nom"], "nombre": 0, "montant": 0})
        sv["nombre"] += 1
        sv["montant"] += m
        jour = str(p.get("cree_le", ""))[:10]
        j = par_jour.setdefault(jour, {"jour": jour, "nombre": 0, "montant": 0})
        j["nombre"] += 1
        j["montant"] += m
    # Un opérateur sans aucun paiement payé n'a pas de carte (ses codes seulement préparés restent dans la liste)
    par_op = {k: v for k, v in par_op.items() if v["nombre"]}

    base_top = payes if top_statut == "effectue" else paiements
    top_montants = sorted((p for p in base_top if p.get("montant") is not None), key=lambda p: p["montant"], reverse=True)[:10]
    par_benef: dict[tuple, dict] = {}
    for p in base_top:
        b = beneficiaire(p)
        k = (p["operateur"], b["code"] or b["libelle"])
        e = par_benef.setdefault(k, {"libelle": b["libelle"], "code": b["code"], "operateur": p["operateur"], "nombre": 0, "montant": 0})
        e["nombre"] += 1
        e["montant"] += p.get("montant") or 0
    return {
        "totaux": {
            "nombre": len(payes), "operations": len(paiements), "montant_total": sum(montants),
            "montant_moyen": round(sum(montants) / len(montants)) if montants else 0,
            "plus_gros": max(montants) if montants else 0,
            "payes": compte["effectue"], "abandonnes": compte["abandonne"], "prepares": compte["prepare"],
            "taux_payes": round(100 * compte["effectue"] / len(paiements)) if paiements else 0,
            "montant_paye": montant_paye,
        },
        "par_operateur": sorted(par_op.values(), key=lambda x: (-x["nombre"], x["operateur"])),
        "par_service": sorted(par_service.values(), key=lambda x: -x["nombre"])[:8],
        "par_jour": sorted(par_jour.values(), key=lambda x: x["jour"])[-90:],
        "top_montants": [{"id": p["id"], "cree_le": p["cree_le"], "operateur": p["operateur"], "service": p["service_nom"],
                          "beneficiaire": beneficiaire(p)["libelle"], "montant": p["montant"], "statut": p["statut"]} for p in top_montants],
        "top_beneficiaires": sorted(par_benef.values(), key=lambda x: (-x["montant"], -x["nombre"]))[:10],
        "classement_sur": top_statut,
        "tronque": len(paiements) >= LIMITE_ANALYSE,
    }


@router.get("")
async def historique(limite: int = Query(50, ge=1, le=500), du: Optional[str] = None, au: Optional[str] = None,
                     operateur: Optional[str] = None, statut: Optional[Literal["prepare", "effectue", "abandonne"]] = None,
                     q: Optional[str] = Query(None, max_length=80), user: dict = Depends(get_current_user)):
    """Paiements préparés par l'utilisateur connecté, du plus récent au plus ancien, filtrables par période
    (du / au, AAAA-MM-JJ), opérateur, statut et recherche libre (bénéficiaire, code, numéro, service)."""
    docs = await _charger(user, du, au, operateur, statut, q)
    return [_avec_lien(p) for p in docs[:limite]]


@router.get("/statistiques")
async def statistiques(du: Optional[str] = None, au: Optional[str] = None, operateur: Optional[str] = None,
                       statut: Optional[Literal["prepare", "effectue", "abandonne"]] = None,
                       q: Optional[str] = Query(None, max_length=80),
                       classement: Literal["effectue", "tous"] = "effectue", user: dict = Depends(get_current_user)):
    """Statistiques de l'utilisateur connecté sur la période choisie (une lecture, calcul en mémoire)."""
    docs = await _charger(user, du, au, operateur, statut, q)
    return {"periode": {"du": du, "au": au}, **calculer_statistiques(docs, classement)}


@router.put("/{paiement_id}/statut")
async def changer_statut(paiement_id: str, data: Statut, user: dict = Depends(get_current_user)):
    # PI-SPI (lot 58) : seul le MARCHAND confirme la réception ; le client peut seulement abandonner un paiement non encore confirmé
    courant = await db.paiements.find_one({"id": paiement_id, "user_id": user["id"]}, SANS_ID)
    if courant and courant.get("mode") == "pispi" and (data.statut != "abandonne" or courant.get("statut") in ("effectue", "refuse")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Un paiement PI-SPI est confirmé par le marchand : vous pouvez seulement l'abandonner avant sa confirmation")
    # Le filtre user_id garantit qu'on ne modifie que SES paiements
    res = await db.paiements.update_one({"id": paiement_id, "user_id": user["id"]},
                                        {"$set": {"statut": data.statut,
                                                  "statut_le": datetime.now(timezone.utc).isoformat()}})
    if not res.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement introuvable")
    return _avec_lien(await db.paiements.find_one({"id": paiement_id}, SANS_ID))


@router.delete("/{paiement_id}")
async def supprimer(paiement_id: str, user: dict = Depends(get_current_user)):
    res = await db.paiements.delete_one({"id": paiement_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement introuvable")
    return {"ok": True}
