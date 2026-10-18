"""Abonnement (formules) et parrainage de auRor, gérés côté SAWALI (lot 37).

Demande du propriétaire (17/10/2026) : la rubrique « Abonnement » du menu affiche les formules créées dans SAWALI ; tout
paiement active la formule (30 jours par défaut, durée cumulée) ; un système de parrainage offre des jours au parrain
et au filleul.

Pour un développeur WinDev : ce fichier ne garde AUCUNE donnée d'abonnement. Il relaie, avec la requête SIGNÉE habituelle
(clé LILUVINE_WA_HMAC), les demandes de l'utilisateur connecté vers SAWALI, qui est la source unique :
la vitrine, les prix, la page de paiement PawaPay, l'activation, les jours de parrainage.

Routes (utilisateur connecté) :
    GET  /api/abonnement                        → formules, mes abonnements, mon code de parrainage
    POST /api/abonnement/acheter  {formule_id}  → {redirect_url} : page de paiement PawaPay
    GET  /api/abonnement/achat?deposit_id=…     → {statut: attente | paye | echec} (au retour du paiement)
    POST /api/abonnement/parrainage {code?}     → mon parrainage ; avec un code : l'enregistre (avant le premier abonnement)
    GET  /api/abonnement/acces?fonction=…       → {actif, expire_le, jours_restants} (ex. ocr_ordonnances)
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

import signal_connexion
from limiteur import limiter_appels_publics
from securite import get_current_user
from support_sawali import appeler_sawali

SERVICE = "Le service d'abonnement"
router = APIRouter(prefix="/abonnement", tags=["Abonnement"])


def utilisateur_sawali(user: dict) -> Dict[str, str]:
    """Identité transmise à SAWALI : numéro de compte, nom et téléphone (aucun secret) + dispense d'abonnement de l'administrateur."""
    nom = f"{user.get('prenom') or ''} {user.get('nom') or ''}".strip()
    ident = {"id": str(user.get("id", "")), "nom": nom, "telephone": user.get("telephone") or ""}
    # Super-administrateur : fonctions soumises à abonnement ouvertes sans paiement, sauf s'il a activé le « mode démo »
    if user.get("role") == "admin" and not user.get("mode_demo"):
        ident["acces_libre"] = True
    return ident


async def relayer(chemin: str, user: dict, **plus) -> Dict[str, Any]:
    return await appeler_sawali(f"/formules-plateformes/{chemin}", {"utilisateur": utilisateur_sawali(user), **plus}, service=SERVICE, delai=20)


class Achat(BaseModel):
    formule_id: str = Field(..., min_length=1, max_length=80)


class PispiDeclaration(BaseModel):
    reference: str = Field(..., min_length=4, max_length=40)
    reference_bancaire: str = Field(..., min_length=4, max_length=120)


class Parrainage(BaseModel):
    code: str = Field("", max_length=20)


@router.get("", dependencies=[Depends(limiter_appels_publics)])
async def vitrine(user: dict = Depends(get_current_user)):
    return await relayer("catalogue", user)


@router.post("/acheter", dependencies=[Depends(limiter_appels_publics)])
async def acheter(data: Achat, user: dict = Depends(get_current_user)):
    # Après le paiement, PawaPay renvoie l'utilisateur sur cette page du site (SAWALI y ajoute le numéro du paiement)
    retour = f"{signal_connexion.url_site().rstrip('/')}/abonnement"
    return await relayer("acheter", user, formule_id=data.formule_id, retour=retour)


@router.post("/pispi", dependencies=[Depends(limiter_appels_publics)])
async def payer_par_pispi(data: Achat, user: dict = Depends(get_current_user)):
    """Paiement par virement instantané PI-SPI (version manuelle, lot 48) : SAWALI renvoie la référence de la demande et le bloc
    de paiement (banque, titulaire, QR de la banque, montant, consigne). L'utilisateur paie dans l'application de sa banque."""
    return await relayer("pispi/demander", user, formule_id=data.formule_id)


@router.post("/pispi/declarer", dependencies=[Depends(limiter_appels_publics)])
async def declarer_pispi(data: PispiDeclaration, user: dict = Depends(get_current_user)):
    """L'utilisateur a payé et donne la référence bancaire : l'administrateur la vérifie puis confirme chez SAWALI (la formule s'active)."""
    return await relayer("pispi/declarer", user, reference=data.reference.strip(), reference_bancaire=data.reference_bancaire.strip())


@router.get("/achat", dependencies=[Depends(limiter_appels_publics)])
async def achat(deposit_id: str = Query(..., min_length=8, max_length=80), user: dict = Depends(get_current_user)):
    return await relayer("achat", user, deposit_id=deposit_id)


@router.post("/parrainage", dependencies=[Depends(limiter_appels_publics)])
async def parrainage(data: Parrainage, user: dict = Depends(get_current_user)):
    return await relayer("parrainage", user, code=data.code.strip())


@router.get("/acces", dependencies=[Depends(limiter_appels_publics)])
async def acces(fonction: str = Query(..., min_length=1, max_length=40), user: dict = Depends(get_current_user)):
    return await relayer("acces", user, fonction=fonction)
