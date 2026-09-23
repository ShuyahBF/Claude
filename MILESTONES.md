# Étapes nommées (multi-sites)

Journal des chantiers désignés par un nom convenu avec l'utilisateur, pour
pouvoir y référer plus tard sans tout réexpliquer — indépendant du site
concerné.

## Renforcement performances OCR

- **Fait pour** : `Site-SawaliSmartSystems` — voir `document-extraction-prototype/`
  (ce dépôt, commit `93259d8`, branche `fix/mobile-payments-deploy-render`).
- **À refaire pour** : `Site-Albarka` — **lot 1 livré le 2026-09-23, publication
  Emergent non encore confirmée**. ⚠️ Le code réellement déployé d'Albarka est
  sur la branche `conflict_030926_0658` de `ShuyahBF/albarka-portal` (et non
  `main`, qui ne contient qu'un ancien pilote) : toujours partir de cette
  branche. Base du lot 1 : `ab2926e` ; livraison :
  `albarka-portal-livraisons/albarka-portal-corrections_1_65b42c1.patch` +
  `albarka-portal-prompt_1.md` (ce dépôt). Une 1ʳᵉ version ciblant `main` a été
  refusée à juste titre par Emergent (structure absente du pod). Contenu :
  choix du modèle (Opus 5 / Sonnet 5 / Haiku 4.5 daté) sur `/admin/documents`,
  PDF scannés convertis en images (avant : « PDF illisible »), coût réel FCFA
  via `send_message_with_tools().usage` (emergentintegrations 0.2.0),
  historique `document_ocr_runs` (synthèse courante inchangée dans
  `document_syntheses` pour les rapports), évaluation 1-5 étoiles +
  corrections, tableau de bord, modèle/coût masqués aux clients. Modèle par
  défaut inchangé (Sonnet 5). Point à surveiller au 1er test réel : identifiant
  `claude-opus-5` jamais encore appelé via le proxy Emergent.
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
