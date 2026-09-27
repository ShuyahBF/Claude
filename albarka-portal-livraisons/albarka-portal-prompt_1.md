# Albarka — Lot 1 : mesure et optimisation de l'OCR des pièces comptables

Tu avais raison de t'arrêter : mon patch précédent (`…_1_0408e93` puis
`…_1_380d02a`) visait par erreur l'ancienne branche `main` (le pilote), et non
le code réellement déployé sur ce pod. Oublie-le entièrement : ce nouveau patch
le remplace.

Applique `albarka-portal-corrections_1_65b42c1.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `ab2926e` (« Auto-generated
changes », juste après `856f6b6`, le patch « Personnels » + correctif
`extractError`). C'est un `git format-patch` d'un seul commit : applique-le en
UN SEUL `git am`. Si le déploiement que tu viens de lancer est encore en cours,
attends qu'il soit terminé, puis applique le patch et redéploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/tests/test_ocr_lot1.py` — tests unitaires autonomes (Mongo simulé, IA simulée). Tu ne les lances pas.

**Nouveaux fichiers frontend**
- `frontend/src/components/ocr/OcrRunsPanel.jsx` — analyses d'une pièce : puces par modèle, relance, évaluation (étoiles, corrections)
- `frontend/src/components/ocr/OcrDashboard.jsx` — tableau de bord OCR par période et par modèle
- `frontend/src/components/ocr/StarRating.jsx` — note de 1 à 5 étoiles
- `frontend/src/components/ocr/format.js` — formatage FCFA, pourcentages, noms de modèles

**Fichiers modifiés**
- `backend/albarka_ai.py` — choix du modèle, coût réel, préparation des pièces (PDF scannés, photos)
- `backend/albarka_documents.py` — modèle choisi au dépôt, historique des analyses, relance, évaluation, statistiques
- `frontend/src/pages/portal/Documents.jsx` — liste « Modèle d'IA » au dépôt, colonne « Analyses IA », panneau d'évaluation, bascule « Tableau de bord OCR »

Aucune nouvelle dépendance : `emergentintegrations` 0.2.0, `PyMuPDF` et `Pillow`
sont déjà dans `backend/requirements.txt`, et rien n'est ajouté au
`package.json`. `server.py` n'est pas modifié : les nouvelles routes passent par
le routeur `/api/documents` déjà monté. La nouvelle collection Mongo
`document_ocr_runs` se crée d'elle-même au premier enregistrement.

## Variables d'environnement

- **Déjà présente, réutilisée telle quelle** : `EMERGENT_LLM_KEY`.
- **Nouvelles, facultatives** (valeurs par défaut correctes si absentes) :
  - `USD_TO_XOF_RATE` — taux de conversion USD → FCFA du coût affiché (défaut : `600`).
  - `ALBARKA_OCR_DEFAULT_MODEL` — modèle des dépôts faits par les clients et du pré-remplissage KYC de « Mon compte » (défaut : `claude-sonnet-5`, c'est-à-dire le modèle utilisé jusqu'ici : rien ne change pour eux).
- Aucun paramètre stocké en base (AdminSettings) à configurer.

## Ce que ça apporte, dans l'ordre

1. **Les PDF scannés sont enfin analysés.** Dans `albarka_ai.py`, un PDF
   passait uniquement par l'extraction de texte (`_extract_pdf_text`). Un scan
   n'a pas de couche texte : ces pièces, qui sont la majorité de ce que
   m'envoient mes clients, finissaient en « PDF illisible (extraction texte
   vide) ». Désormais, `prepare_pdf()` garde l'envoi en texte quand le PDF a
   une vraie couche texte (au moins 200 caractères par page, le mode le moins
   cher). Sinon, il convertit chaque page en image (PyMuPDF, 150 dpi, 10 pages
   au maximum ; au-delà, une alerte le signale) et l'envoie en vision.

2. **Optimisation des photos.** Elles sont redressées selon l'orientation EXIF
   et réduites à 1568 px sur le grand côté, taille à laquelle Claude les réduit
   de toute façon. La requête est plus légère, sans perte de lisibilité.

3. **Choix du modèle avant le dépôt** (cabinet uniquement). Une liste
   « Modèle d'IA » propose Claude Opus 5 (le plus précis), Sonnet 5 (le modèle
   actuel) et Haiku 4.5 (le moins cher). Pour Haiku, je reprends l'identifiant
   `claude-haiku-4-5-20251001`, déjà éprouvé via le proxy Emergent sur mon
   autre plateforme. Un client ne choisit pas : ses dépôts restent sur le
   modèle par défaut.

