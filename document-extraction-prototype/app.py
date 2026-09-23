"""Prototype d'extraction de pièces comptables scannées (projet Albarka).

Lancer avec :  uvicorn app:app --reload
Nécessite la variable d'environnement ANTHROPIC_API_KEY.

Ce prototype sert à comparer les modèles Claude sur de VRAIES pièces du
cabinet comptable avant intégration dans Albarka — voir README.md.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import anthropic
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
from extractor import extract_document
from models_config import MODELS, get_model
from pricing import compute_cost, format_xof

app = FastAPI(title="Prototype extraction pièces comptables — Albarka")
db.init_db()

_client: Optional[anthropic.Anthropic] = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise HTTPException(
                status_code=500,
                detail="ANTHROPIC_API_KEY n'est pas défini côté serveur — voir README.md.",
            )
        _client = anthropic.Anthropic()
    return _client


@app.get("/api/models")
def list_models():
    return [
        {"id": m.id, "label": m.label, "note": m.note}
        for m in MODELS.values()
    ]


@app.post("/api/extract")
async def api_extract(file: UploadFile = File(...), model_id: str = Form(...)):
    model = get_model(model_id)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Modèle inconnu : {model_id}")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Fichier vide.")

    client = get_client()
    extraction_id = str(uuid.uuid4())

    try:
        result = extract_document(
            client, raw_bytes=raw_bytes, filename=file.filename or "piece", model=model
        )
    except (ValueError, anthropic.APIError) as exc:
        db.insert_extraction(
            id_=extraction_id, filename=file.filename or "piece", model_id=model.id,
            input_tokens=0, output_tokens=0, cost_usd=0, fx_rate_usd_xof=0, cost_xof=0,
            self_confidence=None, extracted_json={}, error=str(exc),
        )
        raise HTTPException(status_code=502, detail=f"Extraction échouée : {exc}") from exc

    cost = compute_cost(
        result["input_tokens"], result["output_tokens"],
        model.price_input_per_mtok, model.price_output_per_mtok,
    )
    self_confidence = result["parsed"].get("confiance_globale")
    if not isinstance(self_confidence, (int, float)):
        self_confidence = None

    db.insert_extraction(
        id_=extraction_id,
        filename=file.filename or "piece",
        model_id=model.id,
        input_tokens=cost["input_tokens"],
        output_tokens=cost["output_tokens"],
        cost_usd=cost["cost_usd"],
        fx_rate_usd_xof=cost["fx_rate_usd_xof"],
        cost_xof=cost["cost_xof"],
        self_confidence=self_confidence,
        extracted_json=result["parsed"],
    )

    return {
        "id": extraction_id,
        "model": {"id": model.id, "label": model.label},
        "extracted": result["parsed"],
        "cost": {**cost, "cost_xof_formatted": format_xof(cost["cost_xof"])},
    }


class ValidateRequest(BaseModel):
    corrected_fields: dict = {}


@app.post("/api/validate/{extraction_id}")
async def api_validate(extraction_id: str, body: ValidateRequest):
    """Le comptable relit l'extraction. `corrected_fields` liste les champs de
    premier niveau (numero_piece, montant_total, ...) qu'il a dû CORRIGER —
    liste vide si tout était juste. La précision réelle = proportion de champs
    non corrigés, calculée sur l'ensemble des champs scalaires du schéma
    (hors "lignes", "champs_incertains", "confiance_globale")."""
    row = db.get_extraction(extraction_id)
    if not row:
        raise HTTPException(status_code=404, detail="Extraction introuvable")

    import json
    extracted = json.loads(row["extracted_json"])
    scalar_fields = [
        k for k in extracted
        if k not in ("lignes", "champs_incertains", "confiance_globale")
    ]
    corrected = set(body.corrected_fields.keys())
    total = len(scalar_fields) or 1
    correct = total - len(corrected & set(scalar_fields))
    precision = round(100 * correct / total, 1)

    db.set_validated_precision(extraction_id, precision)
    return {"id": extraction_id, "validated_precision": precision}


@app.get("/api/stats")
def api_stats(period: str = "all"):
    """period: today | week | month | all"""
    since_iso = None
    now = datetime.now(timezone.utc)
    if period == "today":
        since_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    elif period == "week":
        since_iso = (now - timedelta(days=7)).isoformat()
    elif period == "month":
        since_iso = (now - timedelta(days=30)).isoformat()
    elif period != "all":
        raise HTTPException(status_code=400, detail="period doit être today|week|month|all")

    stats = db.stats_for_period(since_iso)
    stats["cost_total_xof_formatted"] = format_xof(stats["cost_total_xof"])
    stats["avg_cost_xof_formatted"] = format_xof(stats["avg_cost_xof"])
    return stats


@app.get("/api/history")
def api_history(limit: int = 20):
    rows = db.list_recent(limit)
    for r in rows:
        r["cost_xof_formatted"] = format_xof(r["cost_xof"])
    return rows


app.mount("/", StaticFiles(directory="static", html=True), name="static")
