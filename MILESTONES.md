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
- **Sawali lot 20 — Explorateur R2 de Gestion de Stocks** livré le 2026-09-23,
  **en attente de publication** (base : lot 19 appliqué sur `bd6b16b` ;
  `sawali-portal-livraisons/sawali-portal-corrections_20_a06ccf9.patch` +
  `sawali-portal-prompt_20.md` — remplace `bac3898`, `55df89f`, `d2217eb` et
  `8f2b3ac`, jamais soumises). Contenu : fil d'Ariane « Compartiment › client › dossier » ;
  dépôt multi-fichiers (bouton, glisser-déposer, progression) ; accès
  superviseur aux routes admin du module ; dépôt par utilisateur suivi
  autorisé par l'admin avec taille max par utilisateur (1,5 Mo par défaut,
  `tracked_users.r2_upload_*`) ; espace alloué par tenant (2 Go par défaut,
  `users.gestion_stocks_quota_gb`, réglé dans SMART Communications du
  client) ; refus motivés (413) ; jauge d'espace sur le tableau de bord du
  Pharmacien suivi et dans l'explorateur ; contenu réel du compartiment
  (tuile « Racine (hors dossier) », sous-dossiers existants) et création des
  6 dossiers standard dans R2 à la 1re ouverture (choix de l'utilisateur ;
  compartiment réel `gestionstocks`, un dossier par code client, ex. WDD ;
  nom par défaut du code corrigé en `gestionstocks` ; légende des couleurs
  de dossiers ; Centre de Messagerie en pleine largeur).
  Clés R2_STOCKS_* renseignées et
  explorateur vérifié par l'utilisateur le 2026-09-23.
- **Sawali lot 21 — Prospects WhatsApp Liluvine** livré le 2026-09-24,
  **en attente de publication, cumulé avec les lots 20 et 22** (voir
  lot 22 ci-dessous pour la livraison en cours).
  Contenu : prospect = numéro inconnu (`contact=None`) ou contact étiqueté
  `prospect` ; prompt dédié `settings.global.liluvine_wa_prospect_system_prompt`
  (défaut `DEFAULT_WA_PROSPECT_SYSTEM_PROMPT`) ; aucune donnée CRM injectée
  pour un prospect (fuite corrigée) ; consignes « Mode WhatsApp »
  modifiables (`liluvine_wa_mode_instructions`) ; case
  `liluvine_wa_prospect_enabled` ; tenant admin/superviseur exempté du
  contrôle de contrat ; badge « Prospect » dans l'historique. Règle
  convenue : les lots suivants s'empilent dans une seule livraison
  cumulée `20_to_<N>` tant que rien n'est publié.
- **Sawali lots 20 à 22** : patch consolidé **appliqué par Emergent le
  2026-09-25** (commit Emergent `6ea933f` sur la branche `conflict_230926_1008`, poussée sur GitHub le 2026-09-25 ; code identique à `780b226` dev, seuls `.emergent/*` diffèrent ; lot 23 vérifié applicable sur `818f935`) ; au 2026-09-25
  20:15 UTC la production servait encore le bundle du lot 19
  (`main.05a42d18.js`, routes lots 20-22 en 404) → déploiement Emergent à
  publier, vérification programmée.
