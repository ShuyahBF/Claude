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

Lot 65 (17/10/2026) — « Actualités » : les médias sont rangés par CATÉGORIE (Presse locale, Tech, Mode, Coaching personnel… et toutes celles
que l'administrateur crée). Des médias PRÉDÉFINIS (flux vérifiés) sont semés une seule fois ; l'administrateur peut en ajouter, désactiver ou
retirer. Une adresse peut être une page web OU un FLUX RSS/Atom (préférable : fiable, avec titres, extraits et images).
ILLUSTRATIONS : seules des photos et dessins (jamais de vidéos) ; on garde seulement l'ADRESSE de l'image, affichée depuis le site du média
(aucune copie n'est faite ici), avec le lien vers l'article complet.

Routes (utilisateur connecté) :
    GET  /api/presse                      → {medias: [{id, nom, url, maj_le, articles: [{titre, lien, resume, ia}]}], maj_le}
Routes (administrateur) :
    GET/POST /api/admin/presse/sources · PUT/DELETE /api/admin/presse/sources/{id}
    GET/PUT  /api/admin/presse/reglages   {heure: "06:00"}   → heure + dernier passage
    POST     /api/admin/presse/lancer     → lance un passage tout de suite (en arrière-plan)
"""
from __future__ import annotations

import asyncio
import html as html_lib
import ipaddress
import logging
import re
import socket
import uuid
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
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
MAX_SOURCES = 40
MAX_CATEGORIES = 12
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


EXT_VIDEO = (".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".m3u8", ".mpd", ".gif")      # gif exclu : souvent animé


def image_valide(url: str, type_mime: str = "", medium: str = "") -> bool:
    """Adresse d'une PHOTO ou d'un DESSIN (jamais d'une vidéo) : http(s) uniquement, pas de vidéo ni d'animation, pas trop longue.
    L'image n'est jamais téléchargée ici : seule son adresse est gardée."""
    u = (url or "").strip()
    if not u or len(u) > 600 or not adresse_valide(u):
        return False
    if (type_mime or "").lower().startswith(("video/", "audio/")) or (medium or "").lower() in ("video", "audio"):
        return False
    return not urlparse(u).path.lower().endswith(EXT_VIDEO)


class _Images(HTMLParser):
    """Balises <img> d'un fragment HTML (largeur et hauteur lues pour écarter les pastilles de suivi de 1 pixel)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        a = dict(attrs)
        src = (a.get("src") or a.get("data-src") or "").strip()
        try:
            petit = any(int(re.sub(r"\D", "", a.get(k) or "") or 999) < 50 for k in ("width", "height"))
        except ValueError:
            petit = False
        if src and not petit:
            self.images.append(src)


def images_du_html(fragment: str) -> List[str]:
    p = _Images()
    try:
        p.feed(fragment or "")
    except Exception:  # noqa: BLE001
        pass
    return p.images


def image_og(html: str, base: str) -> str:
    """Image de partage d'une page d'article (balise <meta property="og:image">), ou chaîne vide."""
    for m in re.finditer(r"<meta[^>]+>", html or "", re.I):
        t = m.group(0)
        if re.search(r"""(property|name)\s*=\s*["']?(og:image|twitter:image)""", t, re.I):
            c = re.search(r"""content\s*=\s*["']([^"']+)["']""", t, re.I)
            if c:
                u = urljoin(base, html_lib.unescape(c.group(1)).strip())
                if image_valide(u):
                    return u
    return ""


def image_insuffisante(url: str) -> bool:
    """Vrai si le flux n'a donné AUCUNE image ou seulement une miniature (ex. Lefaso.net : .../cache-vignettes/L150xH101/...).
    Dans ce cas on cherche l'image de partage (og:image) dans la page de l'article."""
    if not url:
        return True
    m = re.search(r"/L(\d+)xH(\d+)/", url)
    return bool((m and int(m.group(1)) < 400) or "vignette" in url.lower() and not re.search(r"\d{3,4}x\d{3,4}", url))


def texte_depuis_html(fragment: str, maxi: int = TEXTE_MAX) -> str:
    """Texte brut d'un extrait de flux (HTML parfois échappé deux fois) : balises retirées, espaces réduits."""
    t = html_lib.unescape(fragment or "")
    t = re.sub(r"<[^>]+>", " ", html_lib.unescape(t) if "<" not in t else t)
    return re.sub(r"\s+", " ", t).strip()[:maxi]


def est_un_flux(texte: str) -> bool:
    """Le contenu lu est-il un flux RSS ou Atom (et non une page web) ?"""
    debut = (texte or "")[:800].lower()
    return "<rss" in debut or "<feed" in debut or "<rdf:rdf" in debut or ("<?xml" in debut and ("<channel" in (texte or "")[:3000].lower()))


def _local(tag: Any) -> str:
    return str(tag).rsplit("}", 1)[-1].lower()


def lire_flux(texte: str, maxi: int = ARTICLES_PAR_MEDIA) -> List[Dict[str, str]]:
    """Articles d'un flux RSS / Atom : [{titre, lien, texte, image}]. L'image est l'image jointe (media:content, media:thumbnail,
    enclosure) ou, à défaut, la première image du texte ; jamais une vidéo. ValueError si le flux est illisible."""
    try:
        racine = ET.fromstring(texte.strip().encode("utf-8", errors="replace"))
    except ET.ParseError as exc:
        raise ValueError("flux illisible") from exc
    out: List[Dict[str, str]] = []
    for it in racine.iter():
        if _local(it.tag) not in ("item", "entry"):
            continue
        titre, lien, corps, candidats = "", "", "", []
        for e in it:
            n = _local(e.tag)
            contenu = "".join(e.itertext())
            if n == "title" and not titre:
                titre = texte_depuis_html(contenu, 300)
            elif n == "link" and not lien and e.get("rel") in (None, "alternate"):
                lien = (e.get("href") or contenu).strip()
            elif n in ("encoded", "description", "summary") or (n == "content" and not e.get("url")):
                # Le texte le plus long est gardé (content:encoded en général) ; il sert aussi à trouver une image
                if n == "encoded" or len(html_lib.unescape(contenu)) > len(corps):
                    corps = html_lib.unescape(contenu)
            if n in ("content", "thumbnail") and e.get("url"):
                candidats.append((e.get("url") or "", e.get("type") or "", e.get("medium") or ""))    # media:content / media:thumbnail
            elif n == "enclosure":
                candidats.append((e.get("url") or "", e.get("type") or "", ""))                      # pièce jointe (image ou, à écarter, vidéo)
        image = next((u.strip() for u, t, m in candidats if image_valide(u, t, m)), "")
        if not image:
            image = next((u for u in images_du_html(corps) if image_valide(u)), "")
        if titre and lien and adresse_valide(lien):
            out.append({"titre": titre, "lien": lien, "texte": texte_depuis_html(corps), "image": image})
        if len(out) >= maxi:
            break
    return out


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
            ct = r.headers.get("content-type", "html").lower()
            if r.status_code != 200 or not any(k in ct for k in ("html", "xml", "text")):
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
    """Articles d'un média : [{titre, lien, texte, image}].
    - flux RSS / Atom : UNE seule lecture (titres, extraits et images viennent du flux) ;
    - page web : UNE lecture de la page, puis UNE par article (texte + image de partage)."""
    async with httpx.AsyncClient(timeout=DELAI_PAGE, transport=_transport) as client:
        accueil = await lire_page(client, source["url"])
        if est_un_flux(accueil):
            try:
                articles = lire_flux(accueil)
            except ValueError:
                return []
            # Image manquante ou miniature dans le flux (ex. Burkina24, Lefaso.net) : une lecture de la page de l'article pour son image de partage
            sem_flux = asyncio.Semaphore(3)

            async def completer(a):
                if image_insuffisante(a.get("image", "")) and a.get("lien"):
                    async with sem_flux:
                        try:
                            img = image_og(await lire_page(client, a["lien"]), a["lien"])
                            if img:
                                a["image"] = img
                        except Exception:  # noqa: BLE001 — un article illisible garde l'image du flux, ou aucune
                            pass
                return a
            return list(await asyncio.gather(*[completer(a) for a in articles]))
        articles = extraire_articles(accueil, source["url"])
        sem = asyncio.Semaphore(3)

        async def un(a):
            async with sem:
                try:
                    page = await lire_page(client, a["lien"])
                    a["texte"], a["image"] = extraire_texte(page), image_og(page, a["lien"])
                except Exception:  # noqa: BLE001 — un article illisible n'arrête pas le média
                    a["texte"], a["image"] = "", ""
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
            articles.append({"titre": a["titre"], "lien": a["lien"], "resume": texte, "ia": bool(r), "image": a.get("image") or ""})
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
# ---------------------------------------------------------------------------
# Catégories et médias prédéfinis (lot 65) — flux vérifiés le 17/10/2026 (réponse correcte, articles et images présents).
# Semés UNE seule fois (drapeau « semis ») : ce que l'administrateur modifie ou retire ensuite n'est jamais recréé.
# ---------------------------------------------------------------------------
CATEGORIES_DEFAUT = [
    ("Presse locale", "📰", [
        ("Burkina24", "https://burkina24.com/feed/"), ("Lefaso.net", "https://lefaso.net/spip.php?page=backend"),
        ("Sidwaya", "https://www.sidwaya.info/feed/"), ("Wakat Séra", "https://wakatsera.com/feed/")]),
    ("Tech", "💻", [
        ("Numerama", "https://www.numerama.com/feed/"), ("Frandroid", "https://www.frandroid.com/feed"),
        ("Le Monde Pixels", "https://www.lemonde.fr/pixels/rss_full.xml"), ("Siècle Digital", "https://siecledigital.fr/feed/"),
        ("Clubic", "https://www.clubic.com/feed/news.rss"), ("Journal du Geek", "https://www.journaldugeek.com/feed/")]),
    ("Mode", "👗", [
        ("Vogue France", "https://www.vogue.fr/feed/rss"), ("Le Monde M Mode", "https://www.lemonde.fr/m-mode/rss_full.xml"),
        ("Harper's Bazaar", "https://www.harpersbazaar.com/rss/all.xml/"), ("Who What Wear", "https://www.whowhatwear.com/rss")]),
    ("Coaching personnel", "🧠", [
        ("Psychologies", "https://www.psychologies.com/rss/"), ("Le Monde Psychologie", "https://www.lemonde.fr/psychologie/rss_full.xml"),
        ("Le Monde M perso", "https://www.lemonde.fr/m-perso/rss_full.xml"), ("Tiny Buddha", "https://tinybuddha.com/feed/"),
        ("Lifehack", "https://www.lifehack.org/feed")]),
]
ICONES = ["📰", "💻", "👗", "🧠", "⚽", "🎬", "🎵", "💼", "🌍", "🍽️", "🏥", "🚗", "📚", "🌱"]     # liste proposée ; « Autre… » = saisie libre


async def semer() -> bool:
    """Catégories et médias prédéfinis, une seule fois ; les médias saisis avant le lot 65 passent dans « Presse locale »."""
    if await db.presse_etat.find_one({"_id": "semis"}):
        return False
    try:
        await db.presse_etat.insert_one({"_id": "semis", "fait_le": datetime.now(timezone.utc).isoformat()})
    except Exception:  # noqa: BLE001 — une autre instance du serveur vient de le faire
        return False
    existantes = {s["url"] for s in await db.presse_sources.find({}, SANS_ID).to_list(MAX_SOURCES)}
    ordre_cat, ordre_src = 0, await db.presse_sources.count_documents({})
    for nom, icone, medias in CATEGORIES_DEFAUT:
        cat = {"id": str(uuid.uuid4()), "nom": nom, "icone": icone, "ordre": ordre_cat}
        ordre_cat += 1
        await db.presse_categories.insert_one(cat.copy())
        if nom == "Presse locale":                                   # les médias déjà saisis rejoignent cette catégorie
            await db.presse_sources.update_many({"categorie_id": {"$exists": False}}, {"$set": {"categorie_id": cat["id"]}})
        for n, u in medias:
            if u in existantes:
                continue
            await db.presse_sources.insert_one({"id": str(uuid.uuid4()), "nom": n, "url": u, "actif": True, "ordre": ordre_src,
                                                "categorie_id": cat["id"], "predefini": True})
            ordre_src += 1
    return True


class CategorieIn(BaseModel):
    nom: str = Field(..., min_length=2, max_length=40)
    icone: str = Field("📰", min_length=1, max_length=8)


class SourceIn(BaseModel):
    nom: str = Field(..., min_length=2, max_length=60)
    url: str = Field(..., min_length=8, max_length=300)
    actif: bool = True
    categorie_id: Optional[str] = Field(None, max_length=60)      # absent : première catégorie


class ReglagesIn(BaseModel):
    heure: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


async def categories_triees() -> List[Dict[str, Any]]:
    return await db.presse_categories.find({}, SANS_ID).sort("ordre", 1).to_list(MAX_CATEGORIES)


@router.get("/presse")
async def lire(_: dict = Depends(get_current_user)):
    """Actualités rangées par catégorie ; les catégories sans article du jour ne sont pas montrées."""
    lignes = {m["source_id"]: m for m in await db.presse_resumes.find({"articles.0": {"$exists": True}}, SANS_ID).to_list(MAX_SOURCES)}
    sources_actives = await db.presse_sources.find({"actif": True}, SANS_ID).sort("ordre", 1).to_list(MAX_SOURCES)
    categories, dernier = [], None
    for c in await categories_triees():
        medias = []
        for s in sources_actives:
            m = lignes.get(s["id"])
            if s.get("categorie_id") == c["id"] and m:
                medias.append({"id": s["id"], "nom": m["nom"], "url": m["url"], "maj_le": m["maj_le"], "articles": m["articles"]})
                dernier = max(dernier or "", m["maj_le"])
        if medias:
            categories.append({"id": c["id"], "nom": c["nom"], "icone": c["icone"], "medias": medias})
    return {"categories": categories, "maj_le": dernier}


async def categorie_pour(d: SourceIn) -> str:
    """Catégorie choisie (elle doit exister) ou, à défaut, la première."""
    if d.categorie_id:
        if not await db.presse_categories.find_one({"id": d.categorie_id}):
            raise HTTPException(status_code=422, detail="Catégorie inconnue")
        return d.categorie_id
    premiere = await db.presse_categories.find_one({}, SANS_ID, sort=[("ordre", 1)])
    if not premiere:
        raise HTTPException(status_code=409, detail="Créez d'abord une catégorie")
    return premiere["id"]


async def valider_source(d: SourceIn) -> Dict[str, Any]:
    if not adresse_valide(d.url.strip()):
        raise HTTPException(status_code=422, detail="Adresse invalide : elle doit commencer par http:// ou https://")
    return {"nom": d.nom.strip(), "url": d.url.strip(), "actif": d.actif, "categorie_id": await categorie_pour(d)}


@router.get("/admin/presse/categories")
async def categories(_: dict = Depends(require_admin)):
    await semer()
    return {"categories": await categories_triees(), "icones": ICONES}


@router.post("/admin/presse/categories", status_code=201)
async def creer_categorie(d: CategorieIn, _: dict = Depends(require_admin)):
    if await db.presse_categories.count_documents({}) >= MAX_CATEGORIES:
        raise HTTPException(status_code=409, detail=f"{MAX_CATEGORIES} catégories au plus")
    if await db.presse_categories.find_one({"nom": {"$regex": f"^{re.escape(d.nom.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="Cette catégorie existe déjà")
    doc = {"id": str(uuid.uuid4()), "nom": d.nom.strip(), "icone": d.icone.strip(), "ordre": await db.presse_categories.count_documents({})}
    await db.presse_categories.insert_one(doc.copy())
    return doc


@router.put("/admin/presse/categories/{categorie_id}")
async def modifier_categorie(categorie_id: str, d: CategorieIn, _: dict = Depends(require_admin)):
    r = await db.presse_categories.update_one({"id": categorie_id}, {"$set": {"nom": d.nom.strip(), "icone": d.icone.strip()}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    return {"ok": True}


@router.delete("/admin/presse/categories/{categorie_id}")
async def supprimer_categorie(categorie_id: str, avec_medias: bool = False, _: dict = Depends(require_admin)):
    """Une catégorie qui contient des médias n'est supprimée que si l'administrateur le demande (avec_medias=true)."""
    ids = [s["id"] for s in await db.presse_sources.find({"categorie_id": categorie_id}, SANS_ID).to_list(MAX_SOURCES)]
    if ids and not avec_medias:
        raise HTTPException(status_code=409, detail=f"Cette catégorie contient {len(ids)} média(s) : retirez-les d'abord ou confirmez leur suppression")
    r = await db.presse_categories.delete_one({"id": categorie_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    await db.presse_sources.delete_many({"categorie_id": categorie_id})
    await db.presse_resumes.delete_many({"source_id": {"$in": ids}})
    return {"ok": True, "medias_supprimes": len(ids)}


@router.get("/admin/presse/sources")
async def sources(_: dict = Depends(require_admin)):
    await semer()
    lignes = await db.presse_sources.find({}, SANS_ID).sort("ordre", 1).to_list(MAX_SOURCES)
    etat = {r["source_id"]: r for r in await db.presse_resumes.find({}, SANS_ID).to_list(MAX_SOURCES)}
    return {"sources": [{**s, "maj_le": (etat.get(s["id"]) or {}).get("maj_le"), "erreur": (etat.get(s["id"]) or {}).get("erreur"),
                         "nb_articles": len((etat.get(s["id"]) or {}).get("articles") or []),
                         "nb_images": sum(1 for a in ((etat.get(s["id"]) or {}).get("articles") or []) if a.get("image"))} for s in lignes]}


@router.post("/admin/presse/sources", status_code=201)
async def ajouter(d: SourceIn, _: dict = Depends(require_admin)):
    if await db.presse_sources.count_documents({}) >= MAX_SOURCES:
        raise HTTPException(status_code=409, detail=f"{MAX_SOURCES} médias au plus")
    doc = {"id": str(uuid.uuid4()), **await valider_source(d), "ordre": await db.presse_sources.count_documents({})}
    await db.presse_sources.insert_one(doc.copy())
    return doc


@router.put("/admin/presse/sources/{source_id}")
async def modifier(source_id: str, d: SourceIn, _: dict = Depends(require_admin)):
    r = await db.presse_sources.update_one({"id": source_id}, {"$set": await valider_source(d)})
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
