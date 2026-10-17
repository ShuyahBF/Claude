"""Résumés de la presse (lot 62) : l'administrateur choisit les médias, le site collecte UNE fois par jour et résume.

Demande du propriétaire (17/10/2026) : « Pour les résumés de la presse, l'administrateur paramètre les liens. Chaque matin à 6 h
(heure paramétrable) tu fais le scraping une seule fois de tous ces liens et résumés. Les utilisateurs voient les résumés média par
média avec le lien pour aller tout lire. »

Pour un développeur WinDev (équivalent d'une tâche planifiée + deux fichiers) :
  - fichier `presse_sources` : un média = nom + adresse de sa page d'accueil (ou de sa rubrique), actif ou non — réglé par l'administrateur ;
  - fichier `presse_resumes` : le DERNIER passage de chaque média (articles : titre, lien, résumé) — c'est ce que lisent les utilisateurs ;
  - une boucle d'arrière-plan vérifie chaque minute s'il est l'heure choisie (6 h par défaut) et si le passage du jour n'a pas déjà eu
    lieu (verrou en base : un redémarrage du serveur ne relance JAMAIS un deuxième passage le même jour) ;
  - COLLECTE : pour chaque média, la page est lue UNE fois, on garde les 6 premiers titres d'articles du MÊME site, chaque article est lu
    UNE fois (extrait de 2 500 caractères au plus). Seules des adresses PUBLIQUES sont lues (jamais un réseau interne) ;
  - RÉSUMÉ : par l'IA de SAWALI (requête signée, un appel par média). Si SAWALI est indisponible, le début de l'article sert de repli,
    marqué « sans IA » : l'utilisateur voit toujours quelque chose ;
  - les utilisateurs ne voient que des RÉSUMÉS courts avec le lien vers l'article complet chez le média.
L'heure est l'heure du Burkina Faso (UTC+0 : identique à l'heure UTC).

Routes (utilisateur connecté) :
    GET  /api/presse                      → {medias: [{id, nom, url, maj_le, articles: [{titre, lien, resume, ia}]}], maj_le}
Routes (administrateur) :
    GET/POST /api/admin/presse/sources · PUT/DELETE /api/admin/presse/sources/{id}
    GET/PUT  /api/admin/presse/reglages   {heure: "06:00"}   → heure + dernier passage
    POST     /api/admin/presse/lancer     → lance un passage tout de suite (en arrière-plan)
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional
from urllib.parse import urldefrag, urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import SANS_ID, db
from securite import get_current_user, require_admin
from support_sawali import appeler_sawali

logger = logging.getLogger("paiement_mobile.presse")

HEURE_DEFAUT = "06:00"
MAX_SOURCES = 20
ARTICLES_PAR_MEDIA = 6
TEXTE_MAX = 2500
PAGE_MAX_OCTETS = 1_500_000
DELAI_PAGE = 15.0
AGENT = "Mozilla/5.0 (compatible; PaiementMobileRevuePresse/1.0)"

# Transport HTTP de remplacement (tests) et contrôle d'hôte public (désactivé en test) : None / True en production
_transport: Optional[httpx.AsyncBaseTransport] = None
_controle_hote = True
_taches: set = set()

router = APIRouter(tags=["Presse"])


# ---------------------------------------------------------------------------
# Fonctions pures (testées sans réseau)
# ---------------------------------------------------------------------------
def hote_public(hote: str) -> bool:
    """Vrai si TOUTES les adresses de l'hôte sont publiques (refuse localhost, réseaux privés, adresses locales : protection contre
    l'accès au réseau interne du serveur par une adresse saisie ou trouvée dans une page)."""
    if not _controle_hote:
        return True
    try:
        adresses = {i[4][0] for i in socket.getaddrinfo(hote, None)}
    except OSError:
        return False
    try:
        return bool(adresses) and all(ipaddress.ip_address(a).is_global for a in adresses)
    except ValueError:
        return False


def adresse_valide(url: str) -> bool:
    p = urlparse(url or "")
    return p.scheme in ("http", "https") and bool(p.hostname) and not p.username and (p.port in (None, 80, 443))


def meme_site(a: str, b: str) -> bool:
    """Même site (www. ignoré) : un lien vers un autre domaine n'est pas un article du média."""
    h = lambda u: (urlparse(u).hostname or "").lower().removeprefix("www.")  # noqa: E731
    return h(a) == h(b) and bool(h(a))


