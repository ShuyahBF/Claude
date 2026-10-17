"""Support SAWALI sur la page de connexion et dans le portail de Paiement Mobile (lot 24).

Demande du propriétaire (17/10/2026) : une icône d'assistance en bas à droite de la
fenêtre de connexion ouvre une discussion avec le support SAWALI. Côté SAWALI, les
messages arrivent dans le chat de l'équipe avec un numéro de requête (SUP-…).

En résumé (pour un développeur WinDev) :
  - le NAVIGATEUR ne parle jamais directement à SAWALI : il appelle CE serveur, qui
    relaie une requête SIGNÉE (même clé LILUVINE_WA_HMAC et même signature HMAC que
    le signal de connexion : en-têtes X-Emetteur, X-Timestamp, X-Signature) ;
  - la route est PUBLIQUE (un visiteur qui n'arrive pas à se connecter doit pouvoir
    écrire) : l'identité envoyée est celle du compte connecté s'il y en a un, sinon
    celle d'un VISITEUR (identifiant aléatoire tiré par le navigateur + nom et contact
    saisis dans la fenêtre) ;
  - textes seuls (pas de fichier ni de note vocale pour un visiteur anonyme) ;
  - limitation par adresse IP ; aucun secret n'est renvoyé au navigateur ni journalisé.

Routes :
    GET  /api/support-sawali/etat      → l'icône est-elle affichée ? (clé présente)
    POST /api/support-sawali/messages  {visiteur, nom, contact, texte}
    POST /api/support-sawali/fil       {visiteur, depuis, marquer_lu}
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

import signal_connexion
from config import get_settings
from db import SANS_ID, db
from limiteur import Limiteur
from securite import decode_access_token
from ussd import ErreurSaisie, normaliser_telephone

DELAI_SECONDES = 15   # délai maximal d'un appel à SAWALI
# Au plus 120 appels par minute et par adresse IP (la fenêtre ouverte relit le fil toutes les 5 s)
limiteur_support = Limiteur(120)

# Transport HTTP de remplacement (tests) : None en production
_transport: Optional[httpx.AsyncBaseTransport] = None

router = APIRouter(prefix="/support-sawali", tags=["Support SAWALI"])


async def limiter(request: Request) -> None:
    """Dépendance : refuse (429) au-delà de la limite par minute et par IP."""
    if not limiteur_support.autoriser(signal_connexion.adresse_ip(request) or "inconnue"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Trop de requêtes : réessayez dans une minute")


async def appeler_sawali(chemin: str, corps: Dict[str, Any], service: str = "Support SAWALI", delai: float = DELAI_SECONDES) -> Dict[str, Any]:
    """POST signé vers SAWALI ; renvoie le JSON ou lève une HTTPException lisible (`service` : nom cité dans les messages)."""
    if not signal_connexion.configure():
        raise HTTPException(503, f"{service} non configuré sur cette plateforme")
    s = get_settings()
    # Corps sérialisé UNE SEULE FOIS : ce sont exactement ces octets qui sont signés et envoyés
    brut = json.dumps(corps, ensure_ascii=False)
    ts = str(int(time.time()))
    entetes = {"Content-Type": "application/json", "X-Emetteur": s.liluvine_wa_emetteur or "paiementmobile",
               "X-Timestamp": ts, "X-Signature": signal_connexion.signer(signal_connexion.cle(), ts, brut)}
    try:
        async with httpx.AsyncClient(timeout=delai, transport=_transport) as client:
            r = await client.post(f"{s.sawali_url.rstrip('/')}/api{chemin}", content=brut.encode("utf-8"), headers=entetes)
    except httpx.HTTPError:
        raise HTTPException(503, f"{service} injoignable : réessayez dans un instant")
    # 403 chez SAWALI : la plateforme n'est pas (encore) autorisée à utiliser le support
    if r.status_code == 403:
        raise HTTPException(503, f"{service} pas encore activé pour cette plateforme")
    if r.status_code in (404, 409, 422):
        # Refus « métier » de SAWALI (code de parrainage inconnu, déjà utilisé…) : son message est transmis tel quel
        try:
            detail = r.json().get("detail")
        except ValueError:
            detail = None
        raise HTTPException(r.status_code, detail if isinstance(detail, str) else "Demande refusée")
    if r.status_code >= 400:
        raise HTTPException(502, f"{service} a refusé la demande")
    try:
        return r.json()
    except ValueError:
        raise HTTPException(502, f"Réponse illisible de {service}")


async def utilisateur_facultatif(request: Request) -> Optional[dict]:
    """Compte connecté (cookie de session) ou None pour un visiteur. Ne lève jamais d'erreur."""
    jeton = request.cookies.get(get_settings().session_cookie_nom)
    entete = request.headers.get("authorization", "")
    if not jeton and entete.lower().startswith("bearer "):   # même règle que securite.get_current_user (tests, outils)
        jeton = entete[7:].strip()
    donnees = decode_access_token(jeton) if jeton else None
    if not donnees:
        return None
    user = await db.users.find_one({"id": donnees.get("sub")}, SANS_ID)
    if not user or user.get("desactive") or int(user.get("version_session", 0)) != int(donnees.get("v", 0)):
        return None
    return user


