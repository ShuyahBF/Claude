"""Journal intime (lot 166) : conversation avec Liluvine, la coach, relayée vers SAWALI.

Décisions du propriétaire (15/11/2026) :
  - les confidences du journal restent SUR LE TÉLÉPHONE, chiffrées : ce serveur ne les garde JAMAIS (aucun fichier, aucun journal d'accès au texte) ;
  - Liluvine répond par une IA via SAWALI : seuls les derniers échanges de la conversation en cours sont envoyés, pour obtenir UNE réponse, puis oubliés ;
  - abonnement par formule (fonction « coach_liluvine », contrôlée par SAWALI) avec quelques échanges d'essai gratuits ;
  - garde-fous (pas de diagnostic, orientation vers une aide humaine en cas de détresse) tenus par SAWALI ;
  - l'utilisateur doit APPROUVER lui-même les mentions avant tout usage : le site garde son accord sur le téléphone et chaque envoi le rappelle ici
    (`consentement` + `version_mentions`) : sans cela, ce serveur refuse (422) et rien ne part vers SAWALI.

Pour un développeur WinDev : ce fichier ne contient aucune donnée ; il vérifie l'accord, borne les messages, puis relaie avec la requête SIGNÉE habituelle.

Route (utilisateur connecté) :
    POST /api/journal-intime/liluvine  {messages: [{role, content}], consentement: true, version_mentions}  →
         {reponse, urgence, restant_aujourdhui, essais_restants}
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from limiteur import limiter_appels_publics
from routes.abonnement import utilisateur_sawali
from securite import get_current_user
from support_sawali import appeler_sawali

SERVICE = "Liluvine, ma coach"
VERSION_MENTIONS = "1"          # à incrémenter quand le texte des mentions change : chacun doit alors les approuver de nouveau (voir frontend/src/lib/journalIntime.js)

router = APIRouter(prefix="/journal-intime", tags=["Journal intime"])


class Echange(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class Demande(BaseModel):
    messages: List[Echange] = Field(min_length=1, max_length=16)
    consentement: bool = False
    version_mentions: str = Field("", max_length=10)


@router.post("/liluvine", dependencies=[Depends(limiter_appels_publics)])
async def liluvine(data: Demande, user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    # L'utilisateur a-t-il approuvé LUI-MÊME les mentions en vigueur ? Sinon rien n'est envoyé (ni texte, ni identité) vers SAWALI.
    if not data.consentement or data.version_mentions != VERSION_MENTIONS:
        raise HTTPException(422, "Vous devez d'abord lire et approuver les mentions du journal intime.")
    rep = await appeler_sawali("/coach-plateformes/repondre",
                               {"utilisateur": utilisateur_sawali(user), "messages": [m.model_dump() for m in data.messages]}, service=SERVICE, delai=60)
    return {"reponse": rep.get("reponse") or "", "urgence": bool(rep.get("urgence")), "restant_aujourdhui": rep.get("restant_aujourdhui"),
            "essais_restants": rep.get("essais_restants")}
