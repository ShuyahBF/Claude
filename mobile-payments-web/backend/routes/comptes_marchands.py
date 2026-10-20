"""Compte MARCHAND et paiement PI-SPI chez un marchand (lot 58).

Pour un développeur WinDev :
  - un utilisateur peut ouvrir UN « compte marchand » : nom de la boutique, ses codes marchands (opérateur + code) et ses informations PI-SPI
    (banque, titulaire, adresse de paiement, image du QR PI-SPI fourni par sa banque) ;
  - ANTI-FRAUDE : le QR PI-SPI d'un marchand n'est montré aux clients qu'après VÉRIFICATION par l'administrateur (statut « verifie »).
    Toute modification des codes, du nom ou des informations PI-SPI remet le compte « en_attente » (on ne peut pas faire vérifier un compte
    puis changer le QR pour détourner les paiements). Un code marchand ne peut appartenir qu'à UN compte ;
  - le client choisit le mode « PI-SPI » dans l'écran Payer (après le montant) : il reçoit le bloc de paiement (QR de la banque du marchand,
    référence PM-XXXXXXXX à indiquer), paie avec l'application de SA banque, puis déclare la référence bancaire ;
  - le MARCHAND voit les paiements déclarés et confirme (ou refuse) la réception après contrôle de son relevé : seul lui peut passer
    le paiement à « effectue » ; le client ne peut que l'abandonner.
Routes (utilisateur connecté) :
    GET  /api/mon-marchand                       PUT /api/mon-marchand                   POST /api/mon-marchand/qr
    GET  /api/mon-marchand/paiements             POST /api/mon-marchand/paiements/{id}/confirmer | /refuser
    GET  /api/marchands/{operateur}/{code}/pispi (disponibilité chez un marchand vérifié)
    POST /api/paiements/pispi                    POST /api/paiements/{id}/pispi/declarer     (voir routes/paiements.py)
Administrateur : GET /api/admin/marchands, GET /api/admin/marchands/{id}/qr, PUT /api/admin/marchands/{id}/statut
"""
from __future__ import annotations

import base64
import binascii
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user, require_admin

router = APIRouter(tags=["Compte marchand"])

QR_MAX_OCTETS = 500_000
BANQUES = ["Ecobank", "UBA", "BSIC", "IB Bank", "Coris Bank", "Banque Atlantique", "Société Générale", "Autre"]
CONSIGNE_DEFAUT = "Scannez ce QR avec l'application de votre banque, payez le montant exact, puis indiquez la référence de l'opération."


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


class CodeMarchand(BaseModel):
    operateur: str = Field(min_length=1, max_length=40)
    code: str = Field(pattern=r"^[0-9]{1,20}$")


class InfosPispi(BaseModel):
    banque: str = Field(min_length=2, max_length=60)
    titulaire: str = Field(min_length=2, max_length=80)
    adresse_paiement: str = Field(min_length=3, max_length=120)
    consigne: str = Field("", max_length=200)


class CompteIn(BaseModel):
    nom: str = Field(min_length=2, max_length=60)
    codes: List[CodeMarchand] = Field(default_factory=list, max_length=5)
    pispi: Optional[InfosPispi] = None


class QrIn(BaseModel):
    image: str = Field(min_length=40, max_length=800_000)          # data:image/png;base64,… ou data:image/jpeg;base64,…


def _vue(c: Dict[str, Any], avec_qr: bool = False) -> Dict[str, Any]:
    p = dict(c.get("pispi") or {})
    qr = p.pop("qr_image_b64", None)
    type_qr = p.pop("qr_image_type", None)
    p["qr_present"] = bool(qr)
    if avec_qr and qr:
        p["qr_data_url"] = f"data:{type_qr or 'image/png'};base64,{qr}"
    return {"id": c["id"], "nom": c["nom"], "codes": c.get("codes", []), "pispi": p or None, "statut": c.get("statut", "en_attente"),
            "cree_le": c.get("cree_le"), "modifie_le": c.get("modifie_le"), "verifie_le": c.get("verifie_le")}


async def _mon_compte(user: dict) -> Optional[Dict[str, Any]]:
    return await db.comptes_marchands.find_one({"user_id": user["id"]}, SANS_ID)


def _signature(c: Dict[str, Any]) -> tuple:
    """Ce qui est soumis à vérification : nom, codes et informations PI-SPI (QR compris)."""
    p = c.get("pispi") or {}
    return (c.get("nom"), tuple(sorted((x["operateur"], x["code"]) for x in c.get("codes", []))), p.get("banque"), p.get("titulaire"),
            p.get("adresse_paiement"), p.get("qr_image_b64"))


