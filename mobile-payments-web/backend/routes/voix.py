"""Transcription vocale dans Paiement Mobile (lot 42) : on parle, c'est écrit (réservé aux abonnés).

Pour un développeur WinDev : ce fichier ne transcrit RIEN lui-même. Il relaie la note vocale (30 secondes au plus), avec la
requête SIGNÉE habituelle, vers SAWALI qui contrôle l'ABONNEMENT (formule débloquant la transcription), la limite de notes
par jour, puis appelle Whisper. Sans abonnement actif, SAWALI refuse (402) avec le nom et le prix de la formule : ce message
est transmis tel quel à l'écran. Rien n'est conservé ici : ni l'audio ni le texte.

Route (utilisateur connecté) :
    POST /api/voix  {audio: data URL audio/webm|mp4|ogg, duree_s: 0 < durée ≤ 31}  → {texte, restant_aujourdhui}
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from limiteur import limiter_appels_publics
from routes.abonnement import utilisateur_sawali
from securite import get_current_user
from support_sawali import appeler_sawali

SERVICE = "Le service de transcription"
DUREE_MAX_S = 31      # 30 s + marge d'arrêt de l'enregistreur

router = APIRouter(prefix="/voix", tags=["Transcription vocale"])


class Note(BaseModel):
    audio: str = Field(min_length=100, max_length=1_400_000)
    duree_s: float = Field(gt=0, le=DUREE_MAX_S)


@router.post("", dependencies=[Depends(limiter_appels_publics)])
async def transcrire(data: Note, user: dict = Depends(get_current_user)):
    rep = await appeler_sawali("/formules-plateformes/transcrire",
                               {"utilisateur": utilisateur_sawali(user), "audio": data.audio, "duree_s": data.duree_s}, service=SERVICE, delai=60)
    return {"texte": rep.get("texte") or "", "restant_aujourdhui": rep.get("restant_aujourdhui")}