def identite(user: Optional[dict], visiteur: str, nom: str = "", contact: str = "") -> Dict[str, str]:
    """{id, nom, role, contexte, email, telephone} — aucun secret.
    Compte connecté : ses coordonnées ; sinon : le visiteur (id aléatoire du navigateur)."""
    if user:
        return {"id": str(user.get("id", "")), "nom": f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or user.get("email") or "",
                "role": user.get("role") or "", "contexte": "Paiement Mobile",
                "email": user.get("email") or "", "telephone": user.get("telephone") or ""}
    # Visiteur : téléphone normalisé au format international « +22670000000 » (règle du Burkina Faso, voir ussd.py)
    return {"id": f"visiteur-{visiteur}", "nom": nom.strip() or "Visiteur", "role": "visiteur",
            "contexte": "Paiement Mobile (page de connexion)", "email": "", "telephone": contact.strip()}


class Identifiant(BaseModel):
    # Identifiant aléatoire tiré par le navigateur (localStorage) : aucune donnée personnelle
    visiteur: str = Field(..., min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class MessageEntree(Identifiant):
    texte: str = Field(..., min_length=1, max_length=2000)
    nom: str = Field("", max_length=80)
    contact: str = Field("", max_length=30)   # téléphone du visiteur (obligatoire hors connexion) : le support lui répond


class FilEntree(Identifiant):
    depuis: Optional[str] = Field(None, max_length=40)
    marquer_lu: bool = True   # faux : simple vérification des non-lus (fenêtre fermée)


@router.get("/etat", dependencies=[Depends(limiter)])
async def etat():
    """L'icône n'est affichée que si la plateforme est reliée à SAWALI."""
    return {"actif": signal_connexion.configure()}


@router.post("/messages", dependencies=[Depends(limiter)])
async def envoyer(entree: MessageEntree, user: Optional[dict] = Depends(utilisateur_facultatif)):
    """Message de l'utilisateur ou du visiteur vers le support SAWALI."""
    texte = entree.texte.strip()
    if not texte:
        raise HTTPException(422, "Message vide")
    contact = ""
    if not user:
        # Visiteur : numéro obligatoire (8 chiffres au Burkina Faso, indicatif +226 ajouté ; « + » ou « 00 » pour l'étranger)
        try:
            contact = normaliser_telephone(entree.contact)
        except ErreurSaisie:
            raise HTTPException(422, "Numéro de téléphone invalide : 8 chiffres au Burkina Faso (ex. 70 00 00 00)")
    return await appeler_sawali("/support-plateforme/messages",
                                {"utilisateur": identite(user, entree.visiteur, entree.nom, contact), "texte": texte})


@router.post("/fil", dependencies=[Depends(limiter)])
async def fil(entree: FilEntree, user: Optional[dict] = Depends(utilisateur_facultatif)):
    """Messages et réponses du support (depuis une date) et état de la requête."""
    corps: Dict[str, Any] = {"utilisateur": identite(user, entree.visiteur), "marquer_lu": entree.marquer_lu}
    if entree.depuis:
        corps["depuis"] = entree.depuis
    return await appeler_sawali("/support-plateforme/fil", corps)