async def _verifier_codes(codes: List[CodeMarchand], compte_id: Optional[str]) -> None:
    for c in codes:
        autre = await db.comptes_marchands.find_one({"codes": {"$elemMatch": {"operateur": c.operateur, "code": c.code}}, "id": {"$ne": compte_id}}, SANS_ID)
        if autre:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Le code {c.code} ({c.operateur}) est déjà rattaché à un autre compte marchand : contactez le support")


@router.get("/mon-marchand")
async def lire(user: dict = Depends(get_current_user)):
    c = await _mon_compte(user)
    return {"compte": _vue(c, avec_qr=True) if c else None, "banques": BANQUES, "consigne_defaut": CONSIGNE_DEFAUT}


@router.put("/mon-marchand")
async def enregistrer(data: CompteIn, user: dict = Depends(get_current_user)):
    """Crée ou modifie MON compte marchand. Un changement remet le compte « en attente » de vérification."""
    codes = [{"operateur": c.operateur, "code": c.code} for c in {(c.operateur, c.code): c for c in data.codes}.values()]
    await _verifier_codes(data.codes, (await _mon_compte(user) or {}).get("id"))
    existant = await _mon_compte(user)
    pispi = data.pispi.model_dump() if data.pispi else None
    if pispi:
        pispi["consigne"] = pispi["consigne"].strip() or CONSIGNE_DEFAUT
        if existant and (existant.get("pispi") or {}).get("qr_image_b64"):                      # l'image déjà envoyée est conservée
            pispi["qr_image_b64"] = existant["pispi"]["qr_image_b64"]
            pispi["qr_image_type"] = existant["pispi"].get("qr_image_type")
    nouveau = {"nom": data.nom.strip(), "codes": codes, "pispi": pispi}
    if not existant:
        doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **nouveau, "statut": "en_attente", "cree_le": _maintenant(), "modifie_le": _maintenant()}
        await db.comptes_marchands.insert_one(doc.copy())
        return {"compte": _vue(doc, avec_qr=True)}
    statut = existant.get("statut", "en_attente")
    if _signature({**existant, **nouveau}) != _signature(existant) and statut != "suspendu":
        statut = "en_attente"                                                                   # tout changement doit être revérifié
    await db.comptes_marchands.update_one({"id": existant["id"]}, {"$set": {**nouveau, "statut": statut, "modifie_le": _maintenant()}})
    return {"compte": _vue(await _mon_compte(user), avec_qr=True)}


