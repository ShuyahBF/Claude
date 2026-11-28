"""CLIENTS (locataires : Alpha, Beta…) et leurs CLÉS HMAC SAWALI — réservé au super-administrateur.

Chaque client a son émetteur SAWALI (X-Emetteur) et sa clé HMAC : créée avec le client, visible UNE seule
fois, remplaçable par rotation. Les données de chaque client sont isolées (toutes les collections portent client_id).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import hmac_sawali
from db import SANS_ID, db
from outils import exiger, maintenant, nouvel_id, slug
from securite import hacher_mot_de_passe

router = APIRouter(prefix="/clients", tags=["clients"], dependencies=[Depends(exiger())])  # exiger() = super_admin seul


class NouveauClient(BaseModel):
    nom: str = Field(min_length=2, max_length=80)
    code: Optional[str] = None            # « alpha » ; déduit du nom si absent
    emetteur: Optional[str] = None        # émetteur SAWALI ; « gemao-<code> » si absent
    admin_nom: str
    admin_email: str
    admin_mot_de_passe: str = Field(min_length=8)
    admin_telephone: Optional[str] = None


class ModifClient(BaseModel):
    nom: Optional[str] = None
    actif: Optional[bool] = None
    wa_actif: Optional[bool] = None
    emetteur: Optional[str] = None


def vue(c: dict) -> dict:
    """Client SANS la clé (ni chiffrée) : seulement l'empreinte pour la reconnaître."""
    return {k: c.get(k) for k in ("id", "nom", "code", "emetteur", "actif", "wa_actif", "cle_hmac_empreinte", "cree_le")}


@router.get("")
async def lister():
    return [vue(c) async for c in db.clients.find({}, SANS_ID).sort("nom", 1)]


@router.post("", status_code=201)
async def creer(n: NouveauClient):
    code = slug(n.code or n.nom)
    if not code:
        raise HTTPException(400, "Code client invalide.")
    if await db.clients.find_one({"code": code}):
        raise HTTPException(409, "Ce code client existe déjà.")
    if await db.users.find_one({"email": n.admin_email.strip().lower()}):
        raise HTTPException(409, "Cet e-mail est déjà utilisé.")
    cle = hmac_sawali.generer_cle()
    client = {"id": nouvel_id(), "nom": n.nom.strip(), "code": code, "emetteur": (n.emetteur or f"gemao-{code}"),
              "actif": True, "wa_actif": True, "cree_le": maintenant(), **hmac_sawali.champs_cle(cle)}
    await db.clients.insert_one(dict(client))
    await db.users.insert_one({"id": nouvel_id(), "client_id": client["id"], "nom": n.admin_nom.strip(),
                               "email": n.admin_email.strip().lower(), "telephone": n.admin_telephone, "role": "admin",
                               "mdp": hacher_mot_de_passe(n.admin_mot_de_passe), "actif": True, "cree_le": maintenant()})
    # La clé en clair n'apparaît QUE dans cette réponse
    return {**vue(client), "cle_hmac": cle,
            "avertissement": "Notez cette clé maintenant : elle ne sera plus jamais affichée. Saisissez-la dans SAWALI (émetteur ci-dessus)."}


@router.patch("/{cid}")
async def modifier(cid: str, m: ModifClient):
    champs = {k: v for k, v in m.model_dump().items() if v is not None}
    if not champs:
        raise HTTPException(400, "Rien à modifier.")
    r = await db.clients.find_one_and_update({"id": cid}, {"$set": champs}, projection=SANS_ID, return_document=True)
    if not r:
        raise HTTPException(404, "Client introuvable.")
    return vue(r)


@router.post("/{cid}/rotation-cle")
async def rotation(cid: str):
    """Remplace la clé HMAC (ancienne invalidée aussitôt). La nouvelle est montrée une seule fois."""
    cle = hmac_sawali.generer_cle()
    r = await db.clients.find_one_and_update({"id": cid}, {"$set": hmac_sawali.champs_cle(cle)},
                                             projection=SANS_ID, return_document=True)
    if not r:
        raise HTTPException(404, "Client introuvable.")
    return {**vue(r), "cle_hmac": cle, "avertissement": "Ancienne clé invalidée. Mettez à jour SAWALI avec cette nouvelle clé."}
