"""Portefeuilles (lots 86 et 87) : suivre l'argent de ses portefeuilles ÉLECTRONIQUES — un par OPÉRATEUR (Orange, Moov, Telecel…) — et de son
portefeuille PERSONNEL (liquidités, « dans la poche ») — auRor, outil de budget.

Pour un développeur WinDev (équivalent d'un petit livre de caisse à plusieurs comptes) :
  - chaque portefeuille a une CLÉ : « personnel », « electronique:Orange », « electronique:Moov »… (et « electronique » seul pour les
    relevés du lot 86, faits avant le choix de l'opérateur : ce portefeuille « général » reste suivi tel quel) ;
  - un RELEVÉ = « mon solde est de X FCFA à telle date » pour un portefeuille. Un relevé du jour vaut « maintenant » ; un relevé d'un jour
    passé vaut « en fin de journée ». Il sert de point de départ ; le serveur indique l'ÉCART entre ce que le calcul prévoyait et ce que
    l'utilisateur déclare (dépense oubliée, frais non notés…) ;
  - un paiement EFFECTUÉ baisse le portefeuille de SON opérateur, s'il a un relevé (sinon le portefeuille « général », sinon rien) ; les
    paiements « préparés » (ou PI-SPI déclarés) sont « EN COURS » : ils ne bougent pas le solde confirmé, mais sont indiqués à part ;
    un paiement compte à la date où il a été préparé, jamais avant le relevé qui le contient déjà ;
  - les MOUVEMENTS : retrait (compte mobile money d'un opérateur → poche, frais pris sur le compte), dépôt (poche → compte), TRANSFERT
    d'un opérateur à un autre (frais pris sur le compte d'origine), entrée d'argent et sortie d'argent sur le portefeuille choisi ;
  - la COURBE donne le solde de fin de journée de chaque portefeuille suivi, depuis son premier relevé (366 jours au plus) ;
  - rangement : un seul document par utilisateur dans « reglages_plateforme » (identifiant « portefeuille:<utilisateur> ») : AUCUNE nouvelle
    collection. 400 relevés et 2 000 mouvements au plus. Effacé avec le compte.

Routes (utilisateur connecté) :
    GET    /api/portefeuille?jours=90          → portefeuilles, soldes, en cours, courbe, relevés et mouvements récents
    POST   /api/portefeuille/releves           {portefeuille, operateur?, jour?, montant}
    DELETE /api/portefeuille/releves/{id}
    POST   /api/portefeuille/mouvements        {type, portefeuille?, operateur?, vers?, montant, frais?, jour?, motif?}
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

RELEVES_MAX = 400
MOUVEMENTS_MAX = 2000
JOURS_MAX = 366
MONTANT_MAX = 1_000_000_000
STATUTS_CONFIRMES = ("effectue",)
STATUTS_EN_COURS = ("prepare", "declare")          # « declare » : PI-SPI, référence déclarée, attente du marchand
PERSONNEL = "personnel"
GENERAL = "electronique"                           # portefeuille électronique « général » (relevés du lot 86, sans opérateur)


class Releve(BaseModel):
    portefeuille: Literal["electronique", "personnel"]
    operateur: Optional[str] = Field(None, max_length=40)                 # obligatoire pour un portefeuille électronique
    jour: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")     # absent = aujourd'hui
    montant: int = Field(ge=0, le=MONTANT_MAX)


class Mouvement(BaseModel):
    type: Literal["retrait", "depot", "transfert", "entree", "sortie"]
    portefeuille: Optional[Literal["electronique", "personnel"]] = None   # seulement pour « entree » et « sortie »
    operateur: Optional[str] = Field(None, max_length=40)                 # compte mobile money concerné (origine d'un transfert)
    vers: Optional[str] = Field(None, max_length=40)                      # transfert : opérateur de destination
    montant: int = Field(gt=0, le=MONTANT_MAX)
    frais: int = Field(0, ge=0, le=MONTANT_MAX)                           # frais pris sur le compte mobile money (retrait, dépôt, transfert)
    jour: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    motif: Optional[str] = Field(None, max_length=120)


def cle(portefeuille: str, operateur: Optional[str]) -> str:
    """Clé d'un portefeuille : « personnel », « electronique:Orange », ou « electronique » (général, sans opérateur)."""
    if portefeuille == PERSONNEL:
        return PERSONNEL
    return f"{GENERAL}:{operateur}" if operateur else GENERAL