@router.post("/mon-marchand/qr")
async def envoyer_qr(data: QrIn, user: dict = Depends(get_current_user)):
    """Image du QR PI-SPI fournie par la banque du marchand (PNG ou JPEG, 500 Ko au plus). Remet le compte « en attente »."""
    c = await _mon_compte(user)
    if not c or not c.get("pispi"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Enregistrez d'abord les informations PI-SPI de votre compte marchand")
    entete, _, corps = data.image.partition(",")
    type_qr = entete[5:].split(";")[0] if entete.startswith("data:") else ""
    if type_qr not in ("image/png", "image/jpeg"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Image PNG ou JPEG attendue")
    try:
        octets = base64.b64decode(corps, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Image illisible")
    if len(octets) > QR_MAX_OCTETS:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image trop lourde : 500 Ko au plus")
    if not (octets.startswith(b"\x89PNG\r\n\x1a\n") or octets.startswith(b"\xff\xd8\xff")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ce fichier n'est pas une image PNG ou JPEG")
    pispi = {**c["pispi"], "qr_image_b64": base64.b64encode(octets).decode("ascii"), "qr_image_type": type_qr}
    statut = "suspendu" if c.get("statut") == "suspendu" else "en_attente"
    await db.comptes_marchands.update_one({"id": c["id"]}, {"$set": {"pispi": pispi, "statut": statut, "modifie_le": _maintenant()}})
    return {"compte": _vue(await _mon_compte(user), avec_qr=True)}


# ------------------------------------------------------------------------------------------------ côté client
async def compte_verifie_pour(operateur: str, code: str) -> Optional[Dict[str, Any]]:
    """Compte marchand VÉRIFIÉ, avec QR et adresse PI-SPI, qui possède ce code ; None sinon."""
    c = await db.comptes_marchands.find_one({"statut": "verifie", "codes": {"$elemMatch": {"operateur": operateur, "code": code}}}, SANS_ID)
    p = (c or {}).get("pispi") or {}
    return c if c and p.get("adresse_paiement") and p.get("qr_image_b64") else None


@router.get("/marchands/{operateur}/{code}/pispi")
async def disponibilite(operateur: str, code: str, _: dict = Depends(get_current_user)):
    """Le client peut-il payer ce marchand par PI-SPI ? (seulement s'il a un compte marchand vérifié avec un QR)"""
    c = await compte_verifie_pour(operateur, code)
    return {"disponible": bool(c), "nom": c["nom"] if c else None, "banque": c["pispi"]["banque"] if c else None}


# ------------------------------------------------------------------------------------------------ côté marchand
@router.get("/mon-marchand/paiements")
async def mes_paiements(user: dict = Depends(get_current_user)):
    c = await _mon_compte(user)
    if not c:
        return {"paiements": []}
    docs = await db.paiements.find({"compte_marchand_id": c["id"], "mode": "pispi", "statut": {"$in": ["declare", "effectue", "refuse"]}}, {"_id": 0, "pieces": 0, "motif": 0}).sort("cree_le", -1).to_list(100)   # lot 85 : le motif et les pièces du payeur ne sont jamais lus ici
    # Noms des payeurs lus EN BLOC (une seule requête)
    ids = list({d["user_id"] for d in docs})
    noms = {u["id"]: f"{u.get('prenom', '')} {(u.get('nom') or '')[:1]}.".strip() async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "prenom": 1, "nom": 1})}
    ordre = {"declare": 0, "effectue": 1, "refuse": 2}
    docs.sort(key=lambda d: ordre[d["statut"]])
    return {"paiements": [{"id": d["id"], "payeur": noms.get(d["user_id"], "Client"), "montant": d.get("montant"), "reference": d.get("reference"),
                           "reference_bancaire": d.get("reference_bancaire"), "statut": d["statut"], "cree_le": d.get("cree_le"), "declare_le": d.get("declare_le")} for d in docs]}


async def _decider(paiement_id: str, user: dict, nouveau: str) -> Dict[str, Any]:
    c = await _mon_compte(user)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement introuvable")
    r = await db.paiements.update_one({"id": paiement_id, "compte_marchand_id": c["id"], "mode": "pispi", "statut": "declare"},
                                      {"$set": {"statut": nouveau, "statut_le": _maintenant(), "decide_par": user["id"]}})
    if not r.matched_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiement introuvable ou déjà traité")
    return {"ok": True, "statut": nouveau}


@router.post("/mon-marchand/paiements/{paiement_id}/confirmer")
async def confirmer(paiement_id: str = Path(..., min_length=8, max_length=64), user: dict = Depends(get_current_user)):
    """Le marchand a VU l'argent sur son relevé bancaire : le paiement devient « Payé » (entre dans les statistiques du client)."""
    return await _decider(paiement_id, user, "effectue")


@router.post("/mon-marchand/paiements/{paiement_id}/refuser")
async def refuser(paiement_id: str = Path(..., min_length=8, max_length=64), user: dict = Depends(get_current_user)):
    return await _decider(paiement_id, user, "refuse")


# ------------------------------------------------------------------------------------------------ administrateur
@router.get("/admin/marchands")
async def admin_liste(_: dict = Depends(require_admin)):
    """Comptes marchands à vérifier d'abord, puis les autres ; avec le titulaire du compte."""
    comptes = await db.comptes_marchands.find({}, SANS_ID).sort("modifie_le", -1).to_list(500)
    ids = [c["user_id"] for c in comptes]
    users = {u["id"]: u async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "prenom": 1, "nom": 1, "telephone": 1})}
    ordre = {"en_attente": 0, "verifie": 1, "suspendu": 2}
    comptes.sort(key=lambda c: ordre.get(c.get("statut"), 3))
    return {"marchands": [{**_vue(c), "titulaire_compte": f"{users.get(c['user_id'], {}).get('prenom', '')} {users.get(c['user_id'], {}).get('nom', '')}".strip(),
                           "telephone": users.get(c["user_id"], {}).get("telephone")} for c in comptes]}


@router.get("/admin/marchands/{compte_id}/qr")
async def admin_qr(compte_id: str, _: dict = Depends(require_admin)):
    """QR PI-SPI enregistré : l'administrateur le compare à celui de la banque avant de vérifier le compte."""
    c = await db.comptes_marchands.find_one({"id": compte_id}, SANS_ID)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable")
    return {"pispi": _vue(c, avec_qr=True)["pispi"]}


class StatutIn(BaseModel):
    statut: Literal["verifie", "suspendu", "en_attente"]


@router.put("/admin/marchands/{compte_id}/statut")
async def admin_statut(compte_id: str, data: StatutIn, admin: dict = Depends(require_admin)):
    c = await db.comptes_marchands.find_one({"id": compte_id}, SANS_ID)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable")
    if data.statut == "verifie" and not ((c.get("pispi") or {}).get("qr_image_b64") and c.get("codes")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Un compte ne peut être vérifié qu'avec au moins un code marchand et un QR PI-SPI")
    maj = {"statut": data.statut, "modifie_le": _maintenant()}
    if data.statut == "verifie":
        maj.update(verifie_le=_maintenant(), verifie_par=admin["id"])
    await db.comptes_marchands.update_one({"id": compte_id}, {"$set": maj})
    return _vue(await db.comptes_marchands.find_one({"id": compte_id}, SANS_ID))
