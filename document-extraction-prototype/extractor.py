"""Appel à l'API Anthropic pour extraire les champs d'une pièce comptable.

Sortie JSON demandée par consigne de prompt (pas via output_config.format,
pour rester sur un comportement documenté et garanti plutôt que de deviner
la forme exacte d'une fonctionnalité bêta) — on parse le texte de réponse
avec json.loads(), avec une extraction tolérante si le modèle entoure le
JSON de texte parasite malgré la consigne.
"""
import base64
import json
import mimetypes
import re
from typing import Any

import anthropic

from models_config import ModelConfig

EXTRACTION_PROMPT = """Tu es un assistant d'extraction de données comptables pour un \
cabinet comptable en Afrique de l'Ouest (Burkina Faso). L'image ou le PDF ci-joint est \
une pièce scannée (facture, reçu, bon) — parfois manuscrite, parfois imprimée, parfois \
avec un tampon ou un filigrane semi-transparent en arrière-plan (ignore ces filigranes, \
ce ne sont jamais des données à extraire).

Extrais les champs suivants et réponds UNIQUEMENT avec un objet JSON valide, sans texte \
avant ni après, selon exactement ce schéma :

{
  "type_piece": "facture" | "reçu" | "bon" | "autre",
  "numero_piece": string | null,
  "date": string | null,               // format JJ/MM/AAAA tel qu'écrit sur la pièce
  "emetteur_nom": string | null,        // nom de l'entreprise/prestataire qui émet la pièce
  "emetteur_ifu": string | null,
  "emetteur_rccm": string | null,
  "client_nom": string | null,          // à qui la pièce est adressée ("Doit:", "Client:", "Facturer à")
  "lignes": [
    {
      "designation": string,
      "quantite": number | null,
      "prix_unitaire": number | null,
      "prix_total": number | null
    }
  ],
  "sous_total": number | null,
  "taxes": number | null,
  "montant_total": number | null,
  "devise": string,                     // "XOF" sauf indication contraire explicite sur la pièce
  "champs_incertains": [string],        // noms des champs ci-dessus que tu n'es pas sûr d'avoir bien lus
  "confiance_globale": number           // ton estimation honnête de 0 à 100 de la fiabilité de CETTE extraction
}

Règles :
- N'invente JAMAIS une valeur que tu ne peux pas lire : mets null et ajoute le champ dans \
"champs_incertains" plutôt que de deviner.
- Les nombres sont des nombres JSON (pas de texte, pas de séparateur de milliers).
- Si l'écriture est manuscrite et illisible par endroits, baisse "confiance_globale" en \
conséquence — sois honnête, ne surestime pas ta lecture.
"""

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _guess_media_type(filename: str, raw_bytes: bytes) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed
    # repli sur la signature des octets si le nom de fichier ne donne rien
    if raw_bytes[:4] == b"%PDF":
        return "application/pdf"
    if raw_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return "application/octet-stream"


def _build_content_block(raw_bytes: bytes, media_type: str) -> dict[str, Any]:
    data_b64 = base64.standard_b64encode(raw_bytes).decode("ascii")
    if media_type == "application/pdf":
        return {
            "type": "document",
            "source": {"type": "base64", "media_type": media_type, "data": data_b64},
        }
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data_b64},
    }


def extract_document(
    client: "anthropic.Anthropic",
    *,
    raw_bytes: bytes,
    filename: str,
    model: ModelConfig,
) -> dict[str, Any]:
    """Appelle le modèle choisi et renvoie {parsed, raw_text, input_tokens, output_tokens}."""
    media_type = _guess_media_type(filename, raw_bytes)
    if media_type not in ("application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"):
        raise ValueError(
            f"Type de fichier non supporté ({media_type}) — utilise une image (JPG/PNG) ou un PDF."
        )

    content_block = _build_content_block(raw_bytes, media_type)
    kwargs: dict[str, Any] = dict(
        model=model.id,
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [content_block, {"type": "text", "text": EXTRACTION_PROMPT}],
            }
        ],
    )
    # Extraction de champs = tâche routinière : effort "low" suffit et réduit
    # le coût (voir skill claude-api — chat/classification/extraction n'ont
    # généralement pas besoin d'un effort de raisonnement élevé). Haiku 4.5
    # ne supporte pas ce paramètre.
    if model.supports_effort:
        kwargs["output_config"] = {"effort": "low"}

    response = client.messages.create(**kwargs)

    raw_text = "".join(block.text for block in response.content if block.type == "text")
    parsed = _parse_json_response(raw_text)

    return {
        "parsed": parsed,
        "raw_text": raw_text,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass
    match = _JSON_BLOCK_RE.search(raw_text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError("Impossible de parser la réponse du modèle en JSON : " + raw_text[:500])
