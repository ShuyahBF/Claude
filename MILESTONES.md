# Étapes nommées (multi-sites)

Journal des chantiers désignés par un nom convenu avec l'utilisateur, pour
pouvoir y référer plus tard sans tout réexpliquer — indépendant du site
concerné.

## Renforcement performances OCR

- **Fait pour** : `Site-SawaliSmartSystems` — voir `document-extraction-prototype/`
  (ce dépôt, commit `93259d8`, branche `fix/mobile-payments-deploy-render`).
  **Intégration réelle : lot 19 « OCR sur Pièces » publié et déployé en
  production le 2026-09-23** (vérifié sur sawalismartsystems.com : routes
  `/api/ocr-pieces*` en 401 au lieu de 404, bundle `main.05a42d18.js`
  contenant la page, le tableau de bord et la liste de chemins du Pharmacien
  suivi avec `/portal/vidal-fiche` ; la branche GitHub
  `Site-SawaliSmartSystems` n'était pas encore synchronisée à ce moment-là) (base `bd6b16b` de `Site-SawaliSmartSystems` ;
  livraison `sawali-portal-livraisons/sawali-portal-corrections_19_66b5ce6.patch`
  + `sawali-portal-prompt_19.md`). Page « OCR sur Pièces » (sidebar admin,
  pharmacien, Pharmacien suivi) : admin/superviseur = choix pharmacie +
  modèle, coût FCFA, étoiles + corrections, relance, tableau de bord ;
  pharmacies = leurs seules pièces, sans modèle/coût/évaluation. Inclut aussi
  la Fiche produit VIDAL ouverte au Pharmacien suivi (en plus de Posologie). Numéro de
  lot 19 déduit (Gestion de Stocks = lot 18) : à corriger si la numérotation
  réelle diffère.
- **Module commun `ocr-core/`** (ce dépôt, v1.0.0) : source unique de l'OCR,
  copiée à l'identique dans chaque site par `ocr-core/sync.sh` ; chaque site
  ne garde qu'un adaptateur (droits, stockage, collections). Sawali l'utilise
  dès le lot 19 ; Albarka migre au lot 2 (ci-dessous). Toute évolution de l'OCR se fait dans
  `ocr-core/`, puis un lot par site.
- **Albarka lot 2 — migration sur `ocr-core`** **publié et déployé en
  production le 2026-09-23** (commit Emergent `77a05fc`, arbre identique au
  patch hors `.emergent/emergent.yml` ; albarka-bf.com : routes OCR en 403
  sans session au lieu de 404, bundle `main.05611f3e.js` avec les composants
  communs) (base `28d9176` de `conflict_030926_0658` ;
  `albarka-portal-livraisons/albarka-portal-corrections_2_aaf483b.patch` +
  `albarka-portal-prompt_2.md`). Comportement constant (mêmes routes,
  réponses et collections ; KYC inchangé), sauf correctif : les Word/Excel ne
  sont plus envoyés à l'IA comme texte illisible. Après publication, les deux
  sites utilisent ocr-core 1.0.0.
- **À refaire pour** : `Site-Albarka` — **lot 1 publié et déployé en production le
  2026-09-23** (commit Emergent `ccab0b2`, identique au patch ; routes et
  frontend vérifiés sur albarka-bf.com ; premier retour réel de l'utilisateur
  le 2026-09-23 : « l'OCR avec Sonnet donne très bien » (1 facture manuscrite + 1 facture
  avec filigrane évaluées) — Sonnet 5 reste le modèle par défaut ; étape
  suivante : évaluation d'un gros volume de pièces par une secrétaire). ⚠️ Le code réellement déployé d'Albarka est
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
