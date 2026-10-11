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

## Paiement Mobile — état au 11/10/2026 (en pause, reprise à la demande)

- **Fait** (lots 13 à 16, PR #13 à #16, dernier commit `fae5061`) :
  - API unique FastAPI (`mobile-payments-web/backend`) pour le site ET l'app Android (routes `/api/android/…`) ;
    version/lot (`frontend/src/version.js`, VERSION 4, LOT 16), présence SAWALI (`paiement-mobile`,
    `paiement-mobile-android`), alerte WhatsApp de connexion (émetteur `paiementmobile`).
  - Render : `paiement-mobile-api` (srv-db5fv9g473hc73b177p0, Frankfurt, starter,
    https://paiement-mobile-api-jo11.onrender.com) et `paiement-mobile-site` (srv-db5fvaflk1mc739s8950,
    https://paiement-mobile-site.onrender.com, statique).
  - App Android 1.2.0 (code 3) : API 35 (Android 15), bord à bord, sans CALL_PHONE (bouton « Composer le code »),
    icône adaptative, écran « À propos » + non-affiliation opérateurs. Workflow GitHub : APK debug + AAB release
    (signé si secrets présents), erreurs Gradle publiées en annotations. Fiche Play Store : `mobile-payments-app/PLAYSTORE.md`.
- **Bloquant, côté propriétaire** :
  1. Render `paiement-mobile-api` → saisir `MONGO_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET` (Generate),
     facultatif `LILUVINE_WA_HMAC` (créer d'abord l'émetteur « paiementmobile » dans SAWALI). Sans eux : API en 502.
  2. Render `paiement-mobile-site` → règle Rewrite `/*` → `/index.html` (sinon `/confidentialite` en 404).
  3. Clé de publication (`keytool`, alias `paiementmobile`) + 4 secrets GitHub `ANDROID_KEYSTORE_BASE64`,
     `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, puis relancer le workflow.
  4. Compte Google Play Console (25 $, idéalement au nom de l'entreprise), test interne avec l'AAB.
- **À décider / à faire ensuite** : durées de conservation de la politique de confidentialité (non appliquées
  automatiquement), page « supprimer mon compte » si Google l'exige, nom de domaine propre (cookies Safari),
  vérification des codes USSD réels auprès des opérateurs.
