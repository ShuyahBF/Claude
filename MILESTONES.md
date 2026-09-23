# Étapes nommées (multi-sites)

Journal des chantiers désignés par un nom convenu avec l'utilisateur, pour
pouvoir y référer plus tard sans tout réexpliquer — indépendant du site
concerné.

## Renforcement performances OCR

- **Fait pour** : `Site-SawaliSmartSystems` — voir `document-extraction-prototype/`
  (ce dépôt, commit `93259d8`, branche `fix/mobile-payments-deploy-render`).
- **À refaire pour** : `Site-Albarka` — **lot 1 livré le 2026-09-23, publication
  Emergent non encore confirmée**. Dépôt `ShuyahBF/albarka-portal`, base
  `1d6e2e8` ; livraison : `albarka-portal-livraisons/albarka-portal-corrections_1_380d02a.patch`
  + `albarka-portal-prompt_1.md` (ce dépôt). Différences avec Sawali : intégré
  directement au pilote (`backend/albarka_ai.py`, `albarka_documents.py`,
  `frontend/src/pilot/ocr/`), appel via `EMERGENT_LLM_KEY` (plus
  d'`ANTHROPIC_API_KEY`), PDF → images (PyMuPDF), évaluation 1-5 étoiles +
  corrections des champs, relance d'une même pièce avec un autre modèle,
  modèle/coût/évaluations masqués aux clients. Point à surveiller au 1er test
  réel : identifiant `claude-opus-5` jamais encore appelé via le proxy
  Emergent (Sonnet 5 et Haiku daté le sont déjà sur Sawali).
- **Contenu de l'étape** : comparer les modèles Claude (Opus 5 / Sonnet 5 /
  Haiku 4.5) sur l'extraction de pièces comptables scannées transmises par
  les clients d'un cabinet comptable — imprimées et manuscrites, souvent
  avec filigrane/tampon. Livré : prototype FastAPI + interface web avec
  choix du modèle en liste déroulante avant téléversement, coût de
  reconnaissance affiché en FCFA par pièce (calculé sur les tokens réels,
  pas une estimation), validation humaine avec calcul de précision réelle
  (distincte de la confiance auto-déclarée du modèle), tableau de bord par
  période (coût cumulé, précision moyenne, coût moyen, nb pièces) — tout en
  FCFA. Détails/limites assumées : voir `document-extraction-prototype/README.md`.
- **Non fait dans cette étape** : intégration réelle dans le site (le
  prototype est autonome, base SQLite locale) ; test en conditions réelles
  (pas de clé API disponible dans l'environnement au moment du build) ;
  autres fournisseurs LLM (GPT-4o, Gemini, Mistral OCR) — non implémentés,
  à cadrer si demandé.
