# Étapes nommées (multi-sites)

Journal des chantiers désignés par un nom convenu avec l'utilisateur, pour
pouvoir y référer plus tard sans tout réexpliquer — indépendant du site
concerné.

## Renforcement performances OCR

- **Fait pour** : `Site-SawaliSmartSystems` — voir `document-extraction-prototype/`
  (ce dépôt, commit `93259d8`, branche `fix/mobile-payments-deploy-render`).
- **À refaire pour** : `Site-Albarka` (pas encore commencé).
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