class _Liens(HTMLParser):
    """Récupère les liens (adresse, texte visible) d'une page, hors menus (nav, en-tête, pied de page, colonne latérale)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.liens: List[tuple] = []
        self._href: Optional[str] = None
        self._texte: List[str] = []
        self._menu = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("nav", "header", "footer", "aside"):
            self._menu += 1
        elif tag == "a" and not self._menu:
            self._href, self._texte = dict(attrs).get("href"), []

    def handle_data(self, data):
        if self._href is not None:
            self._texte.append(data)

    def handle_endtag(self, tag):
        if tag in ("nav", "header", "footer", "aside"):
            self._menu = max(0, self._menu - 1)
        elif tag == "a" and self._href is not None:
            self.liens.append((self._href, re.sub(r"\s+", " ", "".join(self._texte)).strip()))
            self._href = None


def extraire_articles(html: str, base: str, maxi: int = ARTICLES_PAR_MEDIA) -> List[Dict[str, str]]:
    """Titres d'articles d'une page d'accueil : liens du même site dont le texte ressemble à un titre (25 caractères au moins),
    sans doublon, dans l'ordre de la page."""
    p = _Liens()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001 — page mal formée : on garde ce qui a été lu
        pass
    vus, out = set(), []
    for href, texte in p.liens:
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        url = urldefrag(urljoin(base, href))[0]
        chemin = urlparse(url).path.strip("/")
        if len(texte) < 25 or not chemin or url in vus or url.rstrip("/") == base.rstrip("/") or not adresse_valide(url) or not meme_site(url, base):
            continue
        vus.add(url)
        out.append({"lien": url, "titre": texte[:300]})
        if len(out) >= maxi:
            break
    return out


class _Texte(HTMLParser):
    """Texte des paragraphes <p> d'une page (scripts, styles et menus ignorés)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paragraphes: List[str] = []
        self._dans_p = 0
        self._ignore = 0
        self._cour: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "header", "aside", "form"):
            self._ignore += 1
        elif tag == "p" and not self._ignore:
            self._dans_p, self._cour = 1, []

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "header", "aside", "form"):
            self._ignore = max(0, self._ignore - 1)
        elif tag == "p" and self._dans_p:
            t = re.sub(r"\s+", " ", "".join(self._cour)).strip()
            if len(t) >= 40:
                self.paragraphes.append(t)
            self._dans_p = 0

    def handle_data(self, data):
        if self._dans_p and not self._ignore:
            self._cour.append(data)


def extraire_texte(html: str, maxi: int = TEXTE_MAX) -> str:
    p = _Texte()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001
        pass
    return " ".join(p.paragraphes)[:maxi]


def resume_de_repli(texte: str) -> str:
    """Sans IA : les deux premières phrases de l'article (300 caractères au plus)."""
    phrases = re.split(r"(?<=[.!?])\s+", texte.strip())
    return " ".join(phrases[:2])[:300].strip()


