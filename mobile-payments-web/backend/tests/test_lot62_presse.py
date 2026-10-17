"""Lot 62 — résumés de la presse : sources réglées par l'administrateur, collecte quotidienne unique, résumés par média. Réseau simulé."""
import asyncio
import json
from datetime import datetime, timezone

import httpx
import pytest

import support_sawali
from config import get_settings
from routes import presse

ACCUEIL = """<html><body><nav><a href="/politique-de-confidentialite-complete-du-site">Politique de confidentialité du site</a></nav>
<a href="/actu/le-gouvernement-annonce-un-plan-de-soutien-aux-commercants">Le gouvernement annonce un plan de soutien aux commerçants</a>
<a href="https://autre-site.test/article-tres-long-qui-ne-doit-pas-etre-pris">Un article venant d'un autre site à ignorer</a>
<a href="/actu/la-saison-des-pluies-debute-dans-le-sud-ouest-du-pays">La saison des pluies débute dans le Sud-Ouest du pays</a>
<a href="#haut">Retour en haut de la page vers le début</a><a href="/court">Court</a></body></html>"""
ARTICLE = """<html><body><header><p>Menu du site avec beaucoup de texte de navigation à ignorer ici</p></header><script>var x=1;</script>
<p>Le gouvernement a présenté ce matin un plan de soutien destiné aux commerçants des marchés. Les mesures débuteront le mois prochain.</p>
<p>Court</p><p>Les commerçants salueront cette décision qui répond à une longue attente dans le secteur du commerce.</p></body></html>"""


FLUX = """<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Média test</title>
<item><title>Article avec image jointe</title><link>https://media.test/a1</link><description>Premier extrait de l'article, assez long pour être résumé.</description>
<media:content url="https://img.media.test/photo1.jpg" type="image/jpeg"/></item>
<item><title>Article avec vignette</title><link>https://media.test/a2</link><media:content/><description>Deuxième extrait de l'article.</description>
<media:thumbnail url="https://img.media.test/vignette2.jpeg" width="960" height="1200"/></item>
<item><title>Article dont la pièce jointe est une vidéo</title><link>https://media.test/a3</link><description>Troisième extrait.</description>
<enclosure url="https://img.media.test/clip.mp4" type="video/mp4" length="1"/>
<content:encoded><![CDATA[<p>Texte.</p><img src="https://img.media.test/pixel.png" width="1" height="1"><img src="https://img.media.test/dessin3.png" width="640" height="400">]]></content:encoded></item>
<item><title>Article sans aucune image</title><link>https://media.test/a4</link><description>&lt;p&gt;Quatrième extrait &lt;b&gt;échappé&lt;/b&gt; deux fois.&lt;/p&gt;</description></item>
</channel></rss>"""


@pytest.fixture
def sans_semis():
    """Désactive le semis des médias prédéfinis (les tests créent leurs propres catégories et médias)."""
    asyncio.run(presse.db.presse_etat.update_one({"_id": "semis"}, {"$set": {"fait": True}}, upsert=True))


@pytest.fixture(autouse=True)
def reseau():
    # Base de la presse remise à zéro avant chaque essai (la base en mémoire est partagée entre les essais)
    async def vider():
        for nom in ("presse_categories", "presse_sources", "presse_resumes", "presse_etat"):
            await getattr(presse.db, nom).delete_many({})
    asyncio.run(vider())
    presse._controle_hote = False
    pages = {"/": ACCUEIL}

    def site(q: httpx.Request) -> httpx.Response:
        if q.url.path == "/feed":
            return httpx.Response(200, text=FLUX, headers={"content-type": "application/rss+xml; charset=utf-8"})
        if q.url.path.startswith("/actu/"):
            return httpx.Response(200, text=ARTICLE, headers={"content-type": "text/html; charset=utf-8"})
        return httpx.Response(200, text=pages.get(q.url.path, ""), headers={"content-type": "text/html; charset=utf-8"})

    presse._transport = httpx.MockTransport(site)
    yield
    presse._transport, presse._controle_hote = None, True


