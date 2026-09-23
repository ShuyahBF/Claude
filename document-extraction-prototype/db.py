"""Persistance SQLite du prototype — une table unique `extractions`.

Suffisant pour un prototype (fichier local `extractions.db`). Pour Albarka
en production, remplacer par la vraie base (probablement MongoDB, comme le
reste du site) en gardant le même schéma de champs.
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).parent / "extractions.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS extractions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    filename TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    fx_rate_usd_xof REAL NOT NULL,
    cost_xof REAL NOT NULL,
    self_confidence REAL,           -- confiance auto-déclarée par le modèle (0-100)
    validated_precision REAL,       -- précision réelle mesurée après relecture humaine (0-100)
    validated INTEGER NOT NULL DEFAULT 0,
    extracted_json TEXT NOT NULL,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_extractions_created_at ON extractions(created_at);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(_SCHEMA)


def insert_extraction(
    *,
    id_: str,
    filename: str,
    model_id: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    fx_rate_usd_xof: float,
    cost_xof: float,
    self_confidence: Optional[float],
    extracted_json: dict,
    error: Optional[str] = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO extractions
               (id, created_at, filename, model_id, input_tokens, output_tokens,
                cost_usd, fx_rate_usd_xof, cost_xof, self_confidence,
                validated_precision, validated, extracted_json, error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)""",
            (
                id_,
                datetime.now(timezone.utc).isoformat(),
                filename,
                model_id,
                input_tokens,
                output_tokens,
                cost_usd,
                fx_rate_usd_xof,
                cost_xof,
                self_confidence,
                json.dumps(extracted_json, ensure_ascii=False),
                error,
            ),
        )


def set_validated_precision(id_: str, precision: float) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE extractions SET validated = 1, validated_precision = ? WHERE id = ?",
            (precision, id_),
        )


def get_extraction(id_: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM extractions WHERE id = ?", (id_,)).fetchone()
        return dict(row) if row else None


def list_recent(limit: int = 20) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM extractions ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def stats_for_period(since_iso: Optional[str]) -> dict[str, Any]:
    """Agrège coût cumulé (FCFA), précision moyenne, nb pièces, coût moyen/pièce.

    La précision moyenne combine `validated_precision` quand une pièce a été
    relue par un comptable, sinon retombe sur `self_confidence` (l'estimation
    du modèle lui-même) — clairement distingué côté interface.
    """
    query = "SELECT * FROM extractions WHERE error IS NULL"
    params: list[Any] = []
    if since_iso:
        query += " AND created_at >= ?"
        params.append(since_iso)
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(query, params).fetchall()]

    nb_pieces = len(rows)
    cost_total_xof = sum(r["cost_xof"] for r in rows)
    precisions = [
        r["validated_precision"] if r["validated_precision"] is not None else r["self_confidence"]
        for r in rows
        if r["validated_precision"] is not None or r["self_confidence"] is not None
    ]
    avg_precision = sum(precisions) / len(precisions) if precisions else None
    nb_validated = sum(1 for r in rows if r["validated"])

    return {
        "nb_pieces": nb_pieces,
        "cost_total_xof": round(cost_total_xof, 2),
        "avg_cost_xof": round(cost_total_xof / nb_pieces, 2) if nb_pieces else 0,
        "avg_precision": round(avg_precision, 1) if avg_precision is not None else None,
        "nb_validated": nb_validated,
    }
