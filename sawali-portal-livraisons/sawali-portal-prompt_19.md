# Sawali — Lot 19 : page « OCR sur Pièces » (module commun d'OCR)

Applique `sawali-portal-corrections_19_3190518.patch` sur la branche
`Site-SawaliSmartSystems`. Base attendue : le commit `bd6b16b` (« fix(gestion-stocks):
détection de rupture sur Stock Avant - Qte Livrée, pas Seuil »), c'est-à-dire
le dernier lot que tu as publié. C'est un `git format-patch` d'un seul commit :
applique-le en UN SEUL `git am`, puis redéploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/ocr_core/__init__.py`, `models.py`, `prepare.py`, `engine.py`, `review.py`, `stats.py` — module commun d'OCR (modèles, préparation des pièces, appel IA, coût, précision, statistiques)
- `backend/routes/ocr_pieces.py` — adaptateur Sawali : routes `/api/ocr-pieces`, droits d'accès, stockage, collections Mongo
- `backend/tests/test_ocr_pieces.py` — tests unitaires autonomes (Mongo simulé, IA simulée). Tu ne les lances pas.

**Nouveaux fichiers frontend**
- `frontend/src/pages/portal/OcrPieces.jsx` — la page « OCR sur Pièces »
- `frontend/src/components/ocr-core/OcrRunsPanel.jsx` — analyses d'une pièce : puces par modèle, relance, évaluation (étoiles, corrections)
- `frontend/src/components/ocr-core/OcrDashboard.jsx` — tableau de bord OCR par période et par modèle
- `frontend/src/components/ocr-core/StarRating.jsx` — note de 1 à 5 étoiles
- `frontend/src/components/ocr-core/format.js` — formatage FCFA, pourcentages, noms de modèles

**Fichiers modifiés**
- `backend/server.py` — branchement des routes, juste après celles de Gestion de Stocks (6 lignes)
- `frontend/src/App.js` — routes `/portal/ocr-pieces` et `/admin/ocr-pieces`
- `frontend/src/components/PortalLayout.jsx` — lien « OCR sur Pièces » dans la sidebar admin, dans celle des pharmacies (rôle `pharmacien`) et dans la sidebar réduite des Pharmaciens suivis (ajouté aussi à leur liste de chemins autorisés)

Aucune nouvelle dépendance : `emergentintegrations` 0.1.0, `PyMuPDF` et
`Pillow` sont déjà dans `backend/requirements.txt`, et rien n'est ajouté au
`package.json` (l'icône `ScanText` vient de `lucide-react`, déjà installé). Les
collections Mongo `ocr_pieces` et `ocr_piece_runs` se créent d'elles-mêmes au
premier enregistrement.

## Variables d'environnement

- **Déjà présente, réutilisée telle quelle** : `EMERGENT_LLM_KEY`.
- **Nouvelles, facultatives** (valeurs par défaut correctes si absentes) :
  - `USD_TO_XOF_RATE` — taux de conversion USD → FCFA du coût affiché (défaut : `600`).
  - `OCR_DEFAULT_MODEL` — modèle utilisé pour les dépôts des pharmacies et pré-sélectionné pour l'admin (défaut : `claude-sonnet-5`).
- Aucun paramètre stocké en base (AdminSettings) à configurer.

## Ce que ça apporte, dans l'ordre

1. **Un module d'OCR commun à tous mes sites.** J'ai déjà mis en production
   cet OCR sur mon site Albarka, et Sonnet 5 y donne de très bons résultats
   (factures manuscrites, factures avec filigrane). Pour ne pas maintenir deux
   versions, toute la logique vit maintenant dans `backend/ocr_core/` et
   `frontend/src/components/ocr-core/`. Ce sont des copies identiques d'un
   module unique que je tiens à jour de mon côté. Ne les modifie jamais
   directement ici : une future mise à jour arrivera sous forme de patch qui
   remplace ces fichiers à l'identique. Le module ne connaît ni base, ni
   authentification, ni stockage : ce qui est propre à Sawali est dans
   `routes/ocr_pieces.py`.

2. **Préparation des pièces.** Un PDF qui a une vraie couche texte (au moins
   200 caractères par page) est envoyé en texte, le mode le moins cher. Un PDF
   scanné est converti page par page en images (PyMuPDF, 150 dpi, 10 pages au
   maximum ; au-delà, une alerte le signale). Les photos sont redressées selon
   l'EXIF et réduites à 1568 px sur le grand côté.

3. **Compatibilité avec emergentintegrations 0.1.0.** Sur Sawali, la
   bibliothèque est en 0.1.0 : `send_message()` ne renvoie que le texte, et
   `send_message_with_tools()` n'existe pas encore. Pour lire les tokens
   réellement consommés, `ocr_core/engine.py` utilise la même suite d'appels
   que `send_message()` (`get_messages()`, `_add_user_message()`,
   `_execute_completion()`) mais garde la réponse complète de litellm, avec
   `usage.prompt_tokens` et `usage.completion_tokens`. Comme
   `_execute_completion()` est synchrone, l'appel tourne dans un thread à part
   pour ne pas bloquer le serveur. J'ai vérifié ce chemin sur la vraie
   bibliothèque 0.1.0. Si la plateforme passe un jour en 0.2.0, le même code
   bascule tout seul sur `send_message_with_tools().usage`.

4. **Coût réel de chaque analyse en FCFA.** Le tarif officiel de chaque
   modèle (Opus 5 : 5 $/25 $ par million de tokens en entrée/sortie ; Sonnet 5 :
   2 $/10 $ ; Haiku 4.5 : 1 $/5 $) est appliqué aux tokens réels, converti avec
   `USD_TO_XOF_RATE`. Le coût est enregistré même si la réponse de l'IA est
   inexploitable, puisque les tokens sont facturés dans ce cas aussi. Pour
   Haiku, je reprends l'identifiant daté `claude-haiku-4-5-20251001`, déjà
   éprouvé via le proxy Emergent.

5. **Page « OCR sur Pièces » côté administration** (admin/superviseur).
   Je choisis la pharmacie concernée, le type de pièce (facture, bon de
   livraison, avoir, reçu, relevé, autre) et le modèle d'IA, puis je dépose.
   L'analyse se lance en tâche de fond. La liste se rafraîchit toute seule
   tant qu'une analyse est en cours, et je peux la filtrer par pharmacie. La
   colonne « Analyses » montre chaque analyse (modèle · coût · note). En
   dépliant une pièce, je vois le détail (coût, tokens, durée, envoi en texte
   ou en images), je note l'analyse de 1 à 5 étoiles, je corrige les champs
   faux et j'ajoute les champs oubliés. Le serveur calcule la **précision
   réelle** (part des champs non corrigés), sans compter les simples
   différences de format. « Relancer avec ce modèle » ajoute une analyse sans
   écraser les précédentes, pour comparer les modèles sur une même pièce. La
   bascule « Tableau de bord OCR » affiche, par modèle et par période : nombre
   de pièces, coût cumulé et moyen, note moyenne, précision réelle, confiance
   déclarée et durée moyenne.

6. **Page « OCR sur Pièces » côté pharmacies.** Un compte à rôle `pharmacien`
   ou un Pharmacien suivi dépose ses pièces et consulte la synthèse et les
   champs extraits, puis télécharge l'original. Il ne choisit ni la pharmacie
   ni le modèle (c'est `OCR_DEFAULT_MODEL`). Il ne voit jamais le modèle, le
   coût, les tokens, la confiance ni les évaluations : le serveur les retire
   avant de répondre. Les routes d'administration (modèles, statistiques,
   évaluation, relance, liste des pharmacies) lui répondent 403.

7. **Cloisonnement multi-tenant.** Conformément à ma règle technique, le
   tenant d'une pharmacie est résolu côté serveur depuis la session (mêmes
   premières étapes que `_resolve_client_lie` de `routes/cashier.py` :
   `parent_client_id`, puis `client_id`, sinon le compte lui-même), jamais
   depuis un paramètre envoyé par le navigateur. Un Pharmacien suivi voit donc
   les pièces de sa pharmacie de rattachement, et une pharmacie qui tente
   d'ouvrir, télécharger ou supprimer la pièce d'une autre reçoit un 403.

8. **Stockage et suppression.** Les fichiers vont dans l'Object Storage déjà
   utilisé par la plateforme (`object_storage.save_and_log`, catégorie
   `ocr_pieces`, 20 Mo au maximum ; PDF, JPG, PNG, WEBP, TXT, CSV). La
   suppression d'une pièce (admin, ou pharmacie propriétaire) supprime ses
   analyses et marque le fichier comme supprimé dans `stored_objects`, puisque
   le stockage n'a pas d'API de suppression.

## Volontairement pas dans ce lot

- **Lien entre une pièce et le stock ou la caisse** (création automatique
  d'une réception fournisseur à partir d'un bon de livraison, par exemple) :
  je veux d'abord mesurer la qualité de l'extraction sur de vraies pièces.
- **Autres fournisseurs d'IA (GPT-4o, Gemini, Mistral OCR)** et **Claude
  Opus 5.5** : pas avant d'avoir comparé les trois modèles Claude.
- **Taux de change automatique** : le taux reste une variable
  d'environnement.
- **Word / Excel** : refusés au dépôt sur cette page (extensions non
  autorisées), puisqu'ils ne seraient pas analysés.
- **Accès des autres rôles** (secrétaires, comptables, utilisateurs suivis
  non pharmaciens) : la page leur reste fermée pour l'instant.

## À tester une fois déployé

1. Connecte-toi avec un compte **admin** : le lien **OCR sur Pièces** apparaît
   dans la sidebar et ouvre `/admin/ocr-pieces`, avec le titre « OCR sur Pièces ».
2. Choisis une pharmacie, laisse « Facture », choisis **Claude Sonnet 5**, puis
   dépose une facture **scannée en PDF**. Le statut passe de « Analyse en
   cours » à « Analysée » en quelques secondes, et la colonne « Analyses »
   affiche « Sonnet 5 · x,xx FCFA · non évaluée ».
3. Déplie la pièce : vérifie le coût, les tokens, la durée et la mention
   « n image(s) ». Corrige un champ, mets une note, puis enregistre
   l'évaluation : le message affiche la précision réelle.
4. Choisis **Claude Haiku 4.5**, puis « Relancer avec ce modèle ». Une 2ᵉ
   puce apparaît. Refais l'opération avec **Claude Opus 5**. Si une analyse
   passe en « Erreur d'analyse », le message exact s'affiche dans le panneau.
5. Clique sur **Tableau de bord OCR** : les modèles testés apparaissent avec
   leur coût, leur note et leur précision.
6. Clique sur l'icône de téléchargement d'une pièce : l'original s'ouvre.
7. Connecte-toi avec un compte **pharmacien** : le lien **OCR sur Pièces**
   ouvre `/portal/ocr-pieces`. Dépose une photo de facture. Il n'y a ni choix
   de pharmacie, ni choix de modèle, ni tableau de bord. En dépliant la pièce,
   la synthèse et les champs s'affichent sans modèle, coût ni note. La pièce
   déposée par l'admin pour cette pharmacie à l'étape 2 est visible aussi.
8. Connecte-toi avec un **Pharmacien suivi** : sa sidebar réduite contient
   Posologie, Gestion de Stocks et **OCR sur Pièces**, et il voit les pièces de
   sa pharmacie de rattachement.
9. Connecte-toi avec un autre compte pharmacien : il ne voit aucune des pièces
   de la première pharmacie.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
