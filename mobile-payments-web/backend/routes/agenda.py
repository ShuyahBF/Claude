"""Agenda Google dans auRor (lot 140) : l'utilisateur lie SON agenda, voit ses rendez-vous et en crée, y compris par note vocale.

Pour un développeur WinDev : ce fichier ne parle JAMAIS à Google. Il relaie vers la passerelle « Agenda » de SAWALI avec la requête
SIGNÉE habituelle (X-Emetteur / X-Timestamp / X-Signature). L'identité de l'utilisateur envoyée à SAWALI est TOUJOURS celle du compte
connecté (jamais une valeur donnée par le navigateur) : un utilisateur ne peut donc atteindre que son propre agenda. Aucun jeton Google ne
passe par auRor ; rien n'est conservé ici.

Routes (utilisateur connecté) :
    POST /api/agenda/etat        → {lie, email}
    POST /api/agenda/demander    {gmail}                          → {etat} demande d'accès avec SON compte Google (l'administrateur de SAWALI l'accepte)
    POST /api/agenda/lier        → {url} à ouvrir dans le navigateur (consentement Google, une seule fois)
    POST /api/agenda/delier      → retire la liaison
    POST /api/agenda/evenements  {du?, au?}                       → {evenements: [...]}
    POST /api/agenda/analyser    {texte}                          → proposition {titre, debut, fin, libelle, manque}  (ne crée rien)
    POST /api/agenda/creer       {titre, debut, fin?, lieu?, rappel_minutes?}   (après confirmation à l'écran)
    POST /api/agenda/supprimer   {id}
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import field_validator, BaseModel, Field

from limiteur import limiter_appels_publics
from securite import get_current_user
from support_sawali import appeler_sawali

SERVICE = "L'agenda Google"
router = APIRouter(prefix="/agenda", tags=["Agenda Google"], dependencies=[Depends(limiter_appels_publics)])


async def _relayer(chemin: str, user: dict, corps: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Appel signé vers SAWALI ; « utilisateur » vient du COMPTE CONNECTÉ et écrase toute valeur du corps."""
    donnees = {**(corps or {}), "utilisateur": str(user.get("id", ""))}
    return await appeler_sawali(f"/webhook/agenda/{chemin}", donnees, service=SERVICE, delai=30)


class Periode(BaseModel):
    du: Optional[str] = Field(None, max_length=10)       # AAAA-MM-JJ
    au: Optional[str] = Field(None, max_length=10)


class Note(BaseModel):
    texte: str = Field(min_length=1, max_length=500)


class Rdv(BaseModel):
    titre: str = Field(min_length=1, max_length=1000)    # un titre dicté trop long est TRONQUÉ à 200 (validateur ci-dessous), jamais refusé
    debut: str = Field(min_length=10, max_length=64)     # ISO avec fuseau
    fin: Optional[str] = Field(None, max_length=64)
    lieu: Optional[str] = Field(None, max_length=1000)
    rappel_minutes: Optional[int] = Field(None, ge=0, le=40320)

    @field_validator("titre", "lieu", mode="after")
    @classmethod
    def _couper(cls, v):
        """Texte nettoyé puis limité à 200 caractères (limite de SAWALI / Google)."""
        return v.strip()[:200] if isinstance(v, str) else v


class Modif(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    titre: Optional[str] = Field(None, min_length=1, max_length=200)
    debut: Optional[str] = Field(None, min_length=10, max_length=40)
    fin: Optional[str] = Field(None, max_length=40)


class Demande(BaseModel):
    gmail: str = Field(min_length=5, max_length=120)


class Identifiant(BaseModel):
    id: str = Field(min_length=1, max_length=200)


@router.post("/etat")
async def etat(user: dict = Depends(get_current_user)):
    return await _relayer("etat", user)


@router.post("/demander")
async def demander(data: Demande, user: dict = Depends(get_current_user)):
    nom = f"{user.get('nom') or ''} {user.get('prenom') or ''}".strip()
    return await _relayer("demander", user, {"gmail": data.gmail.strip(), "nom": nom})


@router.post("/lier")
async def lier(user: dict = Depends(get_current_user)):
    return await _relayer("lier", user)


@router.post("/delier")
async def delier(user: dict = Depends(get_current_user)):
    return await _relayer("delier", user)


@router.post("/evenements")
async def evenements(data: Periode, user: dict = Depends(get_current_user)):
    return await _relayer("evenements", user, data.model_dump(exclude_none=True))


@router.post("/analyser")
async def analyser(data: Note, user: dict = Depends(get_current_user)):
    return await _relayer("analyser", user, {"texte": data.texte})


@router.post("/creer")
async def creer(data: Rdv, user: dict = Depends(get_current_user)):
    return await _relayer("creer", user, data.model_dump(exclude_none=True))


@router.post("/modifier")
async def modifier(data: Modif, user: dict = Depends(get_current_user)):
    """Corrige un rendez-vous (décalage…) ; il prend l'étiquette « auRor » dans la colonne Origine."""
    return await _relayer("modifier", user, data.model_dump(exclude_none=True))


@router.post("/supprimer")
async def supprimer(data: Identifiant, user: dict = Depends(get_current_user)):
    return await _relayer("supprimer", user, {"id": data.id})
