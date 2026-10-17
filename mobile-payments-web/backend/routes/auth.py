"""Inscription, connexion (téléphone OU e-mail + mot de passe), profil."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

import journal_connexions
import reglages_securite
import signal_connexion
from db import SANS_ID, db
from securite import (create_access_token, effacer_cookie_session, effacer_echecs, get_current_user, hash_password,
                      noter_echec, poser_cookie_session, require_admin, utilisateur_public, verifier_non_bloque, verify_password)
from support_sawali import utilisateur_facultatif
from ussd import ErreurSaisie, analyser_identifiant, email_valide, normaliser_email, normaliser_telephone

router = APIRouter(prefix="/auth", tags=["Authentification"])


class Inscription(BaseModel):
    nom: str = Field(min_length=1, max_length=80)
    prenom: str = Field(min_length=1, max_length=80)
    telephone: str = Field(min_length=6, max_length=25)
    email: Optional[str] = Field(default=None, max_length=120)  # facultatif (comme l'app Android)
    mot_de_passe: str = Field(min_length=8, max_length=128)


class Connexion(BaseModel):
    identifiant: str = Field(min_length=3, max_length=120)  # téléphone ou e-mail
    mot_de_passe: str = Field(min_length=1, max_length=128)


class Profil(BaseModel):
    nom: str = Field(min_length=1, max_length=80)
    prenom: str = Field(min_length=1, max_length=80)
    telephone: str = Field(min_length=6, max_length=25)
    email: Optional[str] = Field(default=None, max_length=120)


class ChangementMotDePasse(BaseModel):
    ancien: str = Field(min_length=1, max_length=128)
    nouveau: str = Field(min_length=8, max_length=128)


def _erreur(message: str, code: int = status.HTTP_400_BAD_REQUEST):
    return HTTPException(code, message)


def _coordonnees(telephone: str, email: Optional[str]) -> tuple[str, Optional[str]]:
    """Téléphone au format international et e-mail en minuscules (ou None)."""
    try:
        tel = normaliser_telephone(telephone)
    except ErreurSaisie as exc:
        raise _erreur(str(exc)) from exc
    mail = normaliser_email(email) if email and email.strip() else None
    if mail and not email_valide(mail):
        raise _erreur("Adresse e-mail invalide")
    return tel, mail


def _signaler_connexion(request: Request, user: dict, page: str) -> None:
    """Alerte WhatsApp du propriétaire (via SAWALI) : connexion réussie, envoyée en arrière-plan.
    Ni mot de passe ni jeton dans le signal."""
    nom = f"{user.get('prenom', '')} {user.get('nom', '')}".strip()
    signal_connexion.signaler("connexion", request, utilisateur=nom or None, telephone=user.get("telephone"),
                              role=user.get("role"), page=page)


def _session(response: Response, user: dict, sid: Optional[str] = None) -> dict:
    """Pose le cookie de session et renvoie la fiche + le jeton (utile aux outils/tests). `sid` = session du journal."""
    jeton = create_access_token(user["id"], int(user.get("version_session", 0)), sid)
    poser_cookie_session(response, jeton)
    return {"user": utilisateur_public(user), "access_token": jeton}


@router.post("/inscription", status_code=status.HTTP_201_CREATED)
async def inscription(data: Inscription, request: Request, response: Response):
    tel, mail = _coordonnees(data.telephone, data.email)
    user = {
        "id": str(uuid.uuid4()), "nom": data.nom.strip(), "prenom": data.prenom.strip(), "telephone": tel,
        "email": mail, "role": "utilisateur", "password_hash": hash_password(data.mot_de_passe),
        "version_session": 0, "cree_le": datetime.now(timezone.utc).isoformat(),
    }
    if mail is None:
        user.pop("email")  # index unique partiel : un e-mail absent n'entre pas en conflit
    try:
        await db.users.insert_one(user.copy())
    except DuplicateKeyError as exc:
        raise _erreur("Ce numéro de téléphone ou cet e-mail a déjà un compte : connectez-vous",
                      status.HTTP_409_CONFLICT) from exc
    # L'inscription connecte aussitôt l'utilisateur : elle est signalée comme une connexion
    _signaler_connexion(request, user, "/inscription")
    sid = await journal_connexions.ouvrir(user["id"], signal_connexion.adresse_ip(request))
    return _session(response, user, sid)


@router.post("/connexion")
async def connexion(data: Connexion, request: Request, response: Response):
    try:
        champ, valeur = analyser_identifiant(data.identifiant)
    except ErreurSaisie as exc:
        raise _erreur(str(exc)) from exc
    cle = f"{champ}:{valeur}"
    await verifier_non_bloque(cle)
    user = await db.users.find_one({champ: valeur}, SANS_ID)
    # Compte bloqué par l'administrateur : message clair, mais seulement si le mot de passe est le bon (on ne révèle rien sinon)
    if user and user.get("desactive") and verify_password(data.mot_de_passe, user.get("password_hash", "")):
        raise _erreur("Compte bloqué par l'administrateur : contactez le support", status.HTTP_403_FORBIDDEN)
    if not user or user.get("desactive") or not verify_password(data.mot_de_passe, user.get("password_hash", "")):
        await noter_echec(cle)
        # Même message dans tous les cas : on ne révèle pas si le compte existe
        raise _erreur("Identifiant ou mot de passe incorrect", status.HTTP_401_UNAUTHORIZED)
    await effacer_echecs(cle)
    _signaler_connexion(request, user, "/connexion")
    sid = await journal_connexions.ouvrir(user["id"], signal_connexion.adresse_ip(request))
    return _session(response, user, sid)


@router.post("/deconnexion")
async def deconnexion(response: Response, user: Optional[dict] = Depends(utilisateur_facultatif)):
    if user:
        await journal_connexions.fermer(user["id"], user.get("sid"))      # date de déconnexion pour l'administrateur
    effacer_cookie_session(response)
    return {"ok": True}


@router.post("/activite")
async def activite(user: dict = Depends(get_current_user)):
    """Le site signale que l'utilisateur est ACTIF (toucher, clic, frappe) : au plus toutes les 30 s.
    Les lectures de fond du site (rappels, état de session…) ne passent jamais par ici."""
    await journal_connexions.noter_activite(user.get("sid"))
    return {"ok": True}


@router.get("/inactivite")
async def inactivite(_: dict = Depends(get_current_user)):
    """Durée d'inactivité réglée par l'administrateur et durée du compte à rebours d'avertissement (secondes)."""
    return {"secondes": await reglages_securite.secondes_inactivite(), "avertissement_secondes": reglages_securite.AVERTISSEMENT_SECONDES}


