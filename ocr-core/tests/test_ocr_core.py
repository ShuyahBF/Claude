"""Tests du module commun ocr_core (autonomes : aucune clé, aucun réseau).

Lancer : cd ocr-core && python -m pytest tests -q
Les deux versions d'emergentintegrations (0.1.0 et 0.2.0) sont simulées par
de fausses classes LlmChat injectées dans sys.modules.
"""
from __future__ import annotations

import asyncio
import io
import json
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import ocr_core  # noqa: E402
from ocr_core import engine, prepare  # noqa: E402

PROMPT = ocr_core.build_system_prompt("SAWALI SMART SYSTEMS", "facture fournisseur, bon de livraison")
HAIKU = "claude-haiku-4-5-20251001"


def _png(w, h):
    b = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(b, format="PNG")
    return b.getvalue()


def _pdf(pages, text=""):
    import fitz
    doc = fitz.open()
    for i in range(pages):
        p = doc.new_page()
        if text:
            p.insert_textbox(fitz.Rect(40, 40, 560, 800), f"{text} — page {i + 1}")
    data = doc.tobytes()
    doc.close()
    return data


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------
# Modèles, coût, version
# ---------------------------------------------------------------------
def test_version_file_matches_package():
    assert (Path(__file__).resolve().parents[1] / "VERSION").read_text().strip() == ocr_core.__version__


def test_cost_and_catalog(monkeypatch):
    monkeypatch.setenv("USD_TO_XOF_RATE", "600")
    usd, xof = ocr_core.compute_cost(ocr_core.OCR_MODELS["claude-opus-5"], 1000, 500)
    assert usd == pytest.approx(0.0175) and xof == pytest.approx(10.5)
    cat = ocr_core.public_catalog()
    assert cat["default_model"] == "claude-sonnet-5" and len(cat["models"]) == 3


def test_default_model_env(monkeypatch):
    monkeypatch.setenv("OCR_DEFAULT_MODEL", HAIKU)
    assert ocr_core.default_model_id() == HAIKU
    monkeypatch.setenv("OCR_DEFAULT_MODEL", "gpt-4o")
    assert ocr_core.default_model_id() == "claude-sonnet-5"


def test_system_prompt_is_site_specific_but_format_is_common():
    assert "SAWALI SMART SYSTEMS" in PROMPT and '"uncertain_fields"' in PROMPT


# ---------------------------------------------------------------------
# Préparation
# ---------------------------------------------------------------------
def test_photo_shrunk():
    text, images, notes = prepare.prepare_document(_png(4000, 3000), "image/png")
    with Image.open(io.BytesIO(images[0])) as img:
        assert img.format == "JPEG" and max(img.size) == prepare.MAX_IMAGE_EDGE_PX


def test_scanned_pdf_as_images_and_text_pdf_as_text():
    _, images, notes = prepare.prepare_document(_pdf(12), "application/pdf")
    assert len(images) == prepare.MAX_PDF_PAGES and "12" in notes[0]
    text, images, _ = prepare.prepare_document(_pdf(2, "Facture F-12 total 150000 FCFA " * 20), "application/pdf")
    assert images == [] and "F-12" in text


