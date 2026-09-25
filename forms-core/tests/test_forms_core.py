"""Tests du module commun forms_core (aucun site, aucun réseau).

- fonctions pures : normalisation, validation, statistiques, export ;
- routes complètes avec un adaptateur de test et MongoDB simulé
  (mongomock-motor) : création, envoi à des destinataires, lien public,
  réponse, fichiers, statistiques, export, espace client.
Lancer : cd forms-core && python -m pytest tests -q
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import forms_core as fc  # noqa: E402

PAGES = [{"id": "p1", "title": "Identité", "fields": [
    {"id": "nom", "type": "text", "label": "Nom", "required": True},
    {"id": "email", "type": "email", "label": "E-mail"},
    {"id": "statut", "type": "radio", "label": "Statut", "options": ["SARL", "SA", "Entreprise individuelle"], "required": True},
    {"id": "rccm", "type": "text", "label": "N° RCCM", "required": True, "show_if": {"field": "statut", "equals": "SARL"}},
]}, {"id": "p2", "title": "Avis", "fields": [
    {"id": "sec", "type": "section", "label": "Votre avis"},
    {"id": "note", "type": "rating", "label": "Satisfaction", "max": 5},
    {"id": "services", "type": "checkbox", "label": "Services utilisés", "options": ["Comptabilité", "Fiscalité", "Paie"]},
    {"id": "recommande", "type": "boolean", "label": "Recommanderiez-vous ?"},
    {"id": "ca", "type": "number", "label": "Chiffre d'affaires", "min": 0},
    {"id": "piece", "type": "file", "label": "Pièce", "accept": ".pdf"},
]}]


# ---------------------------------------------------------------- fonctions pures
def test_normalize_pages_cleans_and_keeps_ids():
    pages = fc.normalize_pages(PAGES + [{"fields": [{"type": "inconnu"}, {"id": "nom", "type": "text"}]}])
    ids = [f["id"] for p in pages for f in p["fields"]]
    assert ids[:4] == ["nom", "email", "statut", "rccm"]
    assert len(ids) == len(set(ids)) == 11          # type inconnu retiré, id en double renommé
    sec = next(f for p in pages for f in p["fields"] if f["id"] == "sec")
    assert sec["required"] is False                 # une section ne porte pas de valeur
    # Une condition ne peut viser qu'un champ placé AVANT.
    bad = fc.normalize_pages([{"fields": [{"id": "a", "type": "text", "show_if": {"field": "b", "equals": "x"}},
                                          {"id": "b", "type": "text"}]}])
    assert bad[0]["fields"][0]["show_if"] is None
    assert fc.normalize_pages(None)[0]["title"] == "Page 1"


def test_validation_required_types_and_conditions():
    pages = fc.normalize_pages(PAGES)
    clean, errors = fc.validate_submission(pages, {"nom": "  Awa  ", "email": "pas-un-mail", "statut": "SARL",
                                                   "note": "7", "services": ["Paie", "Inconnu"], "ca": "1 500,5",
                                                   "recommande": "oui", "intrus": "x"})
    assert errors == {"email": "Adresse e-mail invalide.", "rccm": "Ce champ est obligatoire.",
                      "note": "Valeur maximale : 5.", "services": "Choix non proposé."}
    clean, errors = fc.validate_submission(pages, {"nom": "Awa", "statut": "SA", "note": 4, "services": ["Paie"],
                                                   "ca": "1 500,5", "recommande": "oui", "intrus": "x"})
    assert errors == {}
    assert clean == {"nom": "Awa", "statut": "SA", "note": 4, "services": ["Paie"], "ca": 1500.5, "recommande": True}
    assert "rccm" not in clean and "intrus" not in clean       # champ caché et champ inconnu écartés


def test_stats_per_question_and_invitations():
    pages = fc.normalize_pages(PAGES)
    subs = [{"created_at": "2026-09-01T10:00", "data": {"statut": "SA", "note": 5, "services": ["Paie", "Fiscalité"], "recommande": True, "nom": "A"}},
            {"created_at": "2026-09-01T12:00", "data": {"statut": "SARL", "note": 3, "services": ["Paie"], "recommande": False, "nom": "B"}},
            {"created_at": "2026-09-03T09:00", "data": {"statut": "SA", "note": 4, "nom": "C"}}]
    st = fc.form_stats(pages, subs, views=6, invitations=[{"opened_at": "x"}, {"answered_at": "y"}, {}, {"revoked": True}])
    assert st["total_submissions"] == 3 and st["conversion_pct"] == 50.0
    assert st["series"] == [{"date": "2026-09-01", "count": 2}, {"date": "2026-09-03", "count": 1}]
    q = {x["id"]: x for x in st["questions"]}
    assert [o["count"] for o in q["statut"]["options"]] == [1, 2, 0]
    assert q["note"]["avg"] == 4.0 and q["note"]["distribution"][4] == {"label": "5", "count": 1}
    assert [o["count"] for o in q["services"]["options"]] == [0, 1, 2]
    assert q["recommande"]["options"] == [{"label": "Oui", "count": 1, "pct": 50.0}, {"label": "Non", "count": 1, "pct": 50.0}]
    assert q["nom"]["samples"] == ["C", "B", "A"]
    assert st["invitations"] == {"sent": 3, "opened": 2, "answered": 1, "pending": 2, "open_pct": 66.7, "response_pct": 33.3}
    assert fc.in_period("2026-09-30T23:59", "2026-09-01", "2026-09-30")   # dernier jour inclus


def test_export_csv_is_excel_friendly():
    pages = fc.normalize_pages(PAGES)
    rows = fc.submissions_rows(pages, [{"created_at": "2026-09-01T10:00:00", "respondent_name": "Awa", "source": "invitation",
                                        "data": {"nom": "Awa", "services": ["Paie", "Fiscalité"], "recommande": True,
                                                 "piece": {"file_id": "f1", "filename": "bilan.pdf"}}}])
    assert rows[0][:5] == ["N°", "Date", "Répondant", "E-mail", "Origine"]
    assert rows[1][1] == "2026-09-01 10:00" and rows[1][4] == "Invitation"
    body = fc.to_csv(rows)
    assert body.startswith("﻿".encode()) and "Paie, Fiscalité".encode() in body and b";Oui;" in body and b"bilan.pdf" in body


# ---------------------------------------------------------------- routes (adaptateur de test)
pytest.importorskip("mongomock_motor")
from fastapi import APIRouter, FastAPI, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

USERS = {"gest": {"id": "gest", "full_name": "Gestionnaire", "roles": ["formulaires"]},
         "client1": {"id": "client1", "full_name": "Client Un", "roles": ["client"]},
         "autre": {"id": "autre", "full_name": "Autre", "roles": ["comptable"]}}
RECIPIENTS = {"client1": {"id": "client1", "name": "Client Un", "email": "c1@x.bf", "phone": "+22670111111"},
              "client2": {"id": "client2", "name": "Client Deux", "email": "c2@x.bf", "phone": "+22670222222"}}


async def current_user(x_user: str = Header(...)):
    if x_user not in USERS:
        raise HTTPException(status_code=401)
    return USERS[x_user]


async def manager(x_user: str = Header(...)):
    u = await current_user(x_user)
    if "formulaires" not in u["roles"]:
        raise HTTPException(status_code=403, detail="Permission refusée")
    return u


class FakeAdapter(fc.FormsAdapter):
    code_prefix = "FORM-TEST"
    manager_dependency = staticmethod(manager)
    user_dependency = staticmethod(current_user)

    def __init__(self, db):
        self.db = db
        self.sent, self.files, self.notified = [], {}, []

    def public_base_url(self, request):
        return "https://site.test"

    def recipient_id_of(self, user):
        return user["id"] if "client" in user["roles"] else None

    async def list_recipients(self, user):
        return list(RECIPIENTS.values())

    async def get_recipient(self, rid):
        return RECIPIENTS.get(rid)

    async def send_invitation(self, *, recipient, form, url, channels, message, reminder):
        self.sent.append({"to": recipient["id"], "url": url, "channels": channels, "reminder": reminder})
        return {c: {"ok": c == "email", "error": None if c == "email" else "hors fenêtre 24 h"} for c in channels}

    async def store_file(self, *, data, filename, content_type, meta):
        fid = f"file{len(self.files) + 1}"
        self.files[fid] = (filename, data)
        return {"file_id": fid}

    no_links = False

    async def file_url(self, file_id):
        if self.no_links:
            return None
        return f"https://storage.test/{file_id}" if file_id in self.files else None

    async def read_file(self, file_id):
        return (self.files[file_id][1], "application/pdf") if file_id in self.files else None

    async def notify_submission(self, *, form, submission, emails):
        self.notified.append((form["id"], emails))


@pytest.fixture()
def env():
    db = AsyncMongoMockClient()["forms_test"]
    adapter = FakeAdapter(db)
    routers = fc.create_routers(adapter)
    api = APIRouter(prefix="/api")
    for r in routers.values():
        api.include_router(r)
    app = FastAPI()
    app.include_router(api)
    with TestClient(app) as client:
        yield type("Env", (), {"c": client, "a": adapter, "db": db})


def _h(u):
    return {"X-User": u}


def _create(env, title="Satisfaction 2026", **extra):
    r = env.c.post("/api/forms", headers=_h("gest"), json={"title": title, "pages": PAGES, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_only_managers_manage(env):
    assert env.c.get("/api/forms", headers=_h("autre")).status_code == 403
    assert env.c.post("/api/forms", headers=_h("client1"), json={"title": "x"}).status_code == 403
    f = _create(env)
    assert f["number"] == "FORM-TEST-0001" and _create(env, "Autre")["number"] == "FORM-TEST-0002"
    assert env.c.post("/api/forms", headers=_h("gest"), json={"title": "satisfaction 2026"}).status_code == 409
    items = env.c.get("/api/forms", headers=_h("gest")).json()["items"]
    assert {i["title"] for i in items} == {"Satisfaction 2026", "Autre"} and items[0]["fields_count"] == 9


def test_invitations_fill_once_and_tracking(env):
    f = _create(env)
    r = env.c.post(f"/api/forms/{f['id']}/invitations", headers=_h("gest"),
                   json={"recipient_ids": ["client1", "client2"], "channels": ["email", "whatsapp"], "message": "Merci"})
    assert r.status_code == 200 and r.json()["sent"] == 2
    assert env.a.sent[0]["url"].startswith("https://site.test/f/")
    invs = env.c.get(f"/api/forms/{f['id']}/invitations", headers=_h("gest")).json()
    assert invs["stats"]["sent"] == 2 and {i["status"] for i in invs["items"]} == {"sent"}
    token = next(i["token"] for i in invs["items"] if i["recipient_id"] == "client1")
    # Renvoyer au même client réutilise son lien (pas de doublon).
    env.c.post(f"/api/forms/{f['id']}/invitations", headers=_h("gest"), json={"recipient_ids": ["client1"], "channels": ["email"]})
    assert len(env.c.get(f"/api/forms/{f['id']}/invitations", headers=_h("gest")).json()["items"]) == 2
    # Le client ouvre le lien puis répond.
    pub = env.c.get(f"/api/public/forms/{token}").json()
    assert pub["source"] == "invitation" and pub["recipient"]["name"] == "Client Un" and "notify_emails" not in pub["form"]["settings"]
    bad = env.c.post(f"/api/public/forms/{token}/submit", json={"data": {"nom": ""}})
    assert bad.status_code == 422 and "nom" in bad.json()["detail"]["errors"]
    ok = env.c.post(f"/api/public/forms/{token}/submit", json={"data": {"nom": "Awa", "statut": "SA", "note": 5}})
    assert ok.status_code == 200
    assert env.c.post(f"/api/public/forms/{token}/submit", json={"data": {"nom": "Awa", "statut": "SA"}}).status_code == 409
    items = {i["recipient_id"]: i for i in env.c.get(f"/api/forms/{f['id']}/invitations", headers=_h("gest")).json()["items"]}
    assert items["client1"]["status"] == "answered" and items["client2"]["status"] == "sent"
    # Relance : seulement ceux qui n'ont pas répondu.
    env.a.sent.clear()
    rem = env.c.post(f"/api/forms/{f['id']}/invitations/remind", headers=_h("gest"), json={}).json()
    assert rem["reminded"] == 1 and env.a.sent == [{"to": "client2", "url": env.a.sent[0]["url"], "channels": ["email"], "reminder": True}]
    # Espace client : le formulaire reçu, marqué répondu.
    mine = env.c.get("/api/me/forms", headers=_h("client1")).json()["items"]
    assert mine[0]["title"] == "Satisfaction 2026" and mine[0]["answered_at"] and mine[0]["path"] == f"/f/{token}"
    # Désactivation d'un lien.
    iid = items["client2"]["id"]
    env.c.delete(f"/api/forms/{f['id']}/invitations/{iid}", headers=_h("gest"))
    assert env.c.get(f"/api/public/forms/{items['client2']['token']}").status_code == 410


def test_public_link_respondent_files_stats_export(env):
    f = _create(env, settings={"respondent_info": "required", "notify_emails": ["cabinet@albarka.bf"]})
    assert env.c.get("/api/public/forms/nimportequoi").status_code == 404
    link = env.c.post(f"/api/forms/{f['id']}/public-link", headers=_h("gest"), json={"enabled": True}).json()
    token = link["token"]
    assert link["url"] == f"https://site.test/f/{token}"
    assert env.c.get(f"/api/public/forms/{token}").json()["source"] == "public"
    # Nom et e-mail exigés pour un non-client.
    r = env.c.post(f"/api/public/forms/{token}/submit", json={"data": {"nom": "X", "statut": "SA"}})
    assert r.status_code == 422 and "_respondent_email" in r.json()["detail"]["errors"]
    # Fichier : type contrôlé, puis réponse avec la pièce.
    assert env.c.post(f"/api/public/forms/{token}/upload", data={"field_id": "piece"},
                      files={"file": ("photo.png", b"x", "image/png")}).status_code == 400
    up = env.c.post(f"/api/public/forms/{token}/upload", data={"field_id": "piece"},
                    files={"file": ("bilan.pdf", b"%PDF", "application/pdf")}).json()
    r = env.c.post(f"/api/public/forms/{token}/submit", json={
        "data": {"nom": "Moussa", "statut": "SA", "note": 4, "piece": up, "services": ["Paie"]},
        "respondent_name": "Moussa", "respondent_email": "m@x.bf"})
    assert r.status_code == 200 and r.json()["message"].startswith("Merci")
    # Robot (champ piège rempli) : accepté en apparence, rien d'enregistré.
    env.c.post(f"/api/public/forms/{token}/submit", json={"data": {}, "website": "spam"})
    subs = env.c.get(f"/api/forms/{f['id']}/submissions", headers=_h("gest")).json()
    assert subs["total"] == 1 and subs["items"][0]["source"] == "public"
    fid = subs["items"][0]["data"]["piece"]["file_id"]
    assert env.c.get(f"/api/forms/{f['id']}/files/{fid}", headers=_h("gest")).json() == {"url": f"https://storage.test/{fid}"}
    assert env.c.get(f"/api/forms/{f['id']}/files/inconnu", headers=_h("gest")).status_code == 404
    # Stockage sans lien temporaire : {"url": null} puis lecture par /content.
    env.a.no_links = True
    assert env.c.get(f"/api/forms/{f['id']}/files/{fid}", headers=_h("gest")).json() == {"url": None}
    content = env.c.get(f"/api/forms/{f['id']}/files/{fid}/content", headers=_h("gest"))
    assert content.status_code == 200 and content.content == b"%PDF"
    st = env.c.get(f"/api/forms/{f['id']}/stats", headers=_h("gest")).json()
    assert st["total_submissions"] == 1 and st["views"] == 1
    csv = env.c.get(f"/api/forms/{f['id']}/export.csv", headers=_h("gest"))
    assert csv.status_code == 200 and "bilan.pdf" in csv.content.decode("utf-8-sig")
    # Lien désactivé → plus accessible.
    env.c.post(f"/api/forms/{f['id']}/public-link", headers=_h("gest"), json={"enabled": False})
    assert env.c.get(f"/api/public/forms/{token}").status_code == 404


def test_closed_form_and_archive(env):
    f = _create(env, settings={"close_at": "2020-01-01"})
    token = env.c.post(f"/api/forms/{f['id']}/public-link", headers=_h("gest"), json={}).json()["token"]
    assert env.c.get(f"/api/public/forms/{token}").json()["closed_reason"].startswith("Ce formulaire est clos")
    assert env.c.post(f"/api/public/forms/{token}/submit", json={"data": {}}).status_code == 403
    dup = env.c.post(f"/api/forms/{f['id']}/duplicate", headers=_h("gest")).json()
    assert dup["title"] == "Satisfaction 2026 (copie)" and dup["number"] == "FORM-TEST-0002"
    assert env.c.delete(f"/api/forms/{f['id']}", headers=_h("gest")).status_code == 200
    assert [i["id"] for i in env.c.get("/api/forms", headers=_h("gest")).json()["items"]] == [dup["id"]]
    assert [i["id"] for i in env.c.get("/api/forms?archived=true", headers=_h("gest")).json()["items"]] == [f["id"]]
    env.c.post(f"/api/forms/{f['id']}/restore", headers=_h("gest"))
    assert len(env.c.get("/api/forms", headers=_h("gest")).json()["items"]) == 2


def test_categories_and_overview(env):
    c = env.c.post("/api/forms/categories", headers=_h("gest"), json={"name": "Enquêtes"}).json()
    assert env.c.post("/api/forms/categories", headers=_h("gest"), json={"name": "enquêtes"}).status_code == 409
    f = _create(env, category_id=c["id"])
    env.c.delete(f"/api/forms/categories/{c['id']}", headers=_h("gest"))
    assert env.c.get(f"/api/forms/{f['id']}", headers=_h("gest")).json()["category_id"] is None
    ov = env.c.get("/api/forms/overview", headers=_h("gest")).json()
    assert ov["forms"] == 1 and ov["invitations"]["sent"] == 0
    assert len(env.c.get("/api/forms/catalog", headers=_h("gest")).json()["field_types"]) == 19


def test_ensure_indexes_is_idempotent():
    """Les index se créent au démarrage et un second appel ne casse rien."""
    import asyncio
    db = AsyncMongoMockClient()["forms_idx"]
    adapter = FakeAdapter(db)

    async def run():
        await fc.ensure_indexes(adapter)
        await fc.ensure_indexes(adapter)  # rappel au redémarrage suivant
        return await db["forms_invitations"].index_information()

    info = asyncio.run(run())
    # Le jeton d'invitation doit être unique : un lien = une personne
    assert any(v.get("unique") and v["key"] == [("token", 1)] for v in info.values())