@router.get("/session")
async def etat_session(user: dict = Depends(get_current_user)):
    """Lecture de fond (toutes les quelques secondes) : une déconnexion forcée est-elle annoncée par l'administrateur ?
    Renvoie les secondes restantes avant la fermeture, sinon null. Ne compte pas comme une activité."""
    a = user.get("deconnexion_a")
    if not a:
        return {"deconnexion_dans": None}
    reste = (datetime.fromisoformat(a) - datetime.now(timezone.utc)).total_seconds()
    return {"deconnexion_dans": max(0, int(reste + 0.999))}


@router.get("/moi")
async def moi(user: dict = Depends(get_current_user)):
    return utilisateur_public(user)


@router.put("/profil")
async def modifier_profil(data: Profil, user: dict = Depends(get_current_user)):
    tel, mail = _coordonnees(data.telephone, data.email)
    maj: dict = {"$set": {"nom": data.nom.strip(), "prenom": data.prenom.strip(), "telephone": tel}}
    if mail:
        maj["$set"]["email"] = mail
    else:
        maj["$unset"] = {"email": ""}
    try:
        await db.users.update_one({"id": user["id"]}, maj)
    except DuplicateKeyError as exc:
        raise _erreur("Ce numéro ou cet e-mail est déjà utilisé par un autre compte", status.HTTP_409_CONFLICT) from exc
    return utilisateur_public(await db.users.find_one({"id": user["id"]}, SANS_ID))


class Geolocalisation(BaseModel):
    actif: bool


@router.put("/geolocalisation")
async def geolocalisation(data: Geolocalisation, user: dict = Depends(get_current_user)):
    """Chaque compte active ou désactive SA géolocalisation (suivi des paiements, marchand retrouvé à l'arrivée).
    Désactivée (réglage de départ) : aucune position n'est enregistrée ni utilisée pour ce compte."""
    await db.users.update_one({"id": user["id"]}, {"$set": {"geoloc": data.actif}})
    return utilisateur_public(await db.users.find_one({"id": user["id"]}, SANS_ID))


class ModeDemo(BaseModel):
    actif: bool


@router.put("/mode-demo")
async def mode_demo(data: ModeDemo, user: dict = Depends(require_admin)):
    """Super-administrateur : « mode démo » activé = il est soumis à l'abonnement comme n'importe quel utilisateur
    (désactivé = fonctions payantes ouvertes sans paiement, c'est le réglage normal)."""
    await db.users.update_one({"id": user["id"]}, {"$set": {"mode_demo": data.actif}})
    return utilisateur_public(await db.users.find_one({"id": user["id"]}, SANS_ID))


@router.put("/mot-de-passe")
async def changer_mot_de_passe(data: ChangementMotDePasse, response: Response, user: dict = Depends(get_current_user)):
    if not verify_password(data.ancien, user.get("password_hash", "")):
        raise _erreur("Mot de passe actuel incorrect")
    # Nouvelle version de session : les autres appareils sont déconnectés
    version = int(user.get("version_session", 0)) + 1
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "password_hash": hash_password(data.nouveau), "version_session": version}})
    return _session(response, {**user, "version_session": version})
