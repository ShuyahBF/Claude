"""Connexion par compte Google (lot 222) : démarrer, retour de Google, échange du code, liaison / déliaison depuis le profil.
Voir google_auth.py pour le déroulé et les règles de sécurité. Inactif tant que GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET ne sont pas saisis dans Render."""
from __future__ import annotations

import time
from html import escape
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

import google_auth
import journal_connexions
import signal_connexion
from config import get_settings
from db import SANS_ID, db
from routes.auth import _session
from securite import get_current_user, verifier_non_bloque, noter_echec, effacer_echecs, verify_password

router = APIRouter(prefix="/auth/google", tags=["Google"])
SCHEMA_APP = "auror"        # adresse « auror://google?… » captée par l'application Android


def _configure() -> bool:
    s = get_settings()
    return bool(s.google_client_id and s.google_client_secret)


def _redirect_uri(request: Request) -> str:
    """Adresse de retour déclarée chez Google (réglage GOOGLE_REDIRECT_URI, sinon déduite de la requête, en https hors poste local)."""
    s = get_settings()
    if s.google_redirect_uri:
        return s.google_redirect_uri
    base = str(request.base_url).rstrip("/")
    if not base.startswith("http://localhost") and base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return f"{base}/api/auth/google/retour"


def _vers_site(cible: str, **params) -> Response:
    """Renvoie la personne au site (web) ou à l'application (page avec bouton « Retourner dans l'application », car le navigateur peut bloquer une redirection directe)."""
    params = {k: v for k, v in params.items() if v}
    if cible == "app":
        lien = f"{SCHEMA_APP}://google?{urlencode(params)}"
        page = (f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>auRor</title>"
                f"<body style='font-family:sans-serif;text-align:center;padding:2rem'><p>Retour dans l'application auRor…</p>"
                f"<p><a href=\"{escape(lien)}\" style='display:inline-block;padding:1rem 2rem;background:#4926d7;color:#fff;border-radius:2rem;text-decoration:none'>Retourner dans l'application</a></p>"
                f"<script>location.href={lien!r}</script></body>")
        return HTMLResponse(page)
    origine = get_settings().frontend_origins[0]
    return RedirectResponse(f"{origine}/connexion-google?{urlencode(params)}", status_code=302)


@router.get("/config")
async def config():
    """Le site n'affiche le bouton Google que si le serveur est configuré."""
    return {"disponible": _configure()}


@router.get("/demarrer")
async def demarrer(request: Request, cible: str = "web"):
    if not _configure():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "La connexion par Google n'est pas encore activée")
    s = get_settings()
    etat = google_auth.signer_etat(cible, None, s.jwt_secret)
    return RedirectResponse(google_auth.url_demarrage(s.google_client_id, _redirect_uri(request), etat), status_code=302)


class DemandeLiaison(BaseModel):
    cible: str = Field("web", max_length=3)


@router.post("/lier-url")
async def lier_url(data: DemandeLiaison, request: Request, user: dict = Depends(get_current_user)):
    """Adresse de Google pour LIER le compte connecté (l'identité du compte est dans l'état signé)."""
    if not _configure():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "La connexion par Google n'est pas encore activée")
    s = get_settings()
    etat = google_auth.signer_etat(data.cible, user["id"], s.jwt_secret)
    return {"url": google_auth.url_demarrage(s.google_client_id, _redirect_uri(request), etat)}


@router.get("/retour")
async def retour(request: Request, code: str = "", state: str = "", error: str = ""):
    s = get_settings()
    etat = google_auth.lire_etat(state, s.jwt_secret)
    if not etat:
        return _vers_site("web", erreur="etat")                       # état faux ou périmé : on ne sait même pas où renvoyer (web par défaut)
    cible = etat.get("c", "web")
    if error or not code or not _configure():
        return _vers_site(cible, erreur="refuse")
    # Échange du code contre l'identité (appel externe lent : seulement ici, jamais dans une page d'affichage)
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            rep = await http.post(google_auth.URL_JETON, data={"code": code, "client_id": s.google_client_id, "client_secret": s.google_client_secret,
                                                               "redirect_uri": _redirect_uri(request), "grant_type": "authorization_code"})
        identite = google_auth.identite_depuis_jeton(rep.json().get("id_token", ""), s.google_client_id) if rep.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        identite = None
    if not identite:
        return _vers_site(cible, erreur="google")
    existant = await db.users.find_one({"google.sub": identite["sub"]}, SANS_ID)
    # --- Liaison : le compte connecté (dans l'état signé) reçoit cette identité Google
    if etat.get("l"):
        if existant and existant["id"] != etat["l"]:
            return _vers_site(cible, erreur="deja_lie")               # cette identité Google est déjà liée à un AUTRE compte
        await db.users.update_one({"id": etat["l"]}, {"$set": {"google": {"sub": identite["sub"], "email": identite["email"], "lie_le": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}}})
        return _vers_site(cible, lie="1")
    # --- Connexion : seulement un compte DÉJÀ lié (jamais de création ni de rapprochement par e-mail)
    if not existant:
        return _vers_site(cible, erreur="aucun_compte")
    if existant.get("desactive"):
        return _vers_site(cible, erreur="bloque")
    clair, empreinte = google_auth.nouveau_code()
    await db.google_codes.insert_one({"empreinte": empreinte, "user_id": existant["id"], "expire": time.time() + google_auth.VALIDITE_CODE_S})
    return _vers_site(cible, code=clair)


class Echange(BaseModel):
    code: str = Field(min_length=10, max_length=100)


@router.post("/echange")
async def echange(data: Echange, request: Request, response: Response):
    """Le site remet le code à usage unique et reçoit la session. Le code est consommé tout de suite (une seule utilisation)."""
    cle = f"google:{request.client.host if request.client else ''}"
    await verifier_non_bloque(cle)
    ligne = await db.google_codes.find_one_and_delete({"empreinte": google_auth.empreinte_code(data.code)})
    if not ligne or ligne.get("expire", 0) < time.time():
        await noter_echec(cle)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion Google expirée : recommencez")
    user = await db.users.find_one({"id": ligne["user_id"]}, SANS_ID)
    if not user or user.get("desactive"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte indisponible")
    await effacer_echecs(cle)
    signal_connexion.signaler("connexion", request, utilisateur=f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or None,
                              telephone=user.get("telephone"), role=user.get("role"), page="/connexion-google")
    sid = await journal_connexions.ouvrir(user["id"], signal_connexion.adresse_ip(request))
    return _session(response, user, sid)


@router.get("/etat")
async def etat(user: dict = Depends(get_current_user)):
    fiche = await db.users.find_one({"id": user["id"]}, SANS_ID) or {}
    g = fiche.get("google") or {}
    return {"disponible": _configure(), "lie": bool(g.get("sub")), "email": g.get("email", ""), "lie_le": g.get("lie_le", "")}


class Deliaison(BaseModel):
    mot_de_passe: str = Field(min_length=1, max_length=128)


@router.post("/delier")
async def delier(data: Deliaison, user: dict = Depends(get_current_user)):
    """Retire la liaison : le mot de passe est redemandé (on prouve qu'on est le titulaire)."""
    cle = f"google-delier:{user['id']}"
    await verifier_non_bloque(cle)
    fiche = await db.users.find_one({"id": user["id"]}, SANS_ID) or {}
    if not verify_password(data.mot_de_passe, fiche.get("password_hash", "")):
        await noter_echec(cle)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Mot de passe incorrect")
    await effacer_echecs(cle)
    await db.users.update_one({"id": user["id"]}, {"$unset": {"google": ""}})
    return {"ok": True}
