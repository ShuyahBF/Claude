"""Portefeuilles (lot 86) : suivre l'argent de son portefeuille ÉLECTRONIQUE (compte mobile money) et de son portefeuille PERSONNEL
(liquidités, « dans la poche ») — auRor, outil de budget.

Pour un développeur WinDev (équivalent d'un petit livre de caisse à deux comptes) :
  - un RELEVÉ = « mon solde est de X FCFA à telle date » pour un portefeuille. Un relevé du jour vaut « maintenant » ; un relevé d'un jour
    passé vaut « en fin de journée ». Chaque nouveau relevé REMPLACE le calcul : il sert de point de départ, et le serveur indique l'ÉCART
    entre ce que le calcul prévoyait et ce que l'utilisateur déclare (dépense oubliée, frais non notés…) ;
  - le solde ÉLECTRONIQUE baisse de chaque paiement EFFECTUÉ après le dernier relevé ; les paiements encore « préparés » (ou déclarés
    en attente du marchand) sont « EN COURS » : ils ne bougent pas le solde confirmé mais sont indiqués à part (solde après paiements en cours) ;
    un paiement compte à la date où il a été préparé (c'est là que l'argent part), jamais avant le relevé qui le contient déjà ;
  - les MOUVEMENTS : retrait (électronique → personnel : sortie d'un côté, entrée de l'autre, avec frais éventuels pris sur l'électronique),
    dépôt (personnel → électronique), entrée d'argent et sortie d'argent sur le portefeuille choisi (salaire reçu, dépense en espèces…) ;
  - la COURBE donne le solde de fin de journée des deux portefeuilles, depuis le premier relevé (366 jours au plus) ;
  - rangement : un seul document par utilisateur dans « reglages_plateforme » (identifiant « portefeuille:<utilisateur> ») : AUCUNE nouvelle
    collection. 400 relevés et 2 000 mouvements au plus. Effacé avec le compte.

Routes (utilisateur connecté) :
    GET    /api/portefeuille?jours=90          → soldes, en cours, courbe, relevés et mouvements récents
    POST   /api/portefeuille/releves           {portefeuille, jour?, montant}
    DELETE /api/portefeuille/releves/{id}
    POST   /api/portefeuille/mouvements        {type, portefeuille?, montant, frais?, jour?, motif?}
    DELETE /api/portefeuille/mouvements/{id}
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from db import db
from securite import get_current_user

router = APIRouter(prefix="/portefeuille", tags=["Portefeuille"])

PORTEFEUILLES = ("electronique", "personnel")
RELEVES_MAX = 400
MOUVEMENTS_MAX = 2000
JOURS_MAX = 366
MONTANT_MAX = 1_000_000_000
STATUTS_CONFIRMES = ("effectue",)
STATUTS_EN_COURS = ("prepare", "declare")          # « declare » : PI-SPI, référence déclarée, attente du marchand


class Releve(BaseModel):
    portefeuille: Literal["electronique", "personnel"]
    jour: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")     # absent = aujourd'hui
    montant: int = Field(ge=0, le=MONTANT_MAX)


class Mouvement(BaseModel):
    type: Literal["retrait", "depot", "entree", "sortie"]
    portefeuille: Optional[Literal["electronique", "personnel"]] = None   # seulement pour « entree » et « sortie »
    montant: int = Field(gt=0, le=MONTANT_MAX)
    frais: int = Field(0, ge=0, le=MONTANT_MAX)                           # frais du retrait / dépôt, pris sur le portefeuille électronique
    jour: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    motif: Optional[str] = Field(None, max_length=120)


def maintenant() -> datetime:
    return datetime.now(timezone.utc)                 # heure de Ouagadougou = UTC


def _jour(valeur: Optional[str]) -> date:
    """Jour saisi (aujourd'hui par défaut) ; jamais dans le futur."""
    try:
        j = date.fromisoformat(valeur) if valeur else maintenant().date()
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Date invalide")
    if j > maintenant().date():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La date ne peut pas être dans le futur")
    return j


def instant(jour: date, fin_de_journee: bool) -> datetime:
    """Instant d'un enregistrement : aujourd'hui = maintenant ; jour passé = midi (mouvement) ou 23 h 59 (relevé : il contient la journée)."""
    if jour == maintenant().date():
        return maintenant()
    return datetime.combine(jour, time(23, 59, 59) if fin_de_journee else time(12, 0, 0), tzinfo=timezone.utc)


def _dt(texte: str) -> datetime:
    d = datetime.fromisoformat(texte)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------------------------------------------- calcul (pur)
def evenements(paiements: List[dict], mouvements: List[dict]) -> Dict[str, List[dict]]:
    """Variations de chaque portefeuille : {portefeuille: [{at, delta, libelle, en_cours}]} (triées par date).
    Paiements : seuls les effectués bougent le solde électronique ; préparés / déclarés sont « en cours »."""
    ev: Dict[str, List[dict]] = {"electronique": [], "personnel": []}
    for p in paiements:
        if p.get("montant") and p.get("statut") in STATUTS_CONFIRMES + STATUTS_EN_COURS:
            titre = p.get("service_nom") or "Paiement"
            if (p.get("marchand") or {}).get("libelle"):
                titre += f" · {p['marchand']['libelle']}"
            ev["electronique"].append({"at": _dt(p["cree_le"]), "delta": -int(p["montant"]), "libelle": titre,
                                       "en_cours": p["statut"] in STATUTS_EN_COURS})
    for m in mouvements:
        at, mt, frais, motif = _dt(m["at"]), int(m["montant"]), int(m.get("frais") or 0), m.get("motif") or ""
        if m["type"] == "retrait":                       # sortie du compte mobile money, entrée dans la poche
            ev["electronique"].append({"at": at, "delta": -(mt + frais), "libelle": "Retrait" + (f" (frais {frais})" if frais else ""), "en_cours": False})
            ev["personnel"].append({"at": at, "delta": mt, "libelle": "Retrait reçu en espèces", "en_cours": False})
        elif m["type"] == "depot":                       # espèces déposées sur le compte mobile money
            ev["personnel"].append({"at": at, "delta": -mt, "libelle": "Dépôt sur le compte mobile money", "en_cours": False})
            ev["electronique"].append({"at": at, "delta": mt - frais, "libelle": "Dépôt reçu" + (f" (frais {frais})" if frais else ""), "en_cours": False})
        else:                                            # entrée / sortie d'argent sur le portefeuille choisi
            ev[m["portefeuille"]].append({"at": at, "delta": mt if m["type"] == "entree" else -mt,
                                          "libelle": motif or ("Entrée d'argent" if m["type"] == "entree" else "Sortie d'argent"), "en_cours": False})
    for liste in ev.values():
        liste.sort(key=lambda e: e["at"])
    return ev


def _releves_tries(releves: List[dict], portefeuille: str) -> List[dict]:
    return sorted((r for r in releves if r["portefeuille"] == portefeuille), key=lambda r: r["at"])


def solde_a(t: datetime, releves: List[dict], evts: List[dict]) -> Optional[int]:
    """Solde à l'instant t : dernier relevé avant t + variations confirmées depuis ce relevé. None avant le premier relevé."""
    base = None
    for r in releves:                                    # triés par date
        if _dt(r["at"]) <= t:
            base = r
        else:
            break
    if base is None:
        return None
    depart = _dt(base["at"])
    return int(base["montant"]) + sum(e["delta"] for e in evts if depart < e["at"] <= t and not e["en_cours"])


def calculer(releves: List[dict], paiements: List[dict], mouvements: List[dict], jours: int, maintenant_dt: Optional[datetime] = None) -> dict:
    """Soldes actuels, montants en cours, écarts des relevés et courbe quotidienne des deux portefeuilles."""
    maintenant_dt = maintenant_dt or maintenant()
    ev = evenements(paiements, mouvements)
    sortie: dict = {"soldes": {}, "ecarts": {}, "serie": []}
    courbes: Dict[str, Dict[str, Optional[int]]] = {}
    debut_serie = maintenant_dt.date() - timedelta(days=jours - 1)
    for w in PORTEFEUILLES:
        rel = _releves_tries(releves, w)
        courant = solde_a(maintenant_dt, rel, ev[w])
        base = next((r for r in reversed(rel) if _dt(r["at"]) <= maintenant_dt), None)
        en_cours = sum(e["delta"] for e in ev[w] if e["en_cours"] and base and e["at"] > _dt(base["at"]))
        sortie["soldes"][w] = {"renseigne": courant is not None, "montant": courant, "en_cours": en_cours,
                               "apres_en_cours": None if courant is None else courant + en_cours,
                               "depuis": base["jour"] if base else None}
        # Écart de chaque relevé : ce que le calcul prévoyait juste avant, comparé à ce que l'utilisateur a déclaré
        for i, r in enumerate(rel):
            avant = solde_a(_dt(r["at"]) - timedelta(microseconds=1), rel[:i], ev[w]) if i > 0 else None
            if avant is not None:
                sortie["ecarts"][r["id"]] = int(r["montant"]) - avant
        # Courbe : solde de fin de journée
        courbes[w] = {}
        if rel:
            j = max(debut_serie, _dt(rel[0]["at"]).date())
            while j <= maintenant_dt.date():
                t = maintenant_dt if j == maintenant_dt.date() else datetime.combine(j, time(23, 59, 59), tzinfo=timezone.utc)
                courbes[w][j.isoformat()] = solde_a(t, rel, ev[w])
                j += timedelta(days=1)
    jours_courbe = sorted(set(courbes["electronique"]) | set(courbes["personnel"]))
    sortie["serie"] = [{"jour": j, "electronique": courbes["electronique"].get(j), "personnel": courbes["personnel"].get(j)} for j in jours_courbe]
    return sortie


# ---------------------------------------------------------------------------------------------------------------- routes
def _cle(user: dict) -> str:
    return f"portefeuille:{user['id']}"


async def _doc(user: dict) -> dict:
    return await db.reglages_plateforme.find_one({"_id": _cle(user)}) or {"releves": [], "mouvements": []}


@router.get("")
async def lire(jours: int = Query(90, ge=7, le=JOURS_MAX), user: dict = Depends(get_current_user)):
    doc = await _doc(user)
    releves, mouvements = doc.get("releves") or [], doc.get("mouvements") or []
    # Paiements : UNE lecture, depuis le premier relevé électronique seulement (aucune boucle par paiement)
    premier = min((r["at"] for r in releves if r["portefeuille"] == "electronique"), default=None)
    paiements = []
    if premier:
        paiements = await db.paiements.find(
            {"user_id": user["id"], "cree_le": {"$gte": premier}, "statut": {"$in": list(STATUTS_CONFIRMES + STATUTS_EN_COURS)}},
            {"_id": 0, "id": 1, "cree_le": 1, "statut": 1, "montant": 1, "service_nom": 1, "marchand": 1}).to_list(5000)
    calcul = calculer(releves, paiements, mouvements, jours)
    ev = evenements(paiements, mouvements)
    return {
        **calcul,
        "releves": [{**{k: r[k] for k in ("id", "portefeuille", "jour", "montant")}, "ecart": calcul["ecarts"].get(r["id"])}
                    for r in sorted(releves, key=lambda r: r["at"], reverse=True)[:60]],
        "mouvements": [{k: m.get(k) for k in ("id", "type", "portefeuille", "montant", "frais", "jour", "motif")}
                       for m in sorted(mouvements, key=lambda m: m["at"], reverse=True)[:60]],
        "en_cours": [{"libelle": e["libelle"], "montant": -e["delta"], "le": e["at"].isoformat()} for e in ev["electronique"] if e["en_cours"]
                     and any(e["at"] > _dt(r["at"]) for r in releves if r["portefeuille"] == "electronique")][-20:],
        "jours": jours,
    }


@router.post("/releves", status_code=status.HTTP_201_CREATED)
async def ajouter_releve(data: Releve, user: dict = Depends(get_current_user)):
    """« Mon solde est de X à cette date ». Les relevés s'ajoutent (on garde l'historique des recalages) ; le plus récent sert de point de départ."""
    j = _jour(data.jour)
    doc = await _doc(user)
    if len(doc.get("releves") or []) >= RELEVES_MAX:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{RELEVES_MAX} relevés au maximum : supprimez les plus anciens")
    releve = {"id": str(uuid.uuid4()), "portefeuille": data.portefeuille, "jour": j.isoformat(), "at": instant(j, True).isoformat(),
              "montant": data.montant, "cree_le": maintenant().isoformat()}
    await db.reglages_plateforme.update_one({"_id": _cle(user)}, {"$set": {"user_id": user["id"]}, "$push": {"releves": releve}}, upsert=True)
    return {"ok": True, "id": releve["id"]}


@router.delete("/releves/{releve_id}")
async def supprimer_releve(releve_id: str, user: dict = Depends(get_current_user)):
    r = await db.reglages_plateforme.update_one({"_id": _cle(user), "releves.id": releve_id}, {"$pull": {"releves": {"id": releve_id}}})
    if not r.modified_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relevé introuvable")
    return {"ok": True}


@router.post("/mouvements", status_code=status.HTTP_201_CREATED)
async def ajouter_mouvement(data: Mouvement, user: dict = Depends(get_current_user)):
    """Retrait / dépôt entre les deux portefeuilles, ou entrée / sortie d'argent sur l'un d'eux."""
    if data.type in ("entree", "sortie") and not data.portefeuille:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choisissez le portefeuille concerné")
    if data.type in ("retrait", "depot") and data.portefeuille:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Un retrait ou un dépôt concerne les deux portefeuilles")
    if data.type in ("entree", "sortie") and data.frais:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Les frais ne concernent que les retraits et les dépôts")
    j = _jour(data.jour)
    doc = await _doc(user)
    if len(doc.get("mouvements") or []) >= MOUVEMENTS_MAX:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{MOUVEMENTS_MAX} mouvements au maximum")
    mouvement = {"id": str(uuid.uuid4()), "type": data.type, "portefeuille": data.portefeuille, "montant": data.montant, "frais": data.frais,
                 "jour": j.isoformat(), "at": instant(j, False).isoformat(), "motif": (data.motif or "").strip(), "cree_le": maintenant().isoformat()}
    await db.reglages_plateforme.update_one({"_id": _cle(user)}, {"$set": {"user_id": user["id"]}, "$push": {"mouvements": mouvement}}, upsert=True)
    return {"ok": True, "id": mouvement["id"]}


@router.delete("/mouvements/{mouvement_id}")
async def supprimer_mouvement(mouvement_id: str, user: dict = Depends(get_current_user)):
    r = await db.reglages_plateforme.update_one({"_id": _cle(user), "mouvements.id": mouvement_id}, {"$pull": {"mouvements": {"id": mouvement_id}}})
    if not r.modified_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mouvement introuvable")
    return {"ok": True}
