"""Carnet de codes USSD pratiques (lot 66) : recharges Internet, connaître son numéro, solde, Mobile Money…

Demande du propriétaire (17/10/2026) : « carnet de codes USSD pratiques : recharges Internet, connaître son numéro, etc. »
pour les opérateurs du Burkina Faso (Orange, Moov Africa, Telecel Faso).

Pour un développeur WinDev (équivalent d'un seul fichier de données) :
  - fichier `ussd_codes` : un code = opérateur + catégorie + titre + code + description (optionnelle) + actif ;
  - les utilisateurs CONSULTENT (recherche, copie, appel direct) ; seul l'administrateur ajoute, corrige, désactive ou supprime ;
  - IMPORT EN BLOC : l'administrateur colle du texte, une ligne par code, sous la forme
        Opérateur | Catégorie | Titre | Code | Description (facultative)
    (les lignes déjà présentes — même opérateur et même code — sont ignorées, les lignes mal formées sont listées avec leur numéro) ;
  - AUCUN code n'est inventé ici : le carnet est vide tant que l'administrateur n'a pas saisi ou importé des codes vérifiés.

Routes (utilisateur connecté) :
    GET  /api/ussd                          → {operateurs: [{nom, categories: [{nom, codes: [{id, titre, code, description, appelable}]}]}]}
Routes (administrateur) :
    GET/POST /api/admin/ussd/codes · PUT/DELETE /api/admin/ussd/codes/{id}
    POST     /api/admin/ussd/importer       {texte}  → {ajoutes, ignores, erreurs: [{ligne, motif}]}
"""
from __future__ import annotations

import re
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user, require_admin

router = APIRouter(tags=["Codes USSD"])

# Listes finies (règle 10) : opérateurs du Burkina Faso, catégories proposées (« Autre… » reste possible côté écran)
OPERATEURS = ["Orange", "Moov", "Telecel"]
CATEGORIES_DEFAUT = ["Mon numéro", "Solde et crédit", "Internet et forfaits", "Appels et SMS", "Mobile Money", "Services"]
MAX_CODES = 600
# Un code USSD commence par * et finit par # ; il peut contenir des chiffres, * et # (et, pour un modèle à compléter, des lettres : *144*1*NUMERO#)
MOTIF_CODE = re.compile(r"^\*[0-9A-Za-z*#_ ]{1,40}#$")
MOTIF_APPELABLE = re.compile(r"^\*[0-9*#]{1,40}#$")


def normaliser_operateur(texte: str) -> str | None:
    """« orange », « Moov Africa », « TELECEL Faso »… → nom de la liste ; None si inconnu."""
    t = texte.strip().lower()
    for nom in OPERATEURS:
        if t.startswith(nom.lower()):
            return nom
    return None


def code_valide(code: str) -> bool:
    return bool(MOTIF_CODE.match(code.strip().replace(" ", "")))


def lire_lignes(texte: str) -> tuple[list[dict], list[dict]]:
    """Découpe un texte collé en codes valides + erreurs numérotées. Fonction pure (testée sans base)."""
    valides, erreurs = [], []
    for n, brut in enumerate(texte.splitlines(), start=1):
        ligne = brut.strip()
        if not ligne:
            continue
        parts = [p.strip() for p in ligne.split("|")]
        if len(parts) < 4:
            erreurs.append({"ligne": n, "motif": "4 champs séparés par | attendus : Opérateur | Catégorie | Titre | Code"})
            continue
        operateur = normaliser_operateur(parts[0])
        code = parts[3].replace(" ", "")
        if not operateur:
            erreurs.append({"ligne": n, "motif": f"Opérateur inconnu : {parts[0]} (Orange, Moov ou Telecel)"})
        elif not parts[1] or len(parts[1]) > 40 or len(parts[2]) < 2 or len(parts[2]) > 80:
            erreurs.append({"ligne": n, "motif": "Catégorie (≤ 40 caractères) ou titre (2 à 80 caractères) invalide"})
        elif not code_valide(code):
            erreurs.append({"ligne": n, "motif": f"Code invalide : {parts[3]} (il commence par * et finit par #)"})
        else:
            valides.append({"operateur": operateur, "categorie": parts[1], "titre": parts[2], "code": code,
                            "description": (parts[4] if len(parts) > 4 else "")[:200]})
    return valides, erreurs


def publier(doc: dict) -> dict:
    return {**doc, "appelable": bool(MOTIF_APPELABLE.match(doc["code"]))}