def test_office_rejected():
    with pytest.raises(ValueError):
        prepare.prepare_document(b"PK", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------------------------------------------------------------------
# Moteur
# ---------------------------------------------------------------------
def test_analyze_parses_and_costs(monkeypatch):
    answer = {"document_type": "Facture", "summary": "ok", "flags": [],
              "extracted_fields": {"numero": "F-12"}, "confidence": 3, "uncertain_fields": ["numero", 1]}

    async def fake(model, system_prompt, text, images, filename):
        assert system_prompt == PROMPT
        return json.dumps(answer), 2000, 400

    monkeypatch.setenv("USD_TO_XOF_RATE", "600")
    monkeypatch.setattr(engine, "call_llm", fake)
    r = _run(ocr_core.analyze_document(_png(800, 600), "image/png", "f.png", "claude-sonnet-5", system_prompt=PROMPT))
    assert r["confidence"] == 1.0 and r["uncertain_fields"] == ["numero"]
    assert r["cost_xof"] == pytest.approx(4.8) and r["input_mode"] == "images" and "error" not in r


def test_analyze_keeps_cost_on_bad_json(monkeypatch):
    async def fake(*a):
        return "désolé", 1000, 10

    monkeypatch.setattr(engine, "call_llm", fake)
    r = _run(ocr_core.analyze_document(_png(100, 100), "image/png", "f.png", HAIKU, system_prompt=PROMPT))
    assert r["error"] and r["cost_xof"] > 0


def test_analyze_unknown_model_uses_site_default(monkeypatch):
    async def fake(model, *a):
        return '{"summary": "ok"}', 10, 10

    monkeypatch.setattr(engine, "call_llm", fake)
    r = _run(ocr_core.analyze_document(_png(100, 100), "image/png", "f.png", "gpt-4o",
                                       system_prompt=PROMPT, default_model=HAIKU))
    assert r["model"] == HAIKU


def test_missing_key(monkeypatch):
    monkeypatch.delenv("EMERGENT_LLM_KEY", raising=False)
    _install_fake_ei(monkeypatch, version="0.2.0")
    r = _run(ocr_core.analyze_document(_png(100, 100), "image/png", "f.png", system_prompt=PROMPT))
    assert "EMERGENT_LLM_KEY" in r["flags"][0]


def _install_fake_ei(monkeypatch, version):
    """Injecte un faux module emergentintegrations.llm.chat (0.1.0 ou 0.2.0)."""
    calls = {}

    class ImageContent:
        def __init__(self, image_base64):
            self.content_type, self.file_content_base64 = "image", image_base64

    class UserMessage:
        def __init__(self, text=None, file_contents=None):
            self.text, self.file_contents = text, file_contents or []

    class LlmChat:
        def __init__(self, api_key, session_id, system_message):
            self.messages = [{"role": "system", "content": system_message}]
            self.extra_params = {}

        def with_model(self, provider, model):
            self.provider, self.model = provider, model
            return self

        def with_params(self, **p):
            self.extra_params.update(p)
            return self

        async def get_messages(self):
            return self.messages

        async def _add_user_message(self, messages, message):
            messages.append({"role": "user", "n_images": len(message.file_contents)})

        async def _execute_completion(self, messages):
            calls.update(model=self.model, messages=list(messages), params=self.extra_params)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"summary": "v1"}'))],
                                   usage=SimpleNamespace(prompt_tokens=111, completion_tokens=22))

    if version == "0.2.0":
        async def send_message_with_tools(self, message):
            calls.update(model=self.model, n_images=len(message.file_contents), params=self.extra_params)
            return SimpleNamespace(content='{"summary": "v2"}', usage=SimpleNamespace(input_tokens=333, output_tokens=44))
        LlmChat.send_message_with_tools = send_message_with_tools

    mod = types.ModuleType("emergentintegrations.llm.chat")
    mod.ImageContent, mod.UserMessage, mod.LlmChat = ImageContent, UserMessage, LlmChat
    for name in ("emergentintegrations", "emergentintegrations.llm"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    monkeypatch.setitem(sys.modules, "emergentintegrations.llm.chat", mod)
    return calls


def test_call_llm_emergentintegrations_020(monkeypatch):
    calls = _install_fake_ei(monkeypatch, "0.2.0")
    monkeypatch.setenv("EMERGENT_LLM_KEY", "sk-emergent-x")
    out = _run(engine.call_llm(ocr_core.OCR_MODELS["claude-opus-5"], PROMPT, "", [b"a", b"b"], "f.pdf"))
    assert out == ('{"summary": "v2"}', 333, 44)
    assert calls["model"] == "claude-opus-5" and calls["n_images"] == 2 and calls["params"]["max_tokens"] == 8192


def test_call_llm_emergentintegrations_010(monkeypatch):
    calls = _install_fake_ei(monkeypatch, "0.1.0")
    monkeypatch.setenv("EMERGENT_LLM_KEY", "sk-emergent-x")
    out = _run(engine.call_llm(ocr_core.OCR_MODELS[HAIKU], PROMPT, "", [b"a"], "f.png"))
    assert out == ('{"summary": "v1"}', 111, 22)
    assert calls["model"] == HAIKU
    assert calls["messages"][0]["role"] == "system" and calls["messages"][1]["n_images"] == 1


# ---------------------------------------------------------------------
# Évaluation et statistiques
# ---------------------------------------------------------------------
def test_accuracy_and_review():
    rv = ocr_core.build_review({"numero": "F-12", "total": 150000, "date": "2026-09-01"}, 3, " x ",
                               {"numero": "f-12", "total": "150 000", "date": "2026-09-02", "ifu": "1"},
                               "u1", "Secrétaire")
    assert rv["fields_total"] == 4 and rv["fields_corrected"] == 2 and rv["accuracy"] == pytest.approx(0.5)
    assert rv["comment"] == "x" and set(rv["corrected_fields"]) == {"date", "ifu"}
    with pytest.raises(ValueError):
        ocr_core.build_review({}, 6, None, {}, "u1", None)


def test_stats():
    rows = [
        {"model": "claude-sonnet-5", "cost_xof": 6.0, "review": {"rating": 5, "accuracy": 1.0}, "confidence": 0.9},
        {"model": "claude-sonnet-5", "cost_xof": 4.0, "review": None, "error": "x"},
        {"model": HAIKU, "cost_xof": 2.0, "review": {"rating": 3, "accuracy": 0.5}},
    ]
    s = ocr_core.stats_by_model(rows, "all")
    by = {m["model"]: m for m in s["models"]}
    assert by["claude-sonnet-5"]["runs"] == 2 and by["claude-sonnet-5"]["errors"] == 1
    assert by["claude-sonnet-5"]["avg_cost_xof"] == 5.0 and by[HAIKU]["avg_accuracy"] == 0.5
    assert s["total"]["total_cost_xof"] == 12.0 and s["total"]["avg_rating"] == 4.0
    with pytest.raises(ValueError):
        ocr_core.period_start("hier")
