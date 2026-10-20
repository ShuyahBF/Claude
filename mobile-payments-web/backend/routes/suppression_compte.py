"""Suppression de son propre compte (lot 80) — exigée par Google Play pour toute application qui crée des comptes.

Règle Google : l'utilisateur doit pouvoir supprimer son compte ET ses données depuis l'application, et une page web publique
(/suppression-compte) doit expliquer comment faire.

Pour un développeur WinDev (équivalent d'une procédure « SupprimerClient » qui nettoie toutes les tables liées) :
  - l'utilisateur confirme avec son MOT DE PASSE (essais limités comme à la connexion) ;
  - le compte administrateur ne se supprime pas ici (409) ;
  - AVANT d'effacer quoi que ce soit, les archives en ligne chiffrées (gardées par SAWALI) sont supprimées une à une ; si SAWALI ne répond
    pas, la suppression est refusée (502) et le compte reste intact : on ne laisse jamais de documents orphelins ;
  - ensuite sont effacées ici toutes les données rattachées au compte : paiements préparés, anniversaires, rappels, prises de médicaments,
    appareils de notification, liens QR, cartes virtuelles, compte marchand, journal de connexions, compteurs ; le compte lui-même part en dernier ;
  - l'annuaire commun des marchands est conservé (données partagées, sans lien avec la personne : « créé par » est vidé) ;
  - les achats d'abonnement restent chez SAWALI (obligation comptable) mais ne sont plus rattachés à aucun compte utilisable.

Route (utilisateur connecté) :
    POST /api/compte/supprimer  {mot_de_passe} → {ok, supprime: {collection: nombre}, archives_supprimees}
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from db import db
from routes.abonnement import utilisateur_sawali
from securite import effacer_cookie_session, get_current_user, noter_echec, verifier_non_bloque, verify_password
from support_sawali import appeler_sawali

logger = logging.getLogger("paiement_mobile.suppression_compte")

SERVICE = "Le service d'archives"
# Collections dont chaque ligne porte « user_id » : tout est effacé avec le compte
COLLECTIONS_UTILISATEUR = ("paiements", "anniversaires", "rappels_paiements", "rappels_medicaments", "prises_medicaments",
                           "push_abonnements", "push_envoyes", "qr_operateurs", "cartes", "comptes_marchands",
                           "journal_connexions", "garde_recherches", "reglages_plateforme")   # reglages_plateforme : portefeuilles (lot 86)

router = APIRouter(prefix="/compte", tags=["Compte"])


class Suppression(BaseModel):
    mot_de_passe: str = Field(..., min_length=1, max_length=200)


async def supprimer_archives_en_ligne(user: dict) -> int:
    """Efface les archives chiffrées gardées par SAWALI. Renvoie leur nombre ; lève 502 si SAWALI échoue (compte laissé intact)."""
    identite = {"utilisateur": utilisateur_sawali(user)}
    try:
        liste = await appeler_sawali("/formules-plateformes/archives/liste", identite, service=SERVICE, delai=30)
    except HTTPException as exc:
        if exc.status_code < 500 or exc.status_code == 503:
            return 0                      # aucun abonnement aux archives (ou service non configuré ici) : rien à effacer
        raise HTTPException(502, "Vos archives en ligne n'ont pas pu être effacées pour le moment : réessayez dans un instant. Votre compte n'a pas été supprimé.")
    n = 0
    for a in liste.get("archives") or []:
        try:
            await appeler_sawali("/formules-plateformes/archives/supprimer", {**identite, "id": a["id"]}, service=SERVICE, delai=30)
            n += 1
        except HTTPException:
            raise HTTPException(502, "Vos archives en ligne n'ont pas toutes pu être effacées : réessayez dans un instant. Votre compte n'a pas été supprimé.")
    return n


@router.post("/supprimer")
async def supprimer(data: Suppression, response: Response, user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        raise HTTPException(409, "Le compte administrateur ne peut pas être supprimé ici.")
    # 1. Mot de passe : mêmes essais limités qu'à la connexion
    cle = f"suppression:{user['id']}"
    await verifier_non_bloque(cle)
    if not verify_password(data.mot_de_passe, user.get("password_hash") or ""):
        await noter_echec(cle)
        raise HTTPException(403, "Mot de passe incorrect")
    # 2. Archives en ligne d'abord : en cas d'échec, rien n'est effacé
    archives = await supprimer_archives_en_ligne(user)
    # 3. Données rattachées au compte
    supprime = {}
    for nom in COLLECTIONS_UTILISATEUR:
        r = await getattr(db, nom).delete_many({"user_id": user["id"]})
        supprime[nom] = r.deleted_count
    await db.marchands.update_many({"cree_par": user["id"]}, {"$set": {"cree_par": None}})   # annuaire commun : on garde la fiche, pas l'auteur
    for champ in ("telephone", "email"):
        if user.get(champ):
            await db.echecs_connexion.delete_many({"cle": f"{champ}:{user[champ]}"})
            await db.profils_android.delete_many({champ: user[champ]})
    # 4. Le compte lui-même, en dernier
    await db.users.delete_one({"id": user["id"]})
    effacer_cookie_session(response)
    logger.info("Compte supprimé (%s archives en ligne effacées)", archives)
    return {"ok": True, "supprime": supprime, "archives_supprimees": archives}