4. **Coût réel de chaque analyse en FCFA.** `send_message()` ne renvoie que le
   texte. J'utilise donc `send_message_with_tools()` d'emergentintegrations
   0.2.0, sans outil déclaré : c'est la méthode publique qui renvoie
   `ChatResponse.usage`, c'est-à-dire les tokens réellement consommés. J'y
   applique le tarif officiel du modèle et le taux `USD_TO_XOF_RATE`. Le coût
   est enregistré même si la réponse de l'IA est inexploitable, puisque les
   tokens sont facturés dans ce cas aussi. `analyze_document()` garde sa
   signature : l'appel existant dans `albarka_myaccount.py` (KYC) fonctionne
   sans changement.

5. **Historique des analyses sans casser les rapports.** Chaque analyse est
   conservée dans la nouvelle collection `document_ocr_runs`, avec son modèle,
   ses tokens, son coût, sa durée et son évaluation. « Relancer avec ce modèle »
   ajoute une analyse sans écraser les précédentes, ce qui me permet de
   comparer les modèles sur une même pièce. `document_syntheses` garde, comme
   avant, UNE synthèse par pièce (la plus récente, même `id` que la pièce) :
   `albarka_reports_router.py` et `albarka_reports_mgmt.py`, qui la lisent,
   ne changent pas. La suppression d'une pièce supprime aussi ses analyses.

6. **Évaluation humaine : étoiles + corrections.** En dépliant une pièce, je
   vois chaque analyse (modèle, coût, tokens, durée, envoi en texte ou en
   images) et je la note de 1 à 5 étoiles. Je corrige les champs faux et
   j'ajoute ceux que l'IA a oubliés. Le serveur calcule la **précision réelle**
   (part des champs non corrigés), sans compter les simples différences de
   format (« 150 000 » et 150000 sont égaux). Elle reste distincte de la
   confiance que le modèle s'attribue, affichée à titre indicatif. Les champs
   jugés incertains par le modèle sont surlignés en orange.

7. **Tableau de bord OCR.** Une bascule « Pièces / Tableau de bord OCR »
   apparaît en haut de `/admin/documents`. Pour une période donnée
   (aujourd'hui, 7 jours, 30 jours ou tout), il affiche par modèle et au total :
   nombre de pièces, coût cumulé, coût moyen, note moyenne, précision réelle
   moyenne, confiance déclarée et durée moyenne.

8. **Confidentialité et affichage côté client.** Le modèle, le coût, les
   tokens et les évaluations ne sont jamais renvoyés à un compte client : ils
   sont retirés de sa synthèse et les nouvelles routes sont réservées au
   cabinet (`require_staff`). Dans la synthèse d'un client, les listes (lignes
   de facture) s'affichent en clair au lieu de « [object Object] », et un
   champ vide affiche « — » au lieu de « null ».

## Volontairement pas dans ce lot

- **Autres fournisseurs (GPT-4o, Gemini, Mistral OCR)** : je veux d'abord
  mesurer les modèles Claude sur mes vraies pièces.
- **Claude Opus 5.5** : pas encore dans la liste. Je l'ajouterai si Opus 5
  s'avère le meilleur et qu'il faut comparer.
- **Taux de change automatique** : le taux reste une variable
  d'environnement ; le brancher sur une source de change live viendra plus
  tard.
- **Restriction du tableau de bord à certains rôles** : il suit pour
  l'instant l'accès à la page Pièces.
- **Word / Excel** : toujours déposables, mais non analysés (une alerte le dit).

## À tester une fois déployé

1. Connecte-toi avec un compte cabinet (superviseur) et ouvre **Pièces**
   (`/admin/documents`).
2. Choisis un client, laisse « Pièce comptable », choisis **Claude Sonnet 5**
   dans « Modèle d'IA », puis téléverse une facture **scannée en PDF**.
3. Après quelques secondes, le statut passe à « Analysé » (et non plus
   « Erreur d'analyse ») avec une puce « Sonnet 5 · x,xx FCFA · à évaluer »
   dans la colonne « Analyses IA ».
4. Déplie la pièce : vérifie le coût, les tokens, la durée et la mention
   « n image(s) » (envoi en vision).
5. Corrige un champ faux, mets une note (étoiles), puis clique sur
   « Enregistrer l'évaluation ». Le message affiche la précision réelle.
6. Dans le même panneau, choisis **Claude Opus 5**, puis « Relancer avec ce
   modèle ». Une 2ᵉ puce apparaît : évalue-la aussi. Refais l'opération avec
   **Haiku 4.5**. Si l'une des analyses passe en « Erreur d'analyse », le
   message exact s'affiche dans l'alerte orange du panneau.
7. Clique sur **Tableau de bord OCR**, période « Aujourd'hui » : les modèles
   testés apparaissent avec leur coût cumulé, leur coût moyen, leur note et
   leur précision réelle.
8. Connecte-toi avec un compte client et ouvre **Mes pièces** : la synthèse
   s'affiche sans modèle, coût ni note, et les lignes de facture sont lisibles.
9. Dans **Rapports client**, génère le rapport de ce client : les synthèses
   des pièces y figurent comme avant.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