- **Sawali lot 22 — Tags et recherche des documents R2** livré le
  2026-09-24 ; livraison cumulée (appliquée, voir ci-dessus) :
  `sawali-portal-livraisons/sawali-portal-corrections_20_to_22_cd6c45a.patch`
  + `sawali-portal-prompt_20_to_22.md` (base : lot 19 publié ; remplace
  `…_20_to_21_6dc688b`, jamais soumis). Contenu : collection Mongo
  `stock_files` (une fiche par fichier R2 — R2 ne sait pas chercher par
  tag), tags + description au dépôt et après coup, recherche tous dossiers
  (accents/majuscules ignorés) + pastilles de filtre, droits (staff : tout ;
  Pharmacien suivi autorisé : ses fichiers), suggestions IA facultatives
  par client (`users.gestion_stocks_ai_tags`, ocr_core + Haiku 4.5, jamais
  appliquées d'office). Dev : branche `claude/r2-explorer` du clone
  Sawali, commits 6022065 (20), 60aaac0 (21), 780b226 (22).
- **Sawali lot 23** livré le 2026-09-25, **publié et déployé le 2026-09-25** (commit Emergent `a708771` + `4c23f4b`, branche `conflict_230926_1008`, code identique à `689830c` ; production : bundle `main.57e162f4.js`, routes R2 en 401 ; lots 20-22 déployés en même temps)
  (base : `6ea933f` Emergent = `780b226` dev ;
  `sawali-portal-livraisons/sawali-portal-corrections_23_689830c.patch` +
  `sawali-portal-prompt_23.md` ; dev : branche `claude/lot23`, commit
  689830c). Contenu : R2 — suppression depuis l'écran (staff / suivi sur
  ses fichiers), « Nouveau dossier », renommage/fusion de tag, recherche
  plein texte (PDF/Word/Excel/PPT/txt extraits sans IA, `ai_text` pour les
  scans, réindexation) ; Liluvine — bouton « Prospect » sur les contacts,
  base de connaissance par public (`liluvine_knowledge.audience`) ; Centre
  de Messagerie — compteur de non-lus unique `_wa_unread_summary`
  (badge = pastilles = cloche), rapprochement par 8 derniers chiffres,
  dernière interaction scopée tenant hors `bulk` + date affichée,
  conversation auto-actualisée (8 s) et 1000 messages les plus récents,
  coller image/texte du presse-papiers. Point 5 (superviseur → écrans
  admin) abandonné par l'utilisateur.
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
- **Module commun `forms-core/`** (ce dépôt, v1.0.0) : gestion de formulaires
  réutilisable (constructeur 19 types, validation serveur, conditions,
  invitations personnelles par client, lien public + QR, réponses, stats par
  question, export CSV), copié par `forms-core/sync.sh` ; 10 tests.
- **Albarka lot 3 — Formulaires + Caissier + administrateur réservé + espace
  client** — **publié et déployé en production le 2026-09-26** (commit
  Emergent `2e0a021` + `3d6b60a`, arbre identique au patch hors `.emergent/` et
  une ligne `.gitignore` ; albarka-bf.com : `/api/forms`, `/api/client-space/*`,
  `/api/me/space` en 403 sans session au lieu de 404, bundle `main.d39a709b.js`)
  (base `b545832` de
  `conflict_030926_0658` ; `albarka-portal-livraisons/albarka-portal-corrections_3_49aecac.patch`
  + `albarka-portal-prompt_3.md`, remplace 7387b59 et 7a62fdf non publiés ;
  dev `claude/forms-lot3` 9e9bb41 dans `ShuyahBF/albarka-portal`).
  Formulaires (rôle `formulaires`, envoi clients, lien public, « Mes
  formulaires ») ; Caissier seul à encaisser/délivrer un reçu (superviseur compris : pas de
  passe-droit, décision utilisateur 2026-09-26 ; tableau de bord client non filtré : OK), reçu REC auto
  à l'encaissement (exclu des totaux) ; administrateur = compte
  admin@sawalismartsystems.com seul (rôles effectifs, rien effacé) ; espace
  client : dépôts sans OCR, factures mises à disposition, modules par client,
  page « Factures & documents », notification WhatsApp à textes réglables
  (modèle Meta hors 24 h, repli e-mail). 18 tests Albarka + parcours
  navigateur OK.
