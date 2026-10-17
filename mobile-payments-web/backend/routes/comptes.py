"""Liste des comptes pour l'administrateur (lot 45) : connexion, déconnexion, adresse IP, abonnements actifs, blocage.

Pour un développeur WinDev :
  - GET  /api/admin/comptes?q=&page=     → comptes (50 par page) avec dernière connexion / déconnexion / adresse IP / bloqué ;
  - POST /api/admin/comptes/abonnements  → abonnements ACTIFS (formule, expiration) de ces comptes, lus chez SAWALI :
        chargement SÉPARÉ de la liste (règle 7 : une lecture lente chez SAWALI ne retarde pas l'affichage des comptes),
        mémorisé 60 s, une seule demande pour tous les comptes manquants ;
  - GET  /api/admin/comptes/{id}/connexions → les 30 dernières sessions du compte (ouverture, fermeture, adresse IP) ;
  - PUT  /api/admin/comptes/{id}/deconnexion → déconnexion FORCÉE : l'utilisateur voit un compte à rebours de 30 s (« l'administrateur va
        fermer votre session ») puis son écran revient à la page de connexion ; POST /api/admin/comptes/deconnexion-generale : tous les
        utilisateurs (jamais les administrateurs) ; DELETE …/deconnexion annule une annonce en cours ;
  - PUT  /api/admin/comptes/reglage-inactivite {secondes} → durée d'inactivité avant fermeture de la session (liste déroulante de l'écran) ;
  - PUT  /api/admin/comptes/{id}/blocage {bloque} → bloquer / débloquer. Un compte bloqué est déconnecté aussitôt
        (la session est refusée à la requête suivante) et ne peut plus se connecter. Impossible sur soi-même ou un administrateur.
Tout est réservé à l'administrateur.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import journal_connexions
import reglages_securite
from db import SANS_ID, db
from routes.abonnement import SERVICE, utilisateur_sawali  # noqa: F401 — SERVICE : nom cité dans les messages d'erreur
from securite import require_admin
from support_sawali import appeler_sawali

router = APIRouter(prefix="/admin/comptes", tags=["Comptes (administrateur)"])

PAR_PAGE = 50
DUREE_CACHE = 60.0
_cache: Dict[str, tuple] = {}    # id du compte → (heure de lecture, liste des abonnements actifs)


def vider_cache() -> None:
    _cache.clear()


def _fiche(u: dict) -> dict:
    """Ce que l'administrateur voit d'un compte (jamais le hash du mot de passe)."""
    ouverte = u.get("derniere_connexion")
    fermee = u.get("derniere_deconnexion")
    return {"id": u["id"], "nom": u.get("nom"), "prenom": u.get("prenom"), "telephone": u.get("telephone"), "email": u.get("email"),
            "role": u.get("role"), "cree_le": u.get("cree_le"), "derniere_connexion": ouverte, "derniere_deconnexion": fermee,
            "derniere_ip": u.get("derniere_ip"),
            # Session probablement ouverte : connexion plus récente que la dernière déconnexion
            "session_ouverte": bool(ouverte and (not fermee or ouverte > fermee)),
            "bloque": bool(u.get("desactive")), "bloque_le": u.get("bloque_le"), "deconnexion_a": u.get("deconnexion_a")}


@router.get("")
async def liste(q: str = Query("", max_length=60), page: int = Query(1, ge=1, le=1000), _: dict = Depends(require_admin)):
    filtre: Dict[str, Any] = {}
    texte = q.strip()
    if texte:
        motif = {"$regex": re.escape(texte), "$options": "i"}
        filtre = {"$or": [{"nom": motif}, {"prenom": motif}, {"telephone": motif}, {"email": motif}, {"derniere_ip": motif}]}
    total = await db.users.count_documents(filtre)
    # Les plus récemment connectés d'abord ; les comptes jamais connectés (champ absent) ferment la marche
    curseur = db.users.find(filtre, SANS_ID).sort([("derniere_connexion", -1), ("cree_le", -1)]).skip((page - 1) * PAR_PAGE).limit(PAR_PAGE)
    return {"total": total, "page": page, "par_page": PAR_PAGE, "comptes": [_fiche(u) async for u in curseur],
            "inactivite_secondes": await reglages_securite.secondes_inactivite(), "choix_inactivite": list(reglages_securite.CHOIX_SECONDES)}


class Ids(BaseModel):
    ids: List[str] = Field(..., max_length=PAR_PAGE)


@router.post("/abonnements")
async def abonnements(corps: Ids, _: dict = Depends(require_admin)):
    maintenant = time.monotonic()
    manquants = [i for i in dict.fromkeys(corps.ids) if i not in _cache or maintenant - _cache[i][0] > DUREE_CACHE]
    if manquants:
        rep = await appeler_sawali("/formules-plateformes/abonnes", {"utilisateurs": manquants}, service=SERVICE, delai=15)
        actifs = rep.get("abonnes") or {}
        for i in manquants:
            _cache[i] = (maintenant, actifs.get(i, []))
    return {"abonnes": {i: _cache[i][1] for i in corps.ids if i in _cache and _cache[i][1]}}


@router.get("/{compte_id}/connexions")
async def connexions(compte_id: str, _: dict = Depends(require_admin)):
    lignes = db.journal_connexions.find({"user_id": compte_id}, {"_id": 0}).sort("ouverte_le", -1).limit(30)
    def iso(d):
        return d.replace(tzinfo=d.tzinfo or timezone.utc).isoformat() if isinstance(d, datetime) else d
    return {"connexions": [{"ouverte_le": iso(l["ouverte_le"]), "fermee_le": iso(l.get("fermee_le")), "ip": l.get("ip")} async for l in lignes]}


class Blocage(BaseModel):
    bloque: bool


@router.put("/{compte_id}/blocage")
async def bloquer(compte_id: str, corps: Blocage, admin: dict = Depends(require_admin)):
    cible = await db.users.find_one({"id": compte_id}, SANS_ID)
    if not cible:
        raise HTTPException(404, "Compte introuvable")
    if cible["id"] == admin["id"] or cible.get("role") == "admin":
        raise HTTPException(422, "Un compte administrateur ne peut pas être bloqué")
    maj = {"$set": {"desactive": True, "bloque_le": datetime.now(timezone.utc).isoformat()}} if corps.bloque else {"$set": {"desactive": False}, "$unset": {"bloque_le": ""}}
    await db.users.update_one({"id": compte_id}, maj)
    if corps.bloque:
        await journal_connexions.fermer_toutes(compte_id, "blocage")
    return _fiche(await db.users.find_one({"id": compte_id}, SANS_ID))


# Délai laissé à l'utilisateur entre l'annonce et la fermeture de sa session (compte à rebours affiché sur son écran)
DELAI_DECONNEXION_S = 30


def _echeance() -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=DELAI_DECONNEXION_S)).isoformat()


@router.post("/deconnexion-generale")
async def deconnexion_generale(_: dict = Depends(require_admin)):
    """Annonce la déconnexion de TOUS les utilisateurs (les administrateurs ne sont jamais déconnectés ainsi)."""
    r = await db.users.update_many({"role": {"$ne": "admin"}}, {"$set": {"deconnexion_a": _echeance()}})
    return {"annonces": r.modified_count, "delai_s": DELAI_DECONNEXION_S}


class Reglage(BaseModel):
    secondes: int


@router.put("/reglage-inactivite")
async def reglage_inactivite(corps: Reglage, _: dict = Depends(require_admin)):
    if corps.secondes not in reglages_securite.CHOIX_SECONDES:
        raise HTTPException(422, "Durée non proposée")
    return {"inactivite_secondes": await reglages_securite.definir_secondes_inactivite(corps.secondes)}


@router.put("/{compte_id}/deconnexion")
async def deconnecter(compte_id: str, admin: dict = Depends(require_admin)):
    cible = await db.users.find_one({"id": compte_id}, SANS_ID)
    if not cible:
        raise HTTPException(404, "Compte introuvable")
    if cible["id"] == admin["id"] or cible.get("role") == "admin":
        raise HTTPException(422, "Un compte administrateur ne peut pas être déconnecté ainsi")
    await db.users.update_one({"id": compte_id}, {"$set": {"deconnexion_a": _echeance()}})
    return {"delai_s": DELAI_DECONNEXION_S}


@router.delete("/{compte_id}/deconnexion")
async def annuler_deconnexion(compte_id: str, _: dict = Depends(require_admin)):
    await db.users.update_one({"id": compte_id}, {"$unset": {"deconnexion_a": ""}})
    return {"ok": True}
