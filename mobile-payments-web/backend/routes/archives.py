"""Archives de documents importants dans auRor (lot 56) : reçus, factures, pièces d'identité, TVM, carte grise…

Pour un développeur WinDev :
  - Lot 92 : TOUS les documents sont gardés EN LIGNE (chiffrés) : un espace gratuit est offert à chacun (réglé dans SAWALI), l'abonnement
    « Archives en ligne chiffrées » donne plus d'espace. Le navigateur ne garde plus qu'une copie de confort : jamais la seule.
  - Le site chiffre chaque document et ses informations.
    Le SITE chiffre chaque document et ses informations (AES-256-GCM, clé dérivée d'une phrase secrète que ni ce serveur ni SAWALI ne connaissent).
    Ce serveur ne fait que RELAYER des octets illisibles vers SAWALI (qui les garde dans Cloudflare R2) : il ne peut pas les lire.
  - SAWALI est la source unique de l'abonnement et de l'espace (rien n'est stocké ici).

Routes (utilisateur connecté) :
    GET    /api/archives/etat    → {abonne, sel, verif, quota_octets, utilise_octets, nombre, fichier_max_octets}
    POST   /api/archives/cle     → {sel, verif, enveloppe?, secours?}  (première activation : sel public, jeton de contrôle et clé chiffrée ; jamais la phrase)
    POST   /api/archives/cle/enveloppes → {verif_actuelle, enveloppe, secours?}  (nouvelle phrase ou mise à niveau de la clé)
    GET    /api/archives         → {archives: [{id, meta, taille, cree_le}]}   (informations chiffrées)
    POST   /api/archives         → {meta, contenu}  (abonnement requis ; 402 avec le prix de la formule sinon)
    GET    /api/archives/{id}    → {id, meta, contenu}
    PUT    /api/archives/{id}    → {meta}  (nouvelles informations chiffrées)
    DELETE /api/archives/{id}
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field

from limiteur import limiter_appels_publics
from routes.abonnement import utilisateur_sawali
from securite import get_current_user
from support_sawali import appeler_sawali

# Pas de limiteur par minute sur les écritures : connexion obligatoire, taille, espace et abonnement sont déjà contrôlés par SAWALI
SERVICE = "Le service d'archives"
router = APIRouter(prefix="/archives", tags=["Archives"])


async def _relayer(action: str, user: dict, delai: float = 30, **plus) -> Dict[str, Any]:
    return await appeler_sawali(f"/formules-plateformes/archives/{action}", {"utilisateur": utilisateur_sawali(user), **plus}, service=SERVICE, delai=delai)


class Cle(BaseModel):
    sel: str = Field(..., min_length=16, max_length=64)
    verif: str = Field(..., min_length=16, max_length=600)
    # Lot 92 : la clé des documents chiffrée par la phrase (enveloppe) et par le code de secours (secours) : octets illisibles ici
    enveloppe: str | None = Field(None, min_length=16, max_length=800)
    secours: str | None = Field(None, min_length=16, max_length=800)


class Enveloppes(BaseModel):
    """Lot 92 : nouvelle enveloppe (nouvelle phrase choisie avec le code de secours, ou mise à niveau d'une ancienne clé)."""
    verif_actuelle: str = Field(..., min_length=16, max_length=600)
    enveloppe: str = Field(..., min_length=16, max_length=800)
    secours: str | None = Field(None, min_length=16, max_length=800)


class Ajout(BaseModel):
    meta: str = Field(..., min_length=16, max_length=6000)
    contenu: str = Field(..., min_length=40, max_length=12_000_000)


@router.get("/etat", dependencies=[Depends(limiter_appels_publics)])
async def etat(user: dict = Depends(get_current_user)):
    return await _relayer("etat", user)


@router.post("/cle")
async def enregistrer_cle(data: Cle, user: dict = Depends(get_current_user)):
    plus = {k: v for k, v in (("enveloppe", data.enveloppe), ("secours", data.secours)) if v}
    return await _relayer("cle", user, sel=data.sel, verif=data.verif, **plus)


@router.post("/cle/enveloppes")
async def remplacer_enveloppes(data: Enveloppes, user: dict = Depends(get_current_user)):
    """Lot 92 : remplace l'enveloppe de la clé (et le secours). Les documents ne changent pas ; SAWALI exige le jeton de contrôle actuel."""
    plus = {"secours": data.secours} if data.secours else {}
    return await _relayer("enveloppes", user, verif_actuelle=data.verif_actuelle, enveloppe=data.enveloppe, **plus)


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def lister(user: dict = Depends(get_current_user)):
    return await _relayer("liste", user)


@router.post("")
async def ajouter(data: Ajout, user: dict = Depends(get_current_user)):
    return await _relayer("ajouter", user, delai=90, meta=data.meta, contenu=data.contenu)


@router.get("/{archive_id}", dependencies=[Depends(limiter_appels_publics)])
async def telecharger(archive_id: str = Path(..., min_length=8, max_length=64), user: dict = Depends(get_current_user)):
    return await _relayer("telecharger", user, delai=90, id=archive_id)


class Modification(BaseModel):
    meta: str = Field(..., min_length=16, max_length=6000)


@router.put("/{archive_id}")
async def modifier(data: Modification, archive_id: str = Path(..., min_length=8, max_length=64), user: dict = Depends(get_current_user)):
    """Remplace les informations CHIFFRÉES du document (titre, catégorie, étiquettes) ; le document lui-même n'est pas renvoyé."""
    return await _relayer("modifier", user, id=archive_id, meta=data.meta)


@router.delete("/{archive_id}")
async def supprimer(archive_id: str = Path(..., min_length=8, max_length=64), user: dict = Depends(get_current_user)):
    return await _relayer("supprimer", user, id=archive_id)