class CodeIn(BaseModel):
    operateur: str = Field(..., min_length=2, max_length=20)
    categorie: str = Field(..., min_length=2, max_length=40)
    titre: str = Field(..., min_length=2, max_length=80)
    code: str = Field(..., min_length=3, max_length=44)
    description: str = Field("", max_length=200)
    actif: bool = True


class ImportIn(BaseModel):
    texte: str = Field(..., min_length=3, max_length=60000)


def preparer(d: CodeIn) -> dict:
    operateur = normaliser_operateur(d.operateur)
    if not operateur:
        raise HTTPException(status_code=422, detail="Opérateur : Orange, Moov ou Telecel")
    code = d.code.strip().replace(" ", "")
    if not code_valide(code):
        raise HTTPException(status_code=422, detail="Un code USSD commence par * et finit par # (ex. *123#)")
    return {"operateur": operateur, "categorie": d.categorie.strip(), "titre": d.titre.strip(), "code": code,
            "description": d.description.strip(), "actif": d.actif}


@router.get("/ussd")
async def lire(_: dict = Depends(get_current_user)):
    """Carnet visible des utilisateurs : codes ACTIFS rangés par opérateur puis par catégorie."""
    lignes = await db.ussd_codes.find({"actif": True}, SANS_ID).sort("ordre", 1).to_list(MAX_CODES)
    sortie = []
    for nom in OPERATEURS:
        cats: dict[str, list] = {}
        for c in lignes:
            if c["operateur"] == nom:
                cats.setdefault(c["categorie"], []).append(publier({k: c[k] for k in ("id", "titre", "code", "description")}))
        if cats:
            sortie.append({"nom": nom, "categories": [{"nom": k, "codes": v} for k, v in cats.items()]})
    return {"operateurs": sortie}


@router.get("/admin/ussd/codes")
async def liste(_: dict = Depends(require_admin)):
    lignes = await db.ussd_codes.find({}, SANS_ID).sort("ordre", 1).to_list(MAX_CODES)
    cats = sorted({c["categorie"] for c in lignes} | set(CATEGORIES_DEFAUT))
    return {"codes": [publier(c) for c in lignes], "operateurs": OPERATEURS, "categories": cats}


async def prochain_ordre() -> int:
    return await db.ussd_codes.count_documents({})


@router.post("/admin/ussd/codes", status_code=201)
async def ajouter(d: CodeIn, _: dict = Depends(require_admin)):
    doc = preparer(d)
    if await db.ussd_codes.count_documents({}) >= MAX_CODES:
        raise HTTPException(status_code=409, detail=f"{MAX_CODES} codes au plus")
    if await db.ussd_codes.find_one({"operateur": doc["operateur"], "code": doc["code"]}):
        raise HTTPException(status_code=409, detail="Ce code existe déjà pour cet opérateur")
    doc.update({"id": str(uuid.uuid4()), "ordre": await prochain_ordre()})
    await db.ussd_codes.insert_one(doc.copy())
    return publier(doc)


@router.put("/admin/ussd/codes/{code_id}")
async def modifier(code_id: str, d: CodeIn, _: dict = Depends(require_admin)):
    doc = preparer(d)
    autre = await db.ussd_codes.find_one({"operateur": doc["operateur"], "code": doc["code"], "id": {"$ne": code_id}})
    if autre:
        raise HTTPException(status_code=409, detail="Ce code existe déjà pour cet opérateur")
    r = await db.ussd_codes.update_one({"id": code_id}, {"$set": doc})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Code introuvable")
    return {"ok": True}


@router.delete("/admin/ussd/codes/{code_id}")
async def supprimer(code_id: str, _: dict = Depends(require_admin)):
    r = await db.ussd_codes.delete_one({"id": code_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Code introuvable")
    return {"ok": True}


@router.post("/admin/ussd/importer")
async def importer(d: ImportIn, _: dict = Depends(require_admin)):
    """Import en bloc d'un texte collé (une ligne par code). Les doublons (même opérateur + même code) sont ignorés."""
    valides, erreurs = lire_lignes(d.texte)
    existants = {(c["operateur"], c["code"]) for c in await db.ussd_codes.find({}, SANS_ID).to_list(MAX_CODES)}
    ordre, ajoutes, ignores = await prochain_ordre(), 0, 0
    for v in valides:
        cle = (v["operateur"], v["code"])
        if cle in existants or ordre >= MAX_CODES:
            ignores += 1
            continue
        existants.add(cle)
        await db.ussd_codes.insert_one({**v, "id": str(uuid.uuid4()), "ordre": ordre, "actif": True})
        ordre += 1
        ajoutes += 1
    return {"ajoutes": ajoutes, "ignores": ignores, "erreurs": erreurs}
