"""Lecture OCR de photos dans auRor (lot 39) : plaques de marchands et ordonnances.

Pour un développeur WinDev : ce fichier ne lit RIEN lui-même. Il relaie la photo, avec la requête SIGNÉE habituelle, vers
SAWALI qui contrôle l'ABONNEMENT (formule débloquant l'OCR), la limite du jour et appelle l'IA. Sans abonnement actif, SAWALI
refuse (402) avec le nom et le prix de la formule ; ce message est transmis tel quel à l'écran.
Ensuite on NETTOIE ce que l'IA a lu : opérateur ramené au nom du catalogue, code marchand réduit aux chiffres (3 à 12),
nom filtré (lettres, chiffres, espaces) — une valeur douteuse devient « absente », jamais devinée.

Route (utilisateur connecté) :
    POST /api/ocr  {type: plaque_marchand | ordonnance, image: data URL JPEG/PNG/WebP}
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from db import db
from limiteur import limiter_appels_publics
from routes.abonnement import utilisateur_sawali
from securite import get_current_user
from support_sawali import appeler_sawali

DELAI_OCR = 90.0   # la lecture par l'IA peut durer plusieurs secondes
SERVICE = "Le service de lecture"
RE_NOM = re.compile(r"^[0-9A-Za-zÀ-ÖØ-öø-ÿ ._'-]{2,60}$")

router = APIRouter(prefix="/ocr", tags=["OCR"])


class Lecture(BaseModel):
    type: str = Field(pattern="^(plaque_marchand|ordonnance)$")
    image: str = Field(min_length=100, max_length=11_500_000)


def texte(v: Any, longueur: int = 120) -> Optional[str]:
    """Texte propre (espaces réduits) ou None."""
    if v is None:
        return None
    t = re.sub(r"\s+", " ", str(v)).strip()[:longueur]
    return t or None


def operateur_du_catalogue(lu: Optional[str], catalogue: List[str]) -> Optional[str]:
    """« Orange Money » → « Orange », « Moov Money » → « Moov Africa »… d'après les noms du catalogue (sinon None)."""
    t = (lu or "").strip().lower()
    for nom in catalogue:
        if t and (t.startswith(nom.split()[0].lower()) or nom.lower().startswith(t.split()[0])):
            return nom
    return None


def nettoyer_plaque(champs: Dict[str, Any], catalogue: List[str]) -> Dict[str, Any]:
    code = re.sub(r"\D", "", str(champs.get("code_marchand") or ""))
    nom = texte(champs.get("nom_marchand"), 60)
    sous_qr = re.sub(r"\D", "", str(champs.get("numero_sous_qr") or ""))
    return {"operateur": operateur_du_catalogue(texte(champs.get("operateur"), 40), catalogue),
            "code": code if 3 <= len(code) <= 12 else None,
            "nom": nom if nom and RE_NOM.match(nom) else None,
            "numero_sous_qr": sous_qr if 4 <= len(sous_qr) <= 30 else None,
            "texte": texte(champs.get("texte_complet"), 1500)}


def nettoyer_ordonnance(champs: Dict[str, Any]) -> Dict[str, Any]:
    meds = []
    for m in (champs.get("medicaments") or [])[:30]:
        if isinstance(m, dict) and texte(m.get("nom"), 80):
            meds.append({"nom": texte(m.get("nom"), 80), "dose": texte(m.get("dose"), 40),
                         "posologie": texte(m.get("posologie"), 120), "duree": texte(m.get("duree"), 60)})
    date = texte(champs.get("date"), 10)
    return {"prescripteur": texte(champs.get("prescripteur"), 80), "patient": texte(champs.get("patient"), 80),
            "date": date if date and re.match(r"^\d{4}-\d{2}-\d{2}$", date) else None, "medicaments": meds,
            "texte": texte(champs.get("texte_complet"), 3000)}


@router.post("", dependencies=[Depends(limiter_appels_publics)])
async def lire(data: Lecture, user: dict = Depends(get_current_user)):
    rep = await appeler_sawali("/formules-plateformes/ocr", {"utilisateur": utilisateur_sawali(user), "type": data.type, "image": data.image},
                               service=SERVICE, delai=DELAI_OCR)
    champs = rep.get("champs") or {}
    sortie = {"type": data.type, "incertains": rep.get("incertains") or [], "confiance": rep.get("confiance"),
              "avertissements": rep.get("avertissements") or [], "restant_aujourdhui": rep.get("restant_aujourdhui")}
    if data.type == "plaque_marchand":
        catalogue = await db.services.distinct("operateur")
        sortie.update(nettoyer_plaque(champs, catalogue))
    else:
        sortie.update(nettoyer_ordonnance(champs))
    return sortie
