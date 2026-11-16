"""MODÉRATION des messages écrits à Liluvine (journal intime) : contenu hors du cadre légal ou des règles du service.

Ce que ce module FAIT : lire le DERNIER message de l'utilisateur, en minuscules et sans accents, et y chercher des demandes qui sortent du cadre
(catégories ci-dessous). Si une catégorie est reconnue, Liluvine ne répond pas sur ce sujet (aucun appel à SAWALI) et un SIGNALEMENT est
enregistré pour le super-administrateur.

Ce que ce module NE FAIT JAMAIS :
  - garder le texte du message : le signalement ne contient que la catégorie, la date et l'identité du compte (décision du propriétaire,
    15/11/2026 : les confidences du journal ne sont jamais conservées côté serveur) ;
  - traiter une détresse (idées noires, envie de se faire du mal) comme une faute : ces messages ne sont JAMAIS modérés ici. Ils vont à Liluvine
    (et SAWALI oriente vers une aide humaine). Le filtre vérifie même l'absence de ces mots avant de signaler une « violence ».

Un indicateur AIDE l'administrateur, il ne décide pas seul (règle 21) : le signalement est une alerte à examiner, pas une sanction automatique.

Pour un développeur WinDev : une procédure `CategorieHorsCadre(texte)` qui rend une chaîne vide ou le nom de la catégorie (listes de mots dans un tableau).
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from db import SANS_ID, db

CATEGORIES = {
    "securite": "Demande de piratage, de fraude ou de contournement de sécurité",
    "sexuel": "Contenu sexuel explicite ou pornographique",
    "illegal": "Activité illégale (drogue, armes, trafic)",
    "violence": "Violence envers autrui",
}

# Expressions repères (sans accents, en minuscules). Volontairement ciblées : mieux vaut laisser passer une phrase ambiguë que bloquer une personne qui se confie.
_MOTIFS = {
    "securite": [r"\bpirater\b", r"\bhacker\b", r"\bhackers?\b", r"\bcraquer (le|un|son|leur) (mot de passe|code|compte)", r"\bphishing\b", r"\bhameconnage\b",
                 r"\bvoler (le|un|son|leur|des) (mot de passe|compte|comptes|donnees|code secret|code pin)", r"\bcloner (une |la )?carte", r"\bcarte clonee\b",
                 r"\bskimmer\b", r"\bkeylogger\b", r"\bransomware\b", r"\bddos\b", r"\bcontourner (la |le |les )?(securite|authentification|pin|code)",
                 r"\bacceder (illegalement |frauduleusement )?au compte de", r"\busurper l'identite", r"\bfaux (billets|papiers|documents)\b",
                 r"\b(arnaquer|escroquer|frauder) (quelqu|des|les|mon|ma|mes|un|une|le|la|l')", r"\bblanchir (de l'argent|des fonds)"],
    "sexuel": [r"\bporno", r"\bxxx\b", r"\bsexe explicite\b", r"\bscenes? de sexe\b", r"\bfellation\b", r"\bsodomie\b", r"\bsexto", r"\bphotos? (de )?nu(es?|s)?\b",
               r"\bnudes?\b", r"\bse masturber\b", r"\bmasturbation\b", r"\bsite (de )?(rencontres? )?(porno|x)\b", r"\bprostitue(e|es)?\b", r"\bdecris[- ]moi .{0,30}(sexe|sexuel)"],
    "illegal": [r"\b(vendre|acheter|trouver|fabriquer|produire) (de la |du |des )?(drogue|cocaine|heroine|cannabis|methamphetamine|marijuana)", r"\btrafic (de |d')(drogue|armes|etres humains|organes)",
                r"\bfabriquer (une |la )?(bombe|explosif|arme)", r"\bacheter (une )?arme (a feu )?sans", r"\bimmigration clandestine\b.{0,20}\bpasseur"],
    "violence": [r"\b(tuer|assassiner|empoisonner|poignarder|agresser|frapper) (quelqu'un|mon|ma|mes|son|sa|ses|le|la|les|un|une)\b", r"\bcomment (faire )?(tuer|empoisonner)\b",
                 r"\bplanifier (un )?(meurtre|attentat|agression)"],
}
_COMPILES = {c: [re.compile(m) for m in motifs] for c, motifs in _MOTIFS.items()}
# Détresse personnelle : JAMAIS modérée (voir l'en-tête du module). Sert de garde-fou avant de signaler une « violence ».
_DETRESSE = re.compile(r"\b(me suicider|suicide|en finir avec la vie|me tuer|me faire du mal|mourir|plus envie de vivre|me jeter)\b")

# Réponses de Liluvine aux messages modérés : brèves, bienveillantes, sans détail sur ce qui a été détecté
REPONSES = {
    "securite": "Je ne peux pas aider pour cela : cela porterait atteinte à la sécurité ou aux biens de quelqu'un. Si vous avez perdu l'accès à un compte qui est le vôtre, le service d'assistance de l'opérateur ou de la plateforme concernée peut vous aider. Et si quelque chose vous préoccupe, je suis là pour en parler.",
    "sexuel": "Ce n'est pas un sujet que je peux aborder ici. Je suis là pour vous écouter, vous encourager et vous aider à y voir plus clair dans votre quotidien. Si vous avez des questions de santé ou d'intimité, un professionnel de santé saura mieux vous répondre.",
    "illegal": "Je ne peux pas vous aider pour cela, car c'est contraire à la loi. Si une situation difficile vous y pousse, parlons de ce qui vous pèse : je suis là pour vous écouter.",
    "violence": "Je ne peux pas vous aider à faire du mal à quelqu'un. Si la colère ou une situation difficile vous submerge, prenez un instant, respirez, et dites-moi ce qui s'est passé : je vous écoute. En cas de danger immédiat, contactez les secours.",
}


def _normaliser(texte: str) -> str:
    t = unicodedata.normalize("NFD", str(texte or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").replace("’", "'")
    return re.sub(r"\s+", " ", t)


def categorie_hors_cadre(texte: str) -> Optional[str]:
    """Nom de la catégorie reconnue dans le message, ou None. Une détresse personnelle n'est jamais signalée comme « violence »."""
    t = _normaliser(texte)
    for categorie, motifs in _COMPILES.items():
        if any(m.search(t) for m in motifs):
            if categorie == "violence" and _DETRESSE.search(t):
                continue
            return categorie
    return None


async def enregistrer_signalement(user: dict, categorie: str) -> dict:
    """Enregistre le signalement pour le super-administrateur : catégorie, date, compte. JAMAIS le texte du message.
    `recidive` = au moins 3 signalements du même compte en 24 heures (indicateur d'aide à la décision, pas une sanction)."""
    maintenant = datetime.now(timezone.utc)
    avant = (maintenant - timedelta(hours=24)).isoformat()
    deja = await db.moderation.count_documents({"user_id": user["id"], "cree_le": {"$gte": avant}})
    s = {"id": str(uuid.uuid4()), "user_id": user["id"], "nom": user.get("nom") or user.get("prenom") or "", "telephone": user.get("telephone") or "",
         "categorie": categorie, "recidive": deja + 1 >= 3, "traite": False, "cree_le": maintenant.isoformat()}
    await db.moderation.insert_one(s.copy())
    return s