def nom_de(c: str) -> str:
    if c == PERSONNEL:
        return "Personnel"
    return f"Électronique · {c.split(':', 1)[1]}" if ":" in c else "Électronique (général)"


def _ordre(c: str) -> tuple:
    """Électroniques d'abord (par opérateur), le général ensuite, le personnel en dernier."""
    return (2, c) if c == PERSONNEL else (1, c) if c == GENERAL else (0, c)


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
def evenements(paiements: List[dict], mouvements: List[dict], debuts: Dict[str, datetime]) -> Dict[str, List[dict]]:
    """Variations de chaque portefeuille suivi : {clé: [{at, delta, libelle, en_cours}]} (triées par date).
    `debuts` = {portefeuille suivi: instant de son premier relevé} : les autres portefeuilles ne sont pas suivis.
    Paiements : seuls les effectués bougent le solde ; préparés / déclarés sont « en cours »."""
    ev: Dict[str, List[dict]] = {c: [] for c in debuts}

    def ajouter(c: str, at: datetime, delta: int, libelle: str, en_cours: bool = False) -> None:
        if c in ev:
            ev[c].append({"at": at, "delta": delta, "libelle": libelle, "en_cours": en_cours})

    for p in paiements:
        if p.get("montant") and p.get("statut") in STATUTS_CONFIRMES + STATUTS_EN_COURS:
            titre = p.get("service_nom") or "Paiement"
            if (p.get("marchand") or {}).get("libelle"):
                titre += f" · {p['marchand']['libelle']}"
            at = _dt(p["cree_le"])
            c = cle(GENERAL, p.get("operateur"))
            if c not in ev or at <= debuts[c]:              # pas (encore) de relevé pour cet opérateur à cette date : portefeuille général
                c = GENERAL
            ajouter(c, at, -int(p["montant"]), titre, p["statut"] in STATUTS_EN_COURS)
    for m in mouvements:
        at, mt, frais, motif = _dt(m["at"]), int(m["montant"]), int(m.get("frais") or 0), m.get("motif") or ""
        op = cle(GENERAL, m.get("operateur"))
        suffixe = f" (frais {frais})" if frais else ""
        if m["type"] == "retrait":                          # sortie du compte mobile money, entrée dans la poche
            ajouter(op, at, -(mt + frais), "Retrait" + suffixe)
            ajouter(PERSONNEL, at, mt, "Retrait reçu en espèces")
        elif m["type"] == "depot":                          # espèces déposées sur le compte mobile money
            ajouter(PERSONNEL, at, -mt, "Dépôt sur le compte mobile money")
            ajouter(op, at, mt - frais, "Dépôt reçu" + suffixe)
        elif m["type"] == "transfert":                      # d'un compte mobile money à un autre
            ajouter(op, at, -(mt + frais), f"Transfert vers {m.get('vers')}" + suffixe)
            ajouter(cle(GENERAL, m.get("vers")), at, mt, f"Transfert reçu de {m.get('operateur')}")
        else:                                               # entrée / sortie d'argent sur le portefeuille choisi
            ajouter(cle(m["portefeuille"], m.get("operateur")), at, mt if m["type"] == "entree" else -mt,
                    motif or ("Entrée d'argent" if m["type"] == "entree" else "Sortie d'argent"))
    for liste in ev.values():
        liste.sort(key=lambda e: e["at"])
    return ev


def _cle_releve(r: dict) -> str:
    return cle(r["portefeuille"], r.get("operateur"))


