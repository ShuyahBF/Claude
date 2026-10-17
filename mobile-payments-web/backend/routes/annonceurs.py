"""Espace annonceur de Paiement Mobile (lot 60) : un abonné passe une annonce, voit son devis en direct, paie et suit ses statistiques.

Demande du propriétaire (17/10/2026) : « Un abonné peut devenir annonceur. Il choisit sa formule parmi les paramètres de SAWALI,
envoie ses images ou vidéo (taille raisonnable, médias cryptés) et paie. Un calculateur affiche son devis en temps réel. Seul SAWALI
peut corriger les montants. Il reçoit son devis, paie et suit ses statistiques. »

Pour un développeur WinDev : ce fichier ne calcule JAMAIS un prix et ne garde AUCUN média. Il relaie, avec la requête SIGNÉE
habituelle, les demandes de l'utilisateur connecté vers SAWALI (lot 235), qui calcule le devis à partir de SES tarifs, chiffre le
média, encaisse (PawaPay ou PI-SPI) et publie l'annonce dans la régie. Le navigateur ne peut donc pas modifier un montant.

Routes (utilisateur connecté) :
    GET  /api/annonceur/tarifs              → formats, options, remises, limites des médias, « est_abonne »
    POST /api/annonceur/devis               {format, debut, fin, options}  → devis calculé en direct
    POST /api/annonceur/creer               {nom, annonceur, format, debut, fin, options, lien, media}  → campagne + devis
    GET  /api/annonceur/campagnes           → mes campagnes
    POST /api/annonceur/payer               {campagne_id, mode: pawapay | pispi} → page PawaPay ou bloc PI-SPI
    POST /api/annonceur/declarer            {campagne_id, reference_bancaire}   → PI-SPI : référence déclarée
    POST /api/annonceur/etat                {campagne_id}                       → état (relit le paiement)
    POST /api/annonceur/stats               {campagne_id}                       → impressions, clics, taux de clic, jour par jour
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

import signal_connexion
from limiteur import limiter_appels_publics
from routes.abonnement import utilisateur_sawali
from securite import get_current_user
from support_sawali import appeler_sawali

SERVICE = "Le service des annonceurs"
DELAI_MEDIA = 90.0        # l'envoi d'une vidéo chiffrée peut durer plusieurs secondes
router = APIRouter(prefix="/annonceur", tags=["Annonceur"])


async def relayer(chemin: str, user: dict, delai: float = 25.0, **plus) -> Dict[str, Any]:
    """Relais signé vers SAWALI avec l'identité du compte (numéro, nom, téléphone, dispense du super-administrateur)."""
    return await appeler_sawali(f"/annonceurs-plateformes/{chemin}", {"utilisateur": utilisateur_sawali(user), **plus}, service=SERVICE, delai=delai)


class Periode(BaseModel):
    format: str = Field(..., max_length=30)
    debut: str = Field(..., max_length=10)
    fin: str = Field(..., max_length=10)
    options: List[str] = Field(default_factory=list, max_length=10)


class Creation(Periode):
    nom: str = Field(..., min_length=2, max_length=80)
    annonceur: str = Field(..., min_length=2, max_length=80)
    lien: str = Field(..., min_length=8, max_length=500)
    media: str = Field(..., min_length=100, max_length=17_000_000)    # data URL base64 (image réduite par le site, ou vidéo MP4/WebM)


class Campagne(BaseModel):
    campagne_id: str = Field(..., min_length=8, max_length=80)


class Paiement(Campagne):
    mode: str = Field(..., pattern="^(pawapay|pispi)$")


class Declaration(Campagne):
    reference_bancaire: str = Field(..., min_length=4, max_length=120)


@router.get("/tarifs", dependencies=[Depends(limiter_appels_publics)])
async def tarifs(user: dict = Depends(get_current_user)):
    return await relayer("tarifs", user)


@router.post("/devis", dependencies=[Depends(limiter_appels_publics)])
async def devis(data: Periode, user: dict = Depends(get_current_user)):
    return await relayer("devis", user, **data.model_dump())


@router.post("/creer", dependencies=[Depends(limiter_appels_publics)])
async def creer(data: Creation, user: dict = Depends(get_current_user)):
    return await relayer("creer", user, delai=DELAI_MEDIA, **data.model_dump())


@router.get("/campagnes", dependencies=[Depends(limiter_appels_publics)])
async def campagnes(user: dict = Depends(get_current_user)):
    return await relayer("campagnes", user)


@router.post("/payer", dependencies=[Depends(limiter_appels_publics)])
async def payer(data: Paiement, user: dict = Depends(get_current_user)):
    # Après la page PawaPay, l'utilisateur revient sur son espace annonceur
    retour = f"{signal_connexion.url_site().rstrip('/')}/annonceur?campagne={data.campagne_id}"
    return await relayer("payer", user, campagne_id=data.campagne_id, mode=data.mode, retour=retour)


@router.post("/declarer", dependencies=[Depends(limiter_appels_publics)])
async def declarer(data: Declaration, user: dict = Depends(get_current_user)):
    return await relayer("declarer", user, campagne_id=data.campagne_id, reference_bancaire=data.reference_bancaire.strip())


@router.post("/etat", dependencies=[Depends(limiter_appels_publics)])
async def etat(data: Campagne, user: dict = Depends(get_current_user)):
    return await relayer("etat", user, campagne_id=data.campagne_id)


@router.post("/stats", dependencies=[Depends(limiter_appels_publics)])
async def stats(data: Campagne, user: dict = Depends(get_current_user)):
    return await relayer("stats", user, campagne_id=data.campagne_id)