def heure_valide(h: str) -> bool:
    return bool(re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", h or ""))


def est_l_heure(heure: str, maintenant: datetime, dernier_jour: Optional[str]) -> bool:
    """Passage dû : l'heure choisie est atteinte (heure UTC = Burkina Faso) ET le passage du jour n'a pas eu lieu."""
    return maintenant.strftime("%H:%M") >= heure and dernier_jour != maintenant.date().isoformat()


# ---------------------------------------------------------------------------
# Collecte et résumé
# ---------------------------------------------------------------------------
async def lire_page(client: httpx.AsyncClient, url: str) -> str:
    """Page HTML (texte) ; chaîne vide si illisible, trop lourde, non HTML ou hôte non public (y compris après redirection)."""
    u = url
    for _ in range(4):                                                     # redirections suivies à la main, chacune contrôlée
        if not adresse_valide(u) or not await asyncio.to_thread(hote_public, urlparse(u).hostname):
            return ""
        async with client.stream("GET", u, headers={"User-Agent": AGENT, "Accept": "text/html"}, follow_redirects=False) as r:
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                u = urljoin(u, r.headers["location"])
                continue
            if r.status_code != 200 or "html" not in r.headers.get("content-type", "html").lower():
                return ""
            morceaux, total = [], 0
            async for m in r.aiter_bytes():
                total += len(m)
                if total > PAGE_MAX_OCTETS:
                    break
                morceaux.append(m)
            return b"".join(morceaux).decode(r.encoding or "utf-8", errors="replace")
    return ""


async def collecter(source: Dict[str, Any]) -> List[Dict[str, str]]:
    """Titres + extraits des premiers articles d'un média (UNE lecture de la page d'accueil, UNE par article)."""
    async with httpx.AsyncClient(timeout=DELAI_PAGE, transport=_transport) as client:
        accueil = await lire_page(client, source["url"])
        articles = extraire_articles(accueil, source["url"])
        sem = asyncio.Semaphore(3)

        async def un(a):
            async with sem:
                try:
                    a["texte"] = extraire_texte(await lire_page(client, a["lien"]))
                except Exception:  # noqa: BLE001 — un article illisible n'arrête pas le média
                    a["texte"] = ""
            return a
        return list(await asyncio.gather(*[un(a) for a in articles]))


async def resumer(nom: str, articles: List[Dict[str, str]]) -> Dict[str, str]:
    """Résumés par l'IA de SAWALI ({lien: résumé}) ; dictionnaire vide si SAWALI est indisponible (repli appliqué ensuite)."""
    try:
        rep = await appeler_sawali("/presse-plateformes/resumer", {"media": nom, "articles": [
            {"lien": a["lien"], "titre": a["titre"], "texte": a.get("texte", "")} for a in articles]}, service="Le résumé de presse", delai=90)
        return {x["lien"]: x["resume"] for x in rep.get("resumes", []) if x.get("lien") and x.get("resume")}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Résumé IA indisponible pour %s (%s)", nom, type(exc).__name__)
        return {}


async def passage_media(source: Dict[str, Any]) -> None:
    """Collecte + résumé d'UN média, enregistré à la place du passage précédent."""
    maintenant = datetime.now(timezone.utc).isoformat()
    erreur, articles = None, []
    try:
        brut = await collecter(source)
        ia = await resumer(source["nom"], brut) if brut else {}
        for a in brut:
            r = ia.get(a["lien"])
            texte = r or resume_de_repli(a.get("texte", "")) or ""
            articles.append({"titre": a["titre"], "lien": a["lien"], "resume": texte, "ia": bool(r)})
        if not brut:
            erreur = "Aucun article trouvé sur cette page"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Collecte en échec pour %s (%s)", source["nom"], type(exc).__name__)
        erreur = "Page illisible"
    await db.presse_resumes.update_one({"source_id": source["id"]}, {"$set": {
        "source_id": source["id"], "nom": source["nom"], "url": source["url"], "articles": articles, "erreur": erreur, "maj_le": maintenant}}, upsert=True)


async def passage() -> int:
    """Passage complet : tous les médias actifs, l'un après l'autre (un seul passage à la fois)."""
    sources = await db.presse_sources.find({"actif": True}, SANS_ID).sort("ordre", 1).to_list(MAX_SOURCES)
    for s in sources:
        await passage_media(s)
    await db.presse_etat.update_one({"_id": "etat"}, {"$set": {"dernier_passage": datetime.now(timezone.utc).isoformat(), "medias": len(sources)}}, upsert=True)
    return len(sources)


async def reglage_heure() -> str:
    r = await db.presse_etat.find_one({"_id": "reglages"}) or {}
    return r.get("heure") or HEURE_DEFAUT


async def verifier_et_passer(maintenant: Optional[datetime] = None) -> bool:
    """Lance le passage du jour s'il est dû. Le jour est RÉSERVÉ en base avant de commencer : deux instances du serveur ou un redémarrage
    ne peuvent pas déclencher deux passages le même jour."""
    maintenant = maintenant or datetime.now(timezone.utc)
    etat = await db.presse_etat.find_one({"_id": "etat"}) or {}
    if not est_l_heure(await reglage_heure(), maintenant, etat.get("dernier_jour")):
        return False
    jour = maintenant.date().isoformat()
    if etat:
        pris = await db.presse_etat.update_one({"_id": "etat", "dernier_jour": {"$ne": jour}}, {"$set": {"dernier_jour": jour}})
        if not pris.modified_count:
            return False
    else:
        try:
            await db.presse_etat.insert_one({"_id": "etat", "dernier_jour": jour})
        except Exception:  # noqa: BLE001 — une autre instance vient de le faire
            return False
    await passage()
    return True


async def boucle_presse() -> None:
    """Vérifie chaque minute, sans jamais s'arrêter."""
    while True:
        try:
            await verifier_et_passer()
        except Exception:  # noqa: BLE001
            logger.exception("Passage de presse en échec")
        await asyncio.sleep(60)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
class SourceIn(BaseModel):
    nom: str = Field(..., min_length=2, max_length=60)
    url: str = Field(..., min_length=8, max_length=300)
    actif: bool = True


class ReglagesIn(BaseModel):
    heure: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


@router.get("/presse")
async def lire(_: dict = Depends(get_current_user)):
    lignes = await db.presse_resumes.find({"articles.0": {"$exists": True}}, SANS_ID).to_list(MAX_SOURCES)
    actifs = {s["id"]: s.get("ordre", 0) for s in await db.presse_sources.find({"actif": True}, SANS_ID).to_list(MAX_SOURCES)}
    medias = sorted((m for m in lignes if m["source_id"] in actifs), key=lambda m: actifs[m["source_id"]])
    return {"medias": [{"id": m["source_id"], "nom": m["nom"], "url": m["url"], "maj_le": m["maj_le"], "articles": m["articles"]} for m in medias],
            "maj_le": max((m["maj_le"] for m in medias), default=None)}


def valider_source(d: SourceIn) -> Dict[str, Any]:
    if not adresse_valide(d.url.strip()):
        raise HTTPException(status_code=422, detail="Adresse invalide : elle doit commencer par http:// ou https://")
    return {"nom": d.nom.strip(), "url": d.url.strip(), "actif": d.actif}


@router.get("/admin/presse/sources")
async def sources(_: dict = Depends(require_admin)):
    lignes = await db.presse_sources.find({}, SANS_ID).sort("ordre", 1).to_list(MAX_SOURCES)
    etat = {r["source_id"]: r for r in await db.presse_resumes.find({}, SANS_ID).to_list(MAX_SOURCES)}
    return {"sources": [{**s, "maj_le": (etat.get(s["id"]) or {}).get("maj_le"), "erreur": (etat.get(s["id"]) or {}).get("erreur"),
                         "nb_articles": len((etat.get(s["id"]) or {}).get("articles") or [])} for s in lignes]}


@router.post("/admin/presse/sources", status_code=201)
async def ajouter(d: SourceIn, _: dict = Depends(require_admin)):
    if await db.presse_sources.count_documents({}) >= MAX_SOURCES:
        raise HTTPException(status_code=409, detail=f"{MAX_SOURCES} médias au plus")
    doc = {"id": str(uuid.uuid4()), **valider_source(d), "ordre": await db.presse_sources.count_documents({})}
    await db.presse_sources.insert_one(doc.copy())
    return doc


@router.put("/admin/presse/sources/{source_id}")
async def modifier(source_id: str, d: SourceIn, _: dict = Depends(require_admin)):
    r = await db.presse_sources.update_one({"id": source_id}, {"$set": valider_source(d)})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Média introuvable")
    return {"ok": True}


@router.delete("/admin/presse/sources/{source_id}")
async def supprimer(source_id: str, _: dict = Depends(require_admin)):
    r = await db.presse_sources.delete_one({"id": source_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Média introuvable")
    await db.presse_resumes.delete_one({"source_id": source_id})
    return {"ok": True}


@router.get("/admin/presse/reglages")
async def reglages(_: dict = Depends(require_admin)):
    etat = await db.presse_etat.find_one({"_id": "etat"}) or {}
    return {"heure": await reglage_heure(), "dernier_jour": etat.get("dernier_jour"), "dernier_passage": etat.get("dernier_passage")}


@router.put("/admin/presse/reglages")
async def regler(d: ReglagesIn, _: dict = Depends(require_admin)):
    await db.presse_etat.update_one({"_id": "reglages"}, {"$set": {"heure": d.heure}}, upsert=True)
    return {"ok": True, "heure": d.heure}


@router.post("/admin/presse/lancer")
async def lancer(_: dict = Depends(require_admin)):
    """Passage immédiat, en arrière-plan (la page répond tout de suite ; le résultat apparaît dans la liste des médias)."""
    t = asyncio.get_running_loop().create_task(passage())
    _taches.add(t)
    t.add_done_callback(_taches.discard)
    return {"ok": True}
