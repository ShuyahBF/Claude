"""Archives de documents importants dans auRor (lot 56) : reçus, factures, pièces d'identité, TVM, carte grise…

Pour un développeur WinDev :
  - SANS abonnement, tout reste sur l'appareil de l'utilisateur (le site garde les documents dans la mémoire privée du navigateur) :
    CE SERVEUR ne reçoit alors rien ;
  - AVEC l'abonnement « Archives en ligne chiffrées » (fonction vendue par SAWALI), l'utilisateur peut aussi garder des documents en ligne.
    Le SITE chiffre chaque document et ses informations (AES-256-GCM, clé dérivée d'une phrase secrète que ni ce serveur ni SAWALI ne connaissent).
    Ce serveur ne fait que RELAYER des octets illisibles vers SAWALI (qui les garde dans Cloudflare R2) : il ne peut pas les lire.
  - SAWALI est la source unique de l'abonnement et de l'espace (rien n'est stocké ici).

Routes (utilisateur connecté) :
    GET    /api/archives/etat    → {abonne, sel, verif, quota_octets, utilise_octets, nombre, fichier_max_octets}
    POST   /api/archives/cle     → {sel, verif}  (première activation : sel public et jeton de contrôle, jamais la phrase)
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


class Ajout(BaseModel):
    meta: str = Field(..., min_length=16, max_length=6000)
    contenu: str = Field(..., min_length=40, max_length=12_000_000)


@router.get("/etat", dependencies=[Depends(limiter_appels_publics)])
async def etat(user: dict = Depends(get_current_user)):
    return await _relayer("etat", user)


@router.post("/cle")
async def enregistrer_cle(data: Cle, user: dict = Depends(get_current_user)):
    return await _relayer("cle", user, sel=data.sel, verif=data.verif)


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
