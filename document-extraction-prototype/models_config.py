"""Modèles Claude disponibles dans la liste déroulante + leurs tarifs officiels.

Prix en USD pour 1 million de tokens (tarifs API Anthropic au 2026-09).
La conversion en FCFA se fait dans pricing.py, avec un taux configurable
(le FCFA est arrimé à l'EUR, pas à l'USD, donc ce taux fluctue légèrement
avec le marché EUR/USD — voir pricing.py).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ModelConfig:
    id: str  # identifiant exact à passer à l'API Anthropic
    label: str  # affiché dans la liste déroulante
    price_input_per_mtok: float  # USD / 1M tokens en entrée
    price_output_per_mtok: float  # USD / 1M tokens en sortie
    supports_effort: bool  # les modèles Haiku ne supportent pas output_config.effort
    note: str


MODELS: dict[str, ModelConfig] = {
    "claude-opus-5": ModelConfig(
        id="claude-opus-5",
        label="Claude Opus 5 — le plus précis (recommandé pour le manuscrit)",
        price_input_per_mtok=5.00,
        price_output_per_mtok=25.00,
        supports_effort=True,
        note="Meilleure précision, notamment sur l'écriture manuscrite. Coût le plus élevé.",
    ),
    "claude-sonnet-5": ModelConfig(
        id="claude-sonnet-5",
        label="Claude Sonnet 5 — bon compromis coût/précision",
        price_input_per_mtok=2.00,
        price_output_per_mtok=10.00,
        supports_effort=True,
        note="~2,5x moins cher qu'Opus 5. À tester en premier sur les pièces imprimées.",
    ),
    "claude-haiku-4-5": ModelConfig(
        id="claude-haiku-4-5",
        label="Claude Haiku 4.5 — le moins cher (imprimé simple, gros volume)",
        price_input_per_mtok=1.00,
        price_output_per_mtok=5.00,
        supports_effort=False,
        note="Le plus économique. À réserver aux pièces imprimées nettes, sans manuscrit.",
    ),
}

DEFAULT_MODEL_ID = "claude-opus-5"


def get_model(model_id: str) -> Optional[ModelConfig]:
    return MODELS.get(model_id)
