# ocr-core — module commun d'OCR des pièces

Source **unique** du module d'OCR (analyse IA des factures, reçus et pièces
comptables) partagé par les sites :

| Site | Dépôt / branche | Copie du backend | Copie du frontend | Adaptateur du site |
|---|---|---|---|---|
| Sawali (`Site-SawaliSmartSystems`) | `ShuyahBF/Emergent` · `Site-SawaliSmartSystems` | `backend/ocr_core/` | `frontend/src/components/ocr-core/` | `backend/routes/ocr_pieces.py` + `frontend/src/pages/portal/OcrPieces.jsx` (lot 19, v1.0.0) |
| Albarka (`Site-Albarka`) | `ShuyahBF/albarka-portal` · `conflict_030926_0658` | `backend/ocr_core/` | `frontend/src/components/ocr-core/` | `backend/albarka_ai.py` + `backend/albarka_documents.py` + `frontend/src/pages/portal/Documents.jsx` (lot 2, v1.0.0) |

Version courante : voir `VERSION` (doit être identique à `__version__` dans
`backend/ocr_core/__init__.py`).

## Principe

- `backend/ocr_core/` ne connaît **aucun site** : pas de base de données,
  pas d'authentification, pas de stockage, pas de route HTTP. Il fournit le
  catalogue des modèles, la préparation des pièces (PDF texte / PDF scanné →
  images / photo), l'appel au modèle via `EMERGENT_LLM_KEY`
  (emergentintegrations **0.1.0 et 0.2.0**), le coût réel en FCFA, la
  précision réelle à partir des corrections, et les indicateurs du tableau
  de bord.
- `frontend/ocr-core/` fournit les composants d'écran communs
  (`OcrRunsPanel`, `OcrDashboard`, `StarRating`, `format.js`). Ils n'importent
  que `@/lib/api` (`apiClient`), `sonner`, `lucide-react` et les composants
  shadcn `@/components/ui/*`, présents sur tous les sites.
- Chaque site garde une **fine couche d'adaptateur** : qui a le droit de voir
  quoi (rôles, cloisonnement des clients), où sont stockés les fichiers,
  quelles collections Mongo.

## Contrat d'API que chaque adaptateur expose

`apiBase` = préfixe choisi par le site (Albarka : `/documents`, Sawali : `/ocr-pieces`).

| Méthode | Route | Réponse / corps |
|---|---|---|
| GET | `{apiBase}/ocr-models` | `ocr_core.public_catalog()` |
| GET | `{apiBase}/ocr-stats?period=today\|7d\|30d\|all` | `ocr_core.stats_by_model(rows, period)` |
| GET | `{apiBase}/{id}` | la pièce + `ocr_runs` (liste des analyses, la plus ancienne en premier) — staff uniquement pour `ocr_runs` |
| POST | `{apiBase}/{id}/reanalyze` | corps `{ "model": "<id>" }` |
| POST | `{apiBase}/ocr-runs/{run_id}/review` | corps `{ rating: 1-5, comment?, corrected_fields: {} }` → `ocr_core.build_review(...)` |

Une « analyse » (run) contient au minimum les clés renvoyées par
`ocr_core.analyze_document()` + `id`, `document_id`, `created_at`, `review`.
Les clients (non-staff) ne reçoivent jamais `model`, les tokens, le coût, la
confiance ni l'évaluation.

## Mettre à jour le module (procédure)

1. Corriger **ici** (`ocr-core/`), jamais directement dans un site.
2. Monter la version dans `VERSION` **et** `backend/ocr_core/__init__.py`.
3. Lancer les tests : `cd ocr-core && python -m pytest tests -q`.
4. Pour chaque site : `./ocr-core/sync.sh <racine du clone du site>` puis
   `./ocr-core/sync.sh --check <racine>` (doit afficher « identique »).
5. Produire un lot par site (patch + prompt, `PATCH_DELIVERY_CONVENTIONS.md`).
   Comme les fichiers `ocr_core/` sont identiques sur tous les sites, le même
   correctif s'applique partout sans conflit.

## Variables d'environnement (communes)

- `EMERGENT_LLM_KEY` — clé universelle (déjà présente sur les sites Emergent).
- `USD_TO_XOF_RATE` — taux USD → FCFA du coût affiché (défaut `600`).
- `OCR_DEFAULT_MODEL` — modèle par défaut (défaut `claude-sonnet-5`).