def _releves_tries(releves: List[dict], c: str) -> List[dict]:
    return sorted((r for r in releves if _cle_releve(r) == c), key=lambda r: r["at"])


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
    """Pour chaque portefeuille suivi : solde actuel, montant en cours, écarts des relevés, et courbe quotidienne commune."""
    maintenant_dt = maintenant_dt or maintenant()
    debuts: Dict[str, datetime] = {}
    for r in releves:
        c = _cle_releve(r)
        debuts[c] = min(debuts.get(c, _dt(r["at"])), _dt(r["at"]))
    ev = evenements(paiements, mouvements, debuts)
    ordre = sorted(debuts, key=_ordre)
    sortie: dict = {"portefeuilles": [{"cle": c, "nom": nom_de(c), "genre": "personnel" if c == PERSONNEL else "electronique",
                                       "operateur": c.split(":", 1)[1] if ":" in c else None} for c in ordre],
                    "soldes": {}, "ecarts": {}, "serie": []}
    debut_serie = maintenant_dt.date() - timedelta(days=jours - 1)
    courbes: Dict[str, Dict[str, Optional[int]]] = {}
    for c in ordre:
        rel = _releves_tries(releves, c)
        courant = solde_a(maintenant_dt, rel, ev[c])
        base = next((r for r in reversed(rel) if _dt(r["at"]) <= maintenant_dt), None)
        en_cours = sum(e["delta"] for e in ev[c] if e["en_cours"] and base and e["at"] > _dt(base["at"]))
        sortie["soldes"][c] = {"renseigne": courant is not None, "montant": courant, "en_cours": en_cours,
                               "apres_en_cours": None if courant is None else courant + en_cours,
                               "depuis": base["jour"] if base else None}
        # Écart de chaque relevé : ce que le calcul prévoyait juste avant, comparé à ce que l'utilisateur a déclaré
        for i, r in enumerate(rel):
            avant = solde_a(_dt(r["at"]) - timedelta(microseconds=1), rel[:i], ev[c]) if i > 0 else None
            if avant is not None:
                sortie["ecarts"][r["id"]] = int(r["montant"]) - avant
        # Courbe : solde de fin de journée, depuis le premier relevé
        courbes[c] = {}
        j = max(debut_serie, _dt(rel[0]["at"]).date())
        while j <= maintenant_dt.date():
            t = maintenant_dt if j == maintenant_dt.date() else datetime.combine(j, time(23, 59, 59), tzinfo=timezone.utc)
            courbes[c][j.isoformat()] = solde_a(t, rel, ev[c])
            j += timedelta(days=1)
    sortie["serie"] = [{"jour": j, "valeurs": {c: courbes[c].get(j) for c in ordre}} for j in sorted({j for c in ordre for j in courbes[c]})]
    sortie["_evenements"] = ev
    return sortie


# ---------------------------------------------------------------------------------------------------------------- routes
def _cle(user: dict) -> str:
    return f"portefeuille:{user['id']}"


async def _doc(user: dict) -> dict:
    return await db.reglages_plateforme.find_one({"_id": _cle(user)}) or {"releves": [], "mouvements": []}


async def _operateur_connu(operateur: Optional[str], obligatoire: bool, champ: str = "operateur") -> Optional[str]:
    """Opérateur choisi dans la liste des opérateurs du catalogue (liste finie, jamais une saisie libre)."""
    if not operateur:
        if obligatoire:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choisissez l'opérateur du compte mobile money")
        return None
    if operateur not in await db.services.distinct("operateur", {"actif": True}):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Opérateur inconnu : {operateur}")
    return operateur


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
            {"_id": 0, "id": 1, "cree_le": 1, "statut": 1, "montant": 1, "service_nom": 1, "marchand": 1, "operateur": 1}).to_list(5000)
    calcul = calculer(releves, paiements, mouvements, jours)
    ev = calcul.pop("_evenements")
    debut_par_cle = {}
    for r in releves:
        c = _cle_releve(r)
        debut_par_cle[c] = min(debut_par_cle.get(c, r["at"]), r["at"])
    return {
        **calcul,
        "releves": [{**{k: r.get(k) for k in ("id", "portefeuille", "operateur", "jour", "montant")}, "nom": nom_de(_cle_releve(r)),
                     "ecart": calcul["ecarts"].get(r["id"])} for r in sorted(releves, key=lambda r: r["at"], reverse=True)[:60]],
        "mouvements": [{**{k: m.get(k) for k in ("id", "type", "portefeuille", "operateur", "vers", "montant", "frais", "jour", "motif")}}
                       for m in sorted(mouvements, key=lambda m: m["at"], reverse=True)[:60]],
        "en_cours": [{"libelle": e["libelle"], "montant": -e["delta"], "le": e["at"].isoformat(), "portefeuille": nom_de(c)}
                     for c, evs in ev.items() for e in evs if e["en_cours"] and e["at"] > _dt(debut_par_cle[c])][-20:],
        "jours": jours,
    }