@pytest.fixture
def sawali():
    recues, mode = [], {"ok": True}

    def repondre(q: httpx.Request) -> httpx.Response:
        recues.append(q)
        if not mode["ok"]:
            return httpx.Response(503, json={"detail": "indisponible"})
        corps = json.loads(q.content)
        return httpx.Response(200, json={"resumes": [{"lien": corps["articles"][0]["lien"], "resume": "Résumé IA du premier article, fidèle au texte."}]})

    r = get_settings()
    ancienne = r.liluvine_wa_hmac
    r.liluvine_wa_hmac = "cle-de-test"
    support_sawali._transport = httpx.MockTransport(repondre)
    yield recues, mode
    r.liluvine_wa_hmac = ancienne
    support_sawali._transport = None


def test_extraction_articles_et_texte():
    arts = presse.extraire_articles(ACCUEIL, "https://journal.test/")
    assert [a["lien"] for a in arts] == ["https://journal.test/actu/le-gouvernement-annonce-un-plan-de-soutien-aux-commercants",
                                         "https://journal.test/actu/la-saison-des-pluies-debute-dans-le-sud-ouest-du-pays"]
    assert all(a["lien"].startswith("https://journal.test/") for a in arts)            # lien d'un autre site écarté
    assert not any("#haut" in a["lien"] or a["titre"] == "Court" for a in arts)
    texte = presse.extraire_texte(ARTICLE)
    assert "plan de soutien" in texte and "Menu du site" not in texte and "var x" not in texte and "Court" not in texte.split(". ")[-1][:5]


def test_heure_et_repli():
    t = datetime(2026, 10, 18, 6, 5, tzinfo=timezone.utc)
    assert presse.est_l_heure("06:00", t, None) and not presse.est_l_heure("06:00", t, "2026-10-18") and not presse.est_l_heure("07:00", t, None)
    assert presse.heure_valide("06:00") and not presse.heure_valide("6h") and not presse.heure_valide("24:00")
    assert presse.resume_de_repli("Première phrase. Deuxième phrase! Troisième phrase.") == "Première phrase. Deuxième phrase!"


def test_hote_public_refuse_le_reseau_interne():
    presse._controle_hote = True
    assert not presse.hote_public("localhost") and not presse.hote_public("127.0.0.1") and not presse.hote_public("192.168.1.10")
    assert not presse.adresse_valide("file:///etc/passwd") and not presse.adresse_valide("http://u:p@site.test/") and presse.adresse_valide("https://site.test/x")


