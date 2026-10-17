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


@pytest.fixture(autouse=True)
def reseau():
    presse._controle_hote = False
    pages = {"/": ACCUEIL}

    def site(q: httpx.Request) -> httpx.Response:
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


def test_admin_sources_et_lecture(client, admin, utilisateur, sawali):
    _, h, _ = utilisateur
    assert client.get("/api/admin/presse/sources", headers=h).status_code in (401, 403)
    r = client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/"})
    assert r.status_code == 201
    assert client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Mauvais", "url": "ftp://x.test/"}).status_code == 422
    assert client.put("/api/admin/presse/reglages", headers=admin, json={"heure": "6h"}).status_code == 422
    assert client.put("/api/admin/presse/reglages", headers=admin, json={"heure": "05:30"}).json()["heure"] == "05:30"
    # Rien de collecté : les utilisateurs ne voient rien
    assert client.get("/api/presse", headers=h).json()["medias"] == []
    asyncio.run(presse.passage())
    medias = client.get("/api/presse", headers=h).json()["medias"]
    assert len(medias) == 1 and medias[0]["nom"] == "Le Journal" and len(medias[0]["articles"]) == 2
    a = medias[0]["articles"]
    assert a[0]["ia"] is True and "Résumé IA" in a[0]["resume"]
    assert a[1]["ia"] is False and a[1]["resume"].startswith("Le gouvernement a présenté")           # repli sans IA
    # Média désactivé : plus visible
    sid = client.get("/api/admin/presse/sources", headers=admin).json()["sources"][0]["id"]
    client.put(f"/api/admin/presse/sources/{sid}", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/", "actif": False})
    assert client.get("/api/presse", headers=h).json()["medias"] == []
    assert client.delete(f"/api/admin/presse/sources/{sid}", headers=admin).status_code == 200


def test_sawali_indisponible_repli(client, admin, utilisateur, sawali):
    _, mode = sawali
    mode["ok"] = False
    client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/"})
    asyncio.run(presse.passage())
    arts = client.get("/api/presse", headers=utilisateur[1]).json()["medias"][0]["articles"]
    assert arts and all(not x["ia"] and x["resume"] for x in arts)


def test_un_seul_passage_par_jour(client, admin, sawali):
    recues, _ = sawali
    client.post("/api/admin/presse/sources", headers=admin, json={"nom": "Le Journal", "url": "https://journal.test/"})
    t = datetime(2026, 10, 18, 6, 1, tzinfo=timezone.utc)
    assert asyncio.run(presse.verifier_et_passer(t)) is True
    appels = len(recues)
    assert asyncio.run(presse.verifier_et_passer(t.replace(hour=9))) is False            # même jour : aucun nouveau passage
    assert len(recues) == appels
    assert asyncio.run(presse.verifier_et_passer(t.replace(day=19))) is True              # lendemain : nouveau passage