- **Albarka lot 4 — Superviseur réservé, suppression du personnel, comptes
  de test, Paramètres** — **publié et déployé en production le 2026-09-26**
  (commit Emergent `655653f` + `36d9fc1`, identique au patch hors .emergent ; routes
  /api/presence, /api/access, /api/push, /documents/multi, sw.js, manifest et
  bundle v2026.4 vérifiés sur albarka-bf.com) (base
  `3d6b60a` ; `albarka-portal-livraisons/albarka-portal-corrections_4_3156df6.patch`
  + `albarka-portal-prompt_4.md`, remplace 56d4b58, 37ad3ec, 90834f0, 8fd0653,
  439dc65 et af5114c non publiés ; dev `claude/albarka-lot4` 900bfee). + Dépôt
  multi-clients (même document chez les clients cochés, une notification chacun)
  et barre jaune date/heure + version (src/version.js, v2026.4). + Notifications
  push (Web Push maison, RFC 8291 vérifié par http_ece) et IP dans le Journal. + Liste blanche
  du personnel (appareils + IP, fausse 404, demandes d'appareils), jetons
  d'accès temporaires (admin ou e-mails désignés, e-mail + WhatsApp),
  tableau de bord « Derniers clients connectés » (Direction, Secrétariat, admin). + Déconnexion automatique
  (repris de Sawali, défaut 30 min, jamais pendant une tâche en cours). + Présence en temps réel (keep-alive 25 s,
  en ligne/absent/hors ligne, Clients, Personnels, chat, WhatsApp). + Actions sur les comptes (désactiver,
  réinitialiser le mot de passe avec fermeture des sessions via iat,
  dernière connexion / modification) ; suppression client par admin seul. Correction :
  « administrateur » = compte qui a tous les droits → règle Administrateur du
  lot 3 annulée (retour à l'origine) ; rôle Superviseur donné/retiré par
  admin@sawalismartsystems.com seul ; suppression d'un compte du personnel
  par le superviseur (trace deleted_users) ; « Créer comptes de test » (+alias
  e-mail, invisibles sauf superviseur, exclus des envois de masse) ;
  Paramètres superviseur seul (RGPD compris). 57 tests autonomes + navigateur OK.
- **Sawali lot 25 — droits d'accès alignés** — **publié le 2026-09-26** (GitHub bcb1032→793ef31, code identique hors
  `.emergent` ; production bundle main.3c611dee) (base `399c63f` = lot 24 publié ;
  `sawali-portal-livraisons/sawali-portal-corrections_25_0f62076.patch` +
  `sawali-portal-prompt_25.md` ; dev `claude/lot25` 5bb5aac). Traducteur →
  /portal/i18n, moderateur/moderator acceptés partout, Registre des erreurs
  aligné, « Administrateur plateforme (accès complet) », liens cryptés
  super-admin côté serveur, lien Caisse aligné, business_type du parent pour
  les suivis, Documentation/Formulaires toujours visibles aux créateurs,
  Voice Studio grisé, « Générer l'image », liste noire anti-verrouillage ;
  16 tests nouveaux, 67 autonomes OK, build OK.
- **Albarka lot 5 — design SAWALI sur tout le portail + corrections de droits**
  — **publié le 2026-09-26** (GitHub d30e280→37de42f, code identique hors
  `.emergent`/`.gitignore` ; production v2026.5) (base `36d9fc1` = lot 4 publié ;
  `albarka-portal-livraisons/albarka-portal-corrections_5_64982f0.patch` +
  `albarka-portal-prompt_5.md`, remplace 17d196a non publié ; dev
  `claude/albarka-lot5` 477001c). Corrections : gestion du personnel réservée
  à Direction/DG/Administrateur/Superviseur (faille API fermée), Administrateur
  attribuable par Superviseur et admin, contrat de test + comptes de test
  visibles entre eux, Caisse protégée par rôle côté serveur, menus DG et
  Administrateur, Personnels pour l'adresse désignée, page d'arrivée selon le
  menu, lien Rapports en double, modules fermés masqués au tableau de bord
  client ; 63 tests autonomes. Thème
  « portail » (classe `portal-ui` sur body : Space Grotesk + Geist, champs,
  cases, tableaux, cartes, menu à pastille pleine), briques shadcn restylées
  (bouton, champ, zone de texte, étiquette, case, interrupteur, liste, tableau,
  fenêtre, onglets soulignés, badge, carte), forms-core 1.1.0 (`ui.js`,
  bibliothèque en cartes à boutons colorés, titre en double bloqué), actions
  colorées dans Clients / Personnels / Dépôt ; version v2026.5. Backend
  inchangé. 30 pages parcourues sans erreur + parcours Formulaires et dépôt
  multi-clients OK. Recettes complètes : Sawali
  https://claude.ai/artifact/TX7v7c7WR7LA7S8K6p3meZ (291 points), Albarka
  https://claude.ai/artifact/CmYGd3A1QPm8guDCstdYzC (139 points, v2026.5).
- **Albarka lot 6 — statistiques graphiques des formulaires (forms-core 1.2.0)**
  — **publié le 2026-09-26** (GitHub 0cd9b25, code identique hors `.emergent` ;
  production v2026.6) (base `37de42f` = lot 5 publié ;
  `albarka-portal-livraisons/albarka-portal-corrections_6_6d9a105.patch` +
  `albarka-portal-prompt_6.md` ; dev `claude/albarka-lot6` 6d9a105). Onglet
  Stats refait (raccourcis de période, export CSV, 6 indicateurs animés, barres
  par jour / cumul, provenance, identifiés/anonymes, entonnoir des invitations,
  jours de la semaine, carte de chaleur des heures, meilleurs répondants,
  10 dernières réponses, barres ou camembert par question, étoiles, nombres au
  format français) ; bibliothèque : cartes animées, courbe 30 jours, « Les plus
  remplis » cliquable. Backend : champs ajoutés seulement. v2026.6. 63 tests
  autonomes Albarka + 12 tests forms-core OK, build OK, navigateur (bureau et
  téléphone) OK.
- **Albarka lot 7 — factures au format du cabinet, documents & modèles, tableau de paie**
  — **publié le 2026-09-26** (GitHub 4313f2e→7b86f23, code identique hors
  `.emergent`/`.gitignore` ; production v2026.7, bundle main.e0917c3c) (base : lot 6 ; `albarka-portal-livraisons/albarka-portal-corrections_7_f8aa0cf.patch`
  + `albarka-portal-prompt_7.md` ; dev `claude/albarka-lot7` f8aa0cf).
  Factures/proformas : lignes de titre + détail multi-lignes, TVA unique 18 %,
  retenue sur HT, net à payer (encaissement et espace client sur le net), PDF
  ReportLab au format du modèle Word, somme en lettres, signataire, QR code →
  page publique /verifier. Papiers à en-tête multiples (images en-tête/pied ou
  préimprimé) + réglages documents. Éditeur « comme Word » sans dépendance
  (contentEditable, HTML nettoyé côté serveur) pour les missions et les
  modèles. Documents & modèles : variables automatiques/communes/par
  destinataire, modèle « Avis de mission » fourni, génération N documents
  (PDF PyMuPDF Story + QR, Word .doc, impression groupée, dépôt espace client),
  duplication, verrouillage. Tableau de paie mensuel (grille, reprise du mois
  précédent, PDF paysage + questionnaire RH, CSV). v2026.7. 73 tests autonomes
  (10 nouveaux), build OK, navigateur OK.
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
- **Sawali lot 24** livré le 2026-09-25, **publié et déployé le 2026-09-25** (commit Emergent `68a931c` + `399c63f`, branche `conflict_230926_1008`, code identique à `b98e5b1` ; production : bundle `main.0b1a8212.js`, routes doublons/décisions/mark-all-read en 401, CSS des fenêtres défilantes présent)
  (base : `a708771`/`4c23f4b` Emergent = `689830c` dev ;
  `sawali-portal-livraisons/sawali-portal-corrections_24_b98e5b1.patch` +
  `sawali-portal-prompt_24.md`, remplace `…_24_f4ddc14` jamais soumis ;
  dev : branche `claude/lot24`). Contenu : non-lus limités à 30 jours +
  « Tout marquer comme lu » ; « Dernière interaction » en colonne ;
  doublons à l'enregistrement des contacts inconnus corrigés (import
  idempotent, liste nettoyée, ajout auto Liluvine nettoie l'entrée, webhook
  reconnaît les numéros sans indicatif) ; outil « Doublons » **réservé au
  superviseur** (fiche la plus complète gardée, à égalité la plus ancienne,
  suppression des seules fiches cochées, messages rattachés) ; tag
  « Relayé » fond blanc/vert ; réponses Liluvine (annonces, corrections,
  !reactions) copiées dans le fil ; journal `liluvine_wa_autoreply_log` +
  écran « Pourquoi Liluvine n'a pas répondu ? » ; fenêtres modales hautes
  défilantes (règle CSS globale + DialogContent max-h-90vh).