@router.post("/releves", status_code=status.HTTP_201_CREATED)
async def ajouter_releve(data: Releve, user: dict = Depends(get_current_user)):
    """« Mon solde est de X à cette date ». Les relevés s'ajoutent (on garde l'historique des recalages) ; le plus récent sert de départ.
    Un portefeuille électronique se rattache à un opérateur."""
    operateur = await _operateur_connu(data.operateur, data.portefeuille == "electronique") if data.portefeuille == "electronique" else None
    j = _jour(data.jour)
    doc = await _doc(user)
    if len(doc.get("releves") or []) >= RELEVES_MAX:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{RELEVES_MAX} relevés au maximum : supprimez les plus anciens")
    releve = {"id": str(uuid.uuid4()), "portefeuille": data.portefeuille, "operateur": operateur, "jour": j.isoformat(),
              "at": instant(j, True).isoformat(), "montant": data.montant, "cree_le": maintenant().isoformat()}
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
    """Retrait / dépôt (compte d'un opérateur ↔ poche), transfert entre deux opérateurs, entrée / sortie d'argent sur un portefeuille."""
    erreur = HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY)
    if data.type in ("retrait", "depot"):
        if data.portefeuille or data.vers:
            erreur.detail = "Un retrait ou un dépôt concerne le compte d'un opérateur et la poche"
            raise erreur
        await _operateur_connu(data.operateur, True)
    elif data.type == "transfert":
        if data.portefeuille:
            erreur.detail = "Un transfert va d'un compte mobile money à un autre"
            raise erreur
        await _operateur_connu(data.operateur, True)
        await _operateur_connu(data.vers, True, "vers")
        if data.vers == data.operateur:
            erreur.detail = "Choisissez deux opérateurs différents"
            raise erreur
    else:                                                  # entrée / sortie
        if not data.portefeuille:
            erreur.detail = "Choisissez le portefeuille concerné"
            raise erreur
        if data.frais or data.vers:
            erreur.detail = "Les frais et la destination ne concernent que les retraits, dépôts et transferts"
            raise erreur
        if data.portefeuille == "electronique":
            await _operateur_connu(data.operateur, True)
        elif data.operateur:
            erreur.detail = "Le portefeuille personnel n'a pas d'opérateur"
            raise erreur
    j = _jour(data.jour)
    doc = await _doc(user)
    if len(doc.get("mouvements") or []) >= MOUVEMENTS_MAX:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{MOUVEMENTS_MAX} mouvements au maximum")
    mouvement = {"id": str(uuid.uuid4()), "type": data.type, "portefeuille": data.portefeuille, "operateur": data.operateur, "vers": data.vers,
                 "montant": data.montant, "frais": data.frais, "jour": j.isoformat(), "at": instant(j, False).isoformat(),
                 "motif": (data.motif or "").strip(), "cree_le": maintenant().isoformat()}
    await db.reglages_plateforme.update_one({"_id": _cle(user)}, {"$set": {"user_id": user["id"]}, "$push": {"mouvements": mouvement}}, upsert=True)
    return {"ok": True, "id": mouvement["id"]}


@router.delete("/mouvements/{mouvement_id}")
async def supprimer_mouvement(mouvement_id: str, user: dict = Depends(get_current_user)):
    r = await db.reglages_plateforme.update_one({"_id": _cle(user), "mouvements.id": mouvement_id}, {"$pull": {"mouvements": {"id": mouvement_id}}})
    if not r.modified_count:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mouvement introuvable")
    return {"ok": True}
