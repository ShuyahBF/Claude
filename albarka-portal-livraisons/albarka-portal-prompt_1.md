# Albarka — Lot 1 : mesure et optimisation de l'OCR des pièces comptables

Applique le patch `albarka-portal-corrections_1_0408e93.patch` sur la branche
`main` du portail ALBARKA. Base attendue : le commit `1d6e2e8` (« Restreindre
CORS au domaine réel avant mise en production »). C'est un `git format-patch`
d'un seul commit : applique-le en UN SEUL `git am`, puis déploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Le code a déjà été écrit et testé de
mon côté (17 tests backend autonomes + build frontend en mode CI + parcours
complet dans un navigateur). Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/tests/test_albarka_ocr_lot1.py` — tests autonomes (Mongo simulé, IA simulée). Tu ne les lances pas.

**Nouveaux fichiers frontend**
- `frontend/src/pilot/ocr/StaffUploadCard.jsx` — dépôt d'une pièce par le cabinet avec choix du modèle d'IA
- `frontend/src/pilot/ocr/OcrReviewPanel.jsx` — détail d'une analyse + évaluation (étoiles, corrections)
- `frontend/src/pilot/ocr/OcrDashboard.jsx` — tableau de bord OCR par période et par modèle
- `frontend/src/pilot/ocr/StarRating.jsx` — note de 1 à 5 étoiles
- `frontend/src/pilot/ocr/format.js` — formatage FCFA, pourcentages, noms de modèles

**Fichiers modifiés**
- `backend/albarka_ai.py` — réécrit (appel Claude, coût réel, préparation des images)
- `backend/albarka_documents.py` — choix du modèle, relance, évaluation, statistiques
- `backend/albarka_models.py` — schéma documenté des exécutions d'analyse et des évaluations
- `frontend/src/pilot/pages/StaffOverview.jsx` — vue cabinet refondue (onglets Pièces / Tableau de bord OCR)
- `frontend/src/pilot/DocumentSynthesis.jsx` — les listes (lignes de facture) s'affichent lisiblement au lieu de « [object Object] »

Aucune nouvelle dépendance : `emergentintegrations`, `litellm`, `PyMuPDF` et
`pillow` sont déjà dans `backend/requirements.txt`, et rien n'est ajouté au
`package.json`. Le point d'entrée du pilote (`backend/albarka_app.py`) n'est
pas modifié : les nouvelles routes passent par le routeur `/api/documents`
déjà monté.

## Variables d'environnement

- **Déjà présente, réutilisée telle quelle** : `EMERGENT_LLM_KEY`. L'analyse
  des pièces passe désormais par elle, comme le reste de la plateforme.
  `ANTHROPIC_API_KEY` n'est plus utilisée par l'OCR : tu n'as pas à la créer.
- **Nouvelles, facultatives** (valeurs par défaut correctes si absentes) :
  - `USD_TO_XOF_RATE` — taux de conversion USD → FCFA pour le coût affiché (défaut : `600`).
  - `ALBARKA_OCR_DEFAULT_MODEL` — modèle utilisé pour les pièces déposées par les clients eux-mêmes (défaut : `claude-opus-5`).
- Aucun paramètre stocké en base à configurer.

## Ce que ça apporte, dans l'ordre

1. **L'OCR passe par `EMERGENT_LLM_KEY` au lieu d'`ANTHROPIC_API_KEY`.**
   Jusqu'ici, `albarka_ai.py` appelait directement le SDK Anthropic avec une
   clé `ANTHROPIC_API_KEY` qui n'est pas configurée sur le site. J'aligne
   Albarka sur la convention de Sawali : `LlmChat` d'`emergentintegrations`
   avec la clé universelle. Le proxy Emergent n'acceptant de manière fiable que
   des images pour Claude, chaque page d'un PDF est convertie en image
   (PyMuPDF, 150 dpi, 10 pages au maximum ; au-delà, une alerte le signale).

2. **Choix du modèle avant téléversement** (staff uniquement). Trois modèles
   sont proposés dans une liste déroulante : Claude Opus 5 (le plus précis),
   Sonnet 5 (compromis) et Haiku 4.5 (le moins cher). Pour Haiku, je reprends
   l'identifiant `claude-haiku-4-5-20251001`, déjà éprouvé en production via le
   proxy Emergent sur Sawali. Les clients ne choisissent pas : leurs dépôts
   utilisent le modèle par défaut.

3. **Coût réel de chaque pièce en FCFA.** `LlmChat.send_message()` ne renvoie
   que le texte. J'appelle donc `_execute_completion()` de la même classe (même
   routage proxy) pour lire les tokens réellement consommés
   (`usage.prompt_tokens` / `usage.completion_tokens`), puis j'applique le tarif
   officiel du modèle et le taux `USD_TO_XOF_RATE`. Le coût est comptabilisé
   même quand la réponse de l'IA est inexploitable, puisque les tokens sont
   facturés dans ce cas aussi.

4. **Optimisation des images avant envoi.** Les photos de téléphone sont
   redressées (orientation EXIF) et réduites à 1568 px sur le grand côté,
   taille à laquelle Claude les réduit de toute façon : la requête est plus
   légère sans perte de lisibilité.

5. **Une analyse = une exécution conservée.** Chaque analyse est enregistrée
   séparément dans `document_syntheses`, avec son propre identifiant.
   « Relancer avec ce modèle » ajoute donc une nouvelle exécution sans écraser
   la précédente, et je peux comparer les modèles sur la même pièce. Les
   anciennes synthèses restent lisibles.

6. **Évaluation humaine : étoiles + corrections.** Sur chaque exécution, je
   note de 1 à 5 étoiles, je corrige les champs faux et j'ajoute ceux que l'IA a
   oubliés. Le serveur calcule la **précision réelle** (part des champs non
   corrigés), sans compter les simples différences de format (« 150 000 » et
   150000 sont égaux). Elle reste distincte de la confiance que le modèle
   s'attribue lui-même, affichée à titre indicatif. Les champs jugés
   incertains par le modèle sont surlignés en orange.

7. **Tableau de bord OCR** (onglet dédié, période : aujourd'hui, 7 jours,
   30 jours ou tout). Par modèle et au total : nombre de pièces, coût cumulé,
   coût moyen, note moyenne, précision réelle moyenne, confiance déclarée et
   durée moyenne.

8. **Confidentialité.** Le modèle, le coût, les tokens et les évaluations ne
   sont jamais renvoyés à un compte client : il ne voit que la dernière
   synthèse. Les nouvelles routes (`/documents/ocr-models`, `/clients`,
   `/ocr-stats`, `/reanalyze`, `/syntheses/{id}/review`) sont réservées au
   staff.

9. **Lien vers la pièce originale** dans la fenêtre d'analyse, pour comparer
   le résultat au document.

## Volontairement pas dans ce lot

- **Autres fournisseurs (GPT-4o, Gemini, Mistral OCR)** : je veux d'abord
  mesurer les modèles Claude sur mes vraies pièces.
- **Claude Opus 5.5** : pas encore dans la liste. Je l'ajouterai si Opus 5
  s'avère le meilleur et qu'il faut comparer.
- **Taux de change automatique** : le taux reste une variable
  d'environnement ; le brancher sur une source de change live est prévu plus
  tard.
- **Restriction fine par rôle** : tout le staff voit l'OCR, comme le reste du
  pilote.
- **Word / Excel** : ces fichiers restent déposables mais ne sont pas
  analysés (une alerte le dit).

## À tester une fois déployé

1. Connecte-toi avec un compte cabinet (superviseur ou comptable).
2. Onglet **Pièces** : laisse « Tests OCR (interne au cabinet) » comme client,
   choisis **Claude Sonnet 5**, téléverse une facture scannée (JPG ou PDF),
   puis clique sur « Téléverser et analyser ».
3. Après quelques secondes, la ligne passe à « Analysé » avec une puce
   « Sonnet 5 · x,xx FCFA · à évaluer ». Si le statut est « Erreur d'analyse »,
   ouvre la pièce : le message d'erreur exact est affiché dans les alertes.
4. Clique sur **Ouvrir** : vérifie le coût, les tokens et la durée, puis
   « Voir / télécharger la pièce originale ».
5. Corrige un champ faux, mets une note (étoiles), puis clique sur
   « Enregistrer l'évaluation ». Le message affiche la précision réelle.
6. Dans la même fenêtre, choisis **Claude Opus 5**, puis « Relancer avec ce
   modèle ». Une 2ᵉ puce apparaît : évalue-la aussi. Refais l'opération avec
   **Haiku 4.5**.
7. Onglet **Tableau de bord OCR**, période « Aujourd'hui » : les trois modèles
   apparaissent avec leur coût cumulé, leur coût moyen, leur note et leur
   précision réelle.
8. Connecte-toi avec un compte client, dépose une pièce et ouvre-la : la
   synthèse s'affiche sans modèle, coût ni note.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
