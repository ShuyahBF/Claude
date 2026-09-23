"""Calcul du coût d'une extraction, converti en Francs CFA (XOF).

Le FCFA (zone UEMOA) est arrimé à l'EURO à un taux fixe (1 EUR = 655,957 XOF),
PAS au dollar US — alors que les tarifs Anthropic sont en USD. La conversion
USD -> XOF dépend donc du taux de change EUR/USD du marché, qui varie.

Pour ce prototype, le taux USD -> XOF est une CONSTANTE CONFIGURABLE
(variable d'environnement USD_TO_XOF_RATE) plutôt qu'un taux live — plus
simple et plus prévisible pour un prototype. Mets-la à jour périodiquement
(ou branche une vraie source de taux de change avant la mise en production
dans Albarka).
"""
import os

# Taux par défaut si USD_TO_XOF_RATE n'est pas défini dans l'environnement —
# à ajuster : c'est une approximation, pas un taux de change live.
DEFAULT_USD_TO_XOF_RATE = 600.0


def get_usd_to_xof_rate() -> float:
    try:
        return float(os.environ.get("USD_TO_XOF_RATE", DEFAULT_USD_TO_XOF_RATE))
    except ValueError:
        return DEFAULT_USD_TO_XOF_RATE


def compute_cost(
    input_tokens: int,
    output_tokens: int,
    price_input_per_mtok: float,
    price_output_per_mtok: float,
) -> dict:
    """Retourne le coût de reconnaissance en USD et en FCFA pour cette pièce."""
    cost_usd = (
        (input_tokens / 1_000_000) * price_input_per_mtok
        + (output_tokens / 1_000_000) * price_output_per_mtok
    )
    fx_rate = get_usd_to_xof_rate()
    cost_xof = cost_usd * fx_rate
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost_usd, 6),
        "fx_rate_usd_xof": fx_rate,
        "cost_xof": round(cost_xof, 2),
    }


def format_xof(amount: float) -> str:
    """Formate un montant en FCFA façon comptable (espace milliers, 0 décimale)."""
    return f"{round(amount):,}".replace(",", " ") + " FCFA"