def test_admin_sources_et_lecture(client, admin, utilisateur, sawali, sans_semis):
    _, h, _ = utilisateur
    client.post("/api/admin/presse/categories", headers=admin, json={"nom": "Presse locale", "icone": "📰"})
    assert client.get("/api/admin/presse/sources", headers=h).status_code in (401, 403)
    r = client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/"})
    assert r.status_code == 201
    assert client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Mauvais", "url": "ftp://x.test/"}).status_code == 422
    assert client.put("/api/admin/presse/reglages", headers=admin, json={"heure": "6h"}).status_code == 422
    assert client.put("/api/admin/presse/reglages", headers=admin, json={"heure": "05:30"}).json()["heure"] == "05:30"
    # Rien de collecté : les utilisateurs ne voient rien
    assert client.get("/api/presse", headers=h).json()["categories"] == []
    asyncio.run(presse.passage())
    medias = client.get("/api/presse", headers=h).json()["categories"][0]["medias"]
    assert len(medias) == 1 and medias[0]["nom"] == "Le Journal" and len(medias[0]["articles"]) == 2
    a = medias[0]["articles"]
    assert a[0]["ia"] is True and "Résumé IA" in a[0]["resume"]
    assert a[1]["ia"] is False and a[1]["resume"].startswith("Le gouvernement a présenté")           # repli sans IA
    # Média désactivé : plus visible
    sid = client.get("/api/admin/presse/sources", headers=admin).json()["sources"][0]["id"]
    client.put(f"/api/admin/presse/sources/{sid}", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/", "actif": False})
    assert client.get("/api/presse", headers=h).json()["categories"] == []
    assert client.delete(f"/api/admin/presse/sources/{sid}", headers=admin).status_code == 200


def test_sawali_indisponible_repli(client, admin, utilisateur, sawali, sans_semis):
    client.post("/api/admin/presse/categories", headers=admin, json={"nom": "Presse locale", "icone": "📰"})
    _, mode = sawali
    mode["ok"] = False
    client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/"})
    asyncio.run(presse.passage())
    arts = client.get("/api/presse", headers=utilisateur[1]).json()["categories"][0]["medias"][0]["articles"]
    assert arts and all(not x["ia"] and x["resume"] for x in arts)


def test_un_seul_passage_par_jour(client, admin, sawali, sans_semis):
    client.post("/api/admin/presse/categories", headers=admin, json={"nom": "Presse locale", "icone": "📰"})
    recues, _ = sawali
    client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/"})
    t = datetime(2026, 10, 18, 6, 1, tzinfo=timezone.utc)
    assert asyncio.run(presse.verifier_et_passer(t)) is True
    appels = len(recues)
    assert asyncio.run(presse.verifier_et_passer(t.replace(hour=9))) is False            # même jour : aucun nouveau passage
    assert len(recues) == appels
    assert asyncio.run(presse.verifier_et_passer(t.replace(day=19))) is True              # lendemain : nouveau passage


# ---------------------------------------------------------------------------
# Lot 65 — catégories, flux RSS, illustrations (jamais de vidéo)
# ---------------------------------------------------------------------------
def test_images_photos_et_dessins_seulement():
    assert presse.image_valide("https://img.test/a.jpg") and presse.image_valide("https://img.test/a?w=600&fmt=webp")
    assert not presse.image_valide("https://img.test/clip.mp4") and not presse.image_valide("https://img.test/a.gif")
    assert not presse.image_valide("https://img.test/a", type_mime="video/mp4") and not presse.image_valide("https://img.test/a", medium="video")
    assert not presse.image_valide("data:image/png;base64,AAAA") and not presse.image_valide("ftp://x.test/a.jpg") and not presse.image_valide("")


def test_lecture_d_un_flux_rss():
    assert presse.est_un_flux(FLUX) and not presse.est_un_flux(ACCUEIL)
    a = presse.lire_flux(FLUX)
    assert [x["titre"] for x in a] == ["Article avec image jointe", "Article avec vignette", "Article dont la pièce jointe est une vidéo", "Article sans aucune image"]
    assert a[0]["image"] == "https://img.media.test/photo1.jpg"
    assert a[1]["image"] == "https://img.media.test/vignette2.jpeg"
    assert a[2]["image"] == "https://img.media.test/dessin3.png"           # vidéo et pastille de 1 pixel écartées
    assert a[3]["image"] == "" and a[3]["texte"] == "Quatrième extrait échappé deux fois."
    with pytest.raises(ValueError):
        presse.lire_flux("<rss><channel><item></rss>")


def test_image_de_partage_d_une_page():
    page = '<html><head><meta property="og:image" content="/media/une.jpg"><meta name="x" content="y"></head></html>'
    assert presse.image_og(page, "https://journal.test/a") == "https://journal.test/media/une.jpg"
    assert presse.image_og('<meta property="og:image" content="https://v.test/film.mp4">', "https://journal.test/") == ""


def test_collecte_d_un_flux_garde_les_images(client, admin, utilisateur, sawali, sans_semis):
    cat = client.post("/api/admin/presse/categories", headers=admin, json={"nom": "Tech", "icone": "💻"}).json()
    r = client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Média test", "url": "https://media.test/feed", "categorie_id": cat["id"]})
    assert r.status_code == 201
    asyncio.run(presse.passage())
    c = client.get("/api/presse", headers=utilisateur[1]).json()["categories"]
    assert [x["nom"] for x in c] == ["Tech"]
    arts = c[0]["medias"][0]["articles"]
    assert [bool(a["image"]) for a in arts] == [True, True, True, False]
    s = client.get("/api/admin/presse/sources", headers=admin).json()["sources"][0]
    assert s["nb_articles"] == 4 and s["nb_images"] == 3


def test_semis_des_medias_predefinis_une_seule_fois(client, admin):
    assert asyncio.run(presse.semer()) is True and asyncio.run(presse.semer()) is False
    cats = client.get("/api/admin/presse/categories", headers=admin).json()
    assert [c["nom"] for c in cats["categories"]] == ["Presse locale", "Tech", "Mode", "Coaching personnel"] and "📰" in cats["icones"]
    sources = client.get("/api/admin/presse/sources", headers=admin).json()["sources"]
    assert len(sources) == sum(len(m) for _, _, m in presse.CATEGORIES_DEFAUT) and all(s["actif"] and s["predefini"] for s in sources)
    # Ce que l'administrateur retire n'est jamais recréé
    client.delete(f"/api/admin/presse/sources/{sources[0]['id']}", headers=admin)
    assert asyncio.run(presse.semer()) is False
    assert len(client.get("/api/admin/presse/sources", headers=admin).json()["sources"]) == len(sources) - 1


def test_categories_creation_suppression(client, admin, sans_semis):
    r = client.post("/api/admin/presse/categories", headers=admin, json={"nom": "Sport", "icone": "⚽"})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert client.post("/api/admin/presse/categories", headers=admin, json={"nom": "sport", "icone": "⚽"}).status_code == 409        # doublon
    assert client.put(f"/api/admin/presse/categories/{cid}", headers=admin, json={"nom": "Sports", "icone": "⚽"}).status_code == 200
    assert client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Média", "url": "https://media.test/feed", "categorie_id": "inconnue"}).status_code == 422
    client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Média", "url": "https://media.test/feed", "categorie_id": cid})
    assert client.delete(f"/api/admin/presse/categories/{cid}", headers=admin).status_code == 409             # elle contient un média
    r = client.delete(f"/api/admin/presse/categories/{cid}?avec_medias=true", headers=admin)
    assert r.status_code == 200 and r.json()["medias_supprimes"] == 1
    assert client.get("/api/admin/presse/sources", headers=admin).json()["sources"] == []


def test_les_utilisateurs_ne_gerent_pas_les_categories(client, utilisateur, sans_semis):
    _, h, _ = utilisateur
    assert client.post("/api/admin/presse/categories", headers=h, json={"nom": "Pirate", "icone": "☠"}).status_code in (401, 403)


def test_image_manquante_ou_miniature_completee_par_la_page_de_l_article():
    """Lot 67 : un flux sans image (Burkina24) ou avec une miniature (Lefaso.net) reçoit l'image de partage de la page de l'article."""
    assert presse.image_insuffisante("") and presse.image_insuffisante("https://x.test/cache-vignettes/L150xH101/a.jpg?1")
    assert not presse.image_insuffisante("https://x.test/cache-vignettes/L480xH320/a.jpg") and not presse.image_insuffisante("https://x.test/photo.jpg")
    flux = """<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>Article sans image dans le flux</title><link>https://media.test/article/1</link><description>Extrait assez long pour le test.</description></item>
</channel></rss>"""
    page = '<html><head><meta property="og:image" content="https://img.media.test/une.jpg"></head><body></body></html>'

    def site(q: httpx.Request) -> httpx.Response:
        if q.url.path == "/feed":
            return httpx.Response(200, text=flux, headers={"content-type": "application/rss+xml"})
        return httpx.Response(200, text=page, headers={"content-type": "text/html"})

    ancien = presse._transport
    presse._transport = httpx.MockTransport(site)
    try:
        arts = asyncio.run(presse.collecter({"url": "https://media.test/feed", "nom": "T"}))
    finally:
        presse._transport = ancien
    assert arts[0]["image"] == "https://img.media.test/une.jpg"


def test_pastille_traduit_vers_fr(client, admin, utilisateur, sawali, sans_semis):
    """Lot 68 : un résumé IA d'un article ANGLAIS porte « traduit » ; un article français ou sans IA non."""
    assert presse.langue_probable("How to build a morning routine that works for you and your family") == "en"
    assert presse.langue_probable("Le gouvernement annonce un plan de soutien pour les commerçants des marchés") == "fr"
    assert presse.langue_probable("") == "fr"
    flux = """<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>How to build a morning routine that works</title><link>https://media.test/en/1</link><description>This is the way you can start the day with the right habits and the energy that you need.</description></item>
<item><title>Un plan de soutien pour les commerçants</title><link>https://media.test/fr/2</link><description>Le gouvernement a présenté un plan pour les commerçants des marchés de la ville.</description></item>
</channel></rss>"""
    ancien = presse._transport
    presse._transport = httpx.MockTransport(lambda q: httpx.Response(200, text=flux, headers={"content-type": "application/rss+xml"}))
    try:
        _, h, _ = utilisateur
        cat = client.post("/api/admin/presse/categories", headers=admin, json={"nom": "Coaching", "icone": "🧠"}).json()
        client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Média", "url": "https://media.test/feed", "categorie_id": cat["id"]})
        asyncio.run(presse.passage())
    finally:
        presse._transport = ancien
    # Le résumé IA simulé ne porte que sur le premier article (l'anglais) : il est traduit ; le second n'a pas de résumé IA
    arts = client.get("/api/presse", headers=h).json()["categories"][0]["medias"][0]["articles"]
    assert [(a["ia"], a["traduit"]) for a in arts] == [(True, True), (False, False)]
