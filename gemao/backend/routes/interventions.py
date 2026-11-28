"""INTERVENTIONS (ordres de travail) : demande -> planifiée -> en cours -> terminée (ou annulée).

- Un DEMANDEUR peut déclarer une panne ; admin / technicien planifient et clôturent.
- À la clôture : durée, pièces consommées (stock décrémenté atomiquement), coût, retour de l'équipement en service.
- WhatsApp (clé HMAC du client) : le technicien est prévenu à l'affectation ; le demandeur à la clôture.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import whatsapp
from db import SANS_ID, db
from outils import client_actif, exiger, maintenant, nouvel_id, prochain_numero, utilisateur_courant
from routes.pieces import sortir_stock

router = APIRouter(prefix="/interventions", tags=["interventions"])
TRANSITIONS = {"demande": {"planifiee", "en_cours", "annulee"}, "planifiee": {"en_cours", "annulee"},
               "en_cours": {"terminee", "annulee"}, "terminee": set(), "annulee": set()}


class Demande(BaseModel):
    equipement_id: str
    titre: str = Field(min_length=3, max_length=160)
    description: Optional[str] = None
    type: str = Field(default="corrective", pattern="^(corrective|preventive|amelioration)$")
    priorite: str = Field(default="normale", pattern="^(basse|normale|haute|urgente)$")
    arret_production: bool = False


class Planification(BaseModel):
    technicien_id: str
    date_prevue: Optional[str] = None     # AAAA-MM-JJ


class PieceUtilisee(BaseModel):
    piece_id: str
    quantite: float = Field(gt=0)


class Cloture(BaseModel):
    rapport: str = Field(min_length=3)
    pieces: List[PieceUtilisee] = []
    cout_main_oeuvre: float = Field(default=0, ge=0)


async def creer_ot(cid: str, createur: str, d: Demande, source: str = "web", numero: Optional[str] = None) -> dict:
    """Crée un OT (utilisé par l'écran, le préventif et WhatsApp). Un arrêt de production met l'équipement en panne."""
    eq = await db.equipements.find_one({"id": d.equipement_id, "client_id": cid}, SANS_ID)
    if not eq:
        raise HTTPException(404, "Équipement introuvable.")
    ot = {"id": nouvel_id(), "client_id": cid, "numero": numero or await prochain_numero(cid, "ot", "OT"),
          **d.model_dump(), "equipement_code": eq["code"], "equipement_nom": eq["nom"], "statut": "demande",
          "technicien_id": None, "demandeur_id": createur, "source": source, "cree_le": maintenant()}
    await db.interventions.insert_one(dict(ot))
    if d.arret_production:
        await db.equipements.update_one({"id": eq["id"]}, {"$set": {"etat": "en_panne"}})
    return ot


async def charger(cid: str, iid: str) -> dict:
    ot = await db.interventions.find_one({"id": iid, "client_id": cid}, SANS_ID)
    if not ot:
        raise HTTPException(404, "Intervention introuvable.")
    return ot


async def changer_statut(ot: dict, nouveau: str, champs: dict) -> dict:
    if nouveau not in TRANSITIONS[ot["statut"]]:
        raise HTTPException(409, f"Passage impossible : {ot['statut']} → {nouveau}.")
    return await db.interventions.find_one_and_update({"id": ot["id"]}, {"$set": {"statut": nouveau, **champs}},
                                                      projection=SANS_ID, return_document=True)


@router.get("")
async def lister(statut: Optional[str] = None, cid: str = Depends(client_actif), u: dict = Depends(utilisateur_courant)):
    f = {"client_id": cid, **({"statut": statut} if statut else {})}
    if u["role"] == "demandeur":
        f["demandeur_id"] = u["id"]                      # un demandeur ne voit que ses propres demandes
    return [i async for i in db.interventions.find(f, SANS_ID).sort("cree_le", -1).limit(500)]


@router.post("", status_code=201)
async def demander(d: Demande, cid: str = Depends(client_actif), u: dict = Depends(utilisateur_courant)):
    return await creer_ot(cid, u["id"], d)


@router.post("/{iid}/planifier")
async def planifier(iid: str, p: Planification, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    ot = await charger(cid, iid)
    tech = await db.users.find_one({"id": p.technicien_id, "client_id": cid, "actif": True, "role": {"$in": ["technicien", "admin"]}})
    if not tech:
        raise HTTPException(404, "Technicien introuvable.")
    r = await changer_statut(ot, "planifiee", {"technicien_id": p.technicien_id, "date_prevue": p.date_prevue})
    await whatsapp.notifier_utilisateur(cid, p.technicien_id,
        f"GeMAO — {ot['numero']} vous est affecté : {ot['titre']} ({ot['equipement_nom']}), priorité {ot['priorite']}.", ot["numero"])
    return r


@router.post("/{iid}/demarrer")
async def demarrer(iid: str, cid: str = Depends(client_actif), u: dict = Depends(exiger("admin", "technicien"))):
    ot = await charger(cid, iid)
    return await changer_statut(ot, "en_cours", {"debut": maintenant(), "technicien_id": ot.get("technicien_id") or u["id"]})


@router.post("/{iid}/cloturer")
async def cloturer(iid: str, c: Cloture, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    ot = await charger(cid, iid)
    if "terminee" not in TRANSITIONS[ot["statut"]]:
        raise HTTPException(409, "L'intervention doit être « en cours » pour être clôturée.")
    # 1) Vérifier TOUT le stock avant de sortir quoi que ce soit (pas de clôture à moitié faite)
    cout_pieces, lignes = 0.0, []
    for pu in c.pieces:
        p = await db.pieces.find_one({"id": pu.piece_id, "client_id": cid}, SANS_ID)
        if not p or p["stock"] < pu.quantite:
            raise HTTPException(409, f"Stock insuffisant : {p['nom'] if p else pu.piece_id}.")
    # 2) Sorties de stock (atomiques) et calcul du coût
    for pu in c.pieces:
        p = await sortir_stock(cid, pu.piece_id, pu.quantite, f"Intervention {ot['numero']}")
        cout_pieces += p["prix_unitaire"] * pu.quantite
        lignes.append({"piece_id": pu.piece_id, "code": p["code"], "nom": p["nom"], "quantite": pu.quantite,
                       "cout": p["prix_unitaire"] * pu.quantite})
    fin = maintenant()
    debut = ot.get("debut") or ot["cree_le"]
    duree_h = round((datetime.fromisoformat(fin) - datetime.fromisoformat(debut)).total_seconds() / 3600, 2)
    r = await changer_statut(ot, "terminee", {"fin": fin, "duree_heures": duree_h, "rapport": c.rapport, "pieces": lignes,
                                              "cout_pieces": cout_pieces, "cout_main_oeuvre": c.cout_main_oeuvre,
                                              "cout_total": cout_pieces + c.cout_main_oeuvre})
    await db.equipements.update_one({"id": ot["equipement_id"], "etat": "en_panne"}, {"$set": {"etat": "en_service"}})
    await whatsapp.notifier_utilisateur(cid, ot.get("demandeur_id"), f"GeMAO — {ot['numero']} terminée : {ot['titre']}. Merci.", ot["numero"])
    return r


@router.post("/{iid}/annuler")
async def annuler(iid: str, cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    return await changer_statut(await charger(cid, iid), "annulee", {"fin": maintenant()})
