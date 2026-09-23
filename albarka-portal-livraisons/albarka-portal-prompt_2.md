# Albarka — Lot 2 : l'OCR des pièces passe sur le module commun `ocr_core`

Applique `albarka-portal-corrections_2_aaf483b.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `28d9176` (« Auto-generated
changes », juste après `ccab0b2`, le patch du lot 1 OCR que tu as publié).
C'est un `git format-patch` d'un seul commit : applique-le en UN SEUL `git am`,
puis redéploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/ocr_core/__init__.py`, `models.py`, `prepare.py`, `engine.py`, `review.py`, `stats.py` — module commun d'OCR (modèles, préparation des pièces, appel IA, coût, précision, statistiques)

**Fichiers frontend déplacés** (contenu quasi identique, voir point 3)
- `frontend/src/components/ocr/*` → `frontend/src/components/ocr-core/OcrRunsPanel.jsx`, `OcrDashboard.jsx`, `StarRating.jsx`, `format.js`

**Fichiers modifiés**
- `backend/albarka_ai.py` — devient l'adaptateur Albarka du module commun (même interface qu'au lot 1)
- `backend/albarka_documents.py` — catalogue des modèles, tableau de bord et évaluation délégués au module commun
- `backend/tests/test_ocr_lot1.py` — tests adaptés. Tu ne les lances pas.
- `frontend/src/pages/portal/Documents.jsx` — importe les composants depuis `components/ocr-core/`

Aucune nouvelle dépendance (`emergentintegrations` 0.2.0, `PyMuPDF`, `Pillow`
déjà présents), rien d'ajouté au `package.json`. Aucune migration de données :
les collections `document_ocr_runs` et `document_syntheses` gardent exactement
la même forme. `albarka_myaccount.py` (pré-remplissage KYC) et `server.py` ne
sont pas modifiés.

## Variables d'environnement

- **Déjà présentes, réutilisées telles quelles** : `EMERGENT_LLM_KEY`,
  `USD_TO_XOF_RATE` (facultative, défaut `600`) et `ALBARKA_OCR_DEFAULT_MODEL`
  (facultative) si tu l'as définie : elle reste prioritaire.
- **Nouvelle, facultative** : `OCR_DEFAULT_MODEL` — nom commun à tous mes
  sites pour le modèle par défaut, utilisé seulement si
  `ALBARKA_OCR_DEFAULT_MODEL` est absente (défaut : `claude-sonnet-5`, comme
  aujourd'hui). Rien à configurer si tu ne veux rien changer.
- Aucun paramètre stocké en base (AdminSettings) à configurer.

## Ce que ça apporte, dans l'ordre

1. **Un seul OCR pour tous mes sites.** Je viens de mettre en production le
   même OCR sur ma plateforme Sawali (page « OCR sur Pièces »). Pour ne pas
   maintenir deux copies qui divergent, la logique vit maintenant dans
   `backend/ocr_core/` et `frontend/src/components/ocr-core/`, copies
   identiques d'un module unique que je tiens à jour de mon côté. Ne modifie
   jamais ces fichiers directement : une future amélioration arrivera sous
   forme de patch qui les remplace à l'identique, sur chaque site. Le module ne
   connaît ni base, ni authentification, ni stockage : ce qui est propre au
   cabinet reste dans `albarka_ai.py` et `albarka_documents.py`.

2. **Backend : même comportement, même interface.** `albarka_ai.py` ne garde
   que la consigne du cabinet (construite par `ocr_core.build_system_prompt`,
   avec le même format de réponse JSON qu'au lot 1) et le modèle par défaut ;
   il réexporte `analyze_document(data, content_type, filename, model_id=None)`,
   `DEFAULT_MODEL_ID`, `OCR_MODELS`, `get_model`, `compute_cost`,
   `usd_to_xof_rate` et `prepare_pdf` sous les mêmes noms. La préparation des
   pièces (PDF texte envoyé en texte, PDF scanné converti en images 150 dpi,
   10 pages max, photos redressées et réduites à 1568 px), l'appel via
   `send_message_with_tools().usage` et le calcul du coût sont les mêmes
   qu'au lot 1, désormais dans `ocr_core`. Dans `albarka_documents.py`, les
   routes `/documents/ocr-models`, `/documents/ocr-stats` et
   `/documents/ocr-runs/{id}/review` appellent `ocr_core.public_catalog`,
   `ocr_core.stats_by_model` et `ocr_core.build_review` : mêmes réponses
   qu'avant, champ pour champ. Le reste du fichier (dépôt, droits, envoi par
   e-mail/WhatsApp, rapports) ne change pas.

3. **Frontend : mêmes écrans.** Les quatre composants du lot 1 sont remplacés
   par leurs versions communes, qui prennent en plus une propriété `apiBase`
   (ici `"/documents"`, passée explicitement par `Documents.jsx`) et utilisent
   les couleurs du thème (`primary`, qui vaut déjà le vert du cabinet
   `#0F6B4A`). Seul changement visible : sous la liste « Modèle d'IA », la
   note de Sonnet 5 devient « Modèle recommandé : validé en production sur
   manuscrit et filigrane (Albarka) », suite à mes premiers tests réels.

4. **Correctif : les fichiers Word et Excel ne sont plus envoyés à l'IA.**
   Au lot 1, tout fichier qui n'était ni PDF ni image était décodé comme du
   texte : un `.docx` ou un `.xlsx` (archives binaires) partait donc à Claude
   sous forme de caractères illisibles, était facturé, et l'analyse ne donnait
   rien d'utile. Désormais, seuls les PDF, images et fichiers texte (`.txt`,
   `.csv`) sont analysés ; un Word ou un Excel reste déposable et
   téléchargeable, mais passe en « Erreur d'analyse » avec l'alerte « Type de
   fichier non pris en charge pour l'analyse », pour 0 FCFA.

## Volontairement pas dans ce lot

- **Nouvelles fonctions d'OCR** : ce lot est une migration à comportement
  constant (hors correctif Word/Excel) ; les améliorations viendront ensuite
  dans le module commun.
- **Analyse des Word/Excel** (conversion en texte avant envoi) : pas tant que
  je n'en ai pas le besoin réel.
- **Statut dédié « non analysable »** pour les Word/Excel, distinct de
  « Erreur d'analyse » : à voir selon l'usage.

## À tester une fois déployé

1. Connecte-toi avec un compte cabinet (superviseur) et ouvre **Pièces**
   (`/admin/documents`) : les pièces et analyses du lot 1 sont toujours là,
   avec leurs coûts et leurs notes.
2. Téléverse une facture scannée en PDF avec **Claude Sonnet 5** : elle passe
   à « Analysé » avec une puce « Sonnet 5 · x,xx FCFA · à évaluer ».
3. Déplie-la, corrige un champ, mets une note, enregistre : la précision
   réelle s'affiche. Relance avec **Haiku 4.5** : une 2ᵉ puce apparaît.
4. **Tableau de bord OCR**, période « Tout » : les analyses du lot 1 et les
   nouvelles sont cumulées par modèle.
5. Téléverse un fichier **Word** : il passe en « Erreur d'analyse » avec
   l'alerte « Type de fichier non pris en charge pour l'analyse » et un coût
   de 0,00 FCFA ; il reste téléchargeable.
6. Avec un compte client, ouvre **Mes pièces** : synthèse sans modèle, coût
   ni note, comme avant. Dans **Mon compte**, téléverse une pièce d'identité :
   les champs vides sont toujours pré-remplis par l'IA.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
