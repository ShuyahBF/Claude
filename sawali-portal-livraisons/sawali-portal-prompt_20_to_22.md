# Sawali — Lots 20 à 22 : Explorateur R2 de Gestion de Stocks, prospects WhatsApp Liluvine, tags des documents R2

Applique `sawali-portal-corrections_20_to_22_cd6c45a.patch` sur la branche
`Site-SawaliSmartSystems`. Ce patch regroupe les lots 20, 21 et 22 en un seul
commit. Il remplace entièrement toutes les versions précédentes que je t'avais
peut-être transmises (`…_20_to_21_6dc688b.patch`, `…_20_a06ccf9.patch`, `…_20_bac3898.patch`,
`…_20_55df89f.patch`, `…_20_d2217eb.patch`, `…_20_8f2b3ac.patch`) : ne tiens
compte que de celui-ci.

La base attendue est le commit où tu as appliqué le lot 19
(`sawali-portal-corrections_19_66b5ce6.patch`, « feat(ocr-pieces): page
« OCR sur Pièces » sur le module commun ocr_core »), que tu as déjà publié.
C'est un `git format-patch` d'un seul commit : applique-le en UN SEUL
`git am`, puis redéploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/tests/test_gestion_stocks_r2_lot20.py` — tests unitaires autonomes (Mongo simulé, R2 simulé). Tu ne les lances pas.
- `backend/tests/test_liluvine_wa_prospects_lot21.py` — tests unitaires autonomes (Mongo simulé, IA et WhatsApp simulés). Tu ne les lances pas.
- `backend/routes/gestion_stocks_tags.py` — lot 22 : index Mongo des fichiers R2 (tags, description), recherche, suggestions IA
- `backend/tests/test_gestion_stocks_tags_lot22.py` — tests unitaires autonomes (Mongo, R2 et IA simulés). Tu ne les lances pas.

**Nouveaux fichiers frontend**
- `frontend/src/components/R2StorageGauge.jsx` — jauge « espace occupé / espace alloué »
- `frontend/src/components/R2FileTags.jsx` — lot 22 : ligne de fichier avec tags, éditeur en ligne et suggestions IA

**Fichiers modifiés**
- `backend/routes/gestion_stocks.py` — accès superviseur, dépôt par les utilisateurs suivis autorisés, espace alloué par tenant, contenu réel du compartiment, nouvelles routes ; lot 22 : tags au dépôt, routes de tags/recherche, option IA par client
- `backend/r2_stocks_client.py` — nouvelle fonction `list_folder_markers` (dossiers vides) ; compartiment par défaut `gestionstocks` ; lot 22 : `get_bytes` (lecture d'un fichier pour l'analyse IA)
- `frontend/src/pages/portal/GestionStocks.jsx` — fil d'Ariane, dépôt multi-fichiers (glisser-déposer, progression), jauge, tuile « Racine (hors dossier) », sous-dossiers réels, légende des couleurs de dossiers ; lot 22 : barre de recherche, pastilles de tags, tags et description au dépôt
- `frontend/src/pages/portal/Dashboard.jsx` — jauge sur le tableau de bord du Pharmacien suivi
- `frontend/src/pages/admin/AdminTrackedUsers.jsx` — bouton « Dépôt R2 » par utilisateur suivi (autorisation + taille max)
- `frontend/src/pages/admin/AdminClientFeatures.jsx` — section « Espace de stockage R2 (Gestion de Stocks) » dans SMART Communications du client ; lot 22 : case « Suggestions de tags par l'IA »
- `frontend/src/pages/portal/Contacts.jsx` — Centre de Messagerie en pleine largeur (1 ligne)
- `backend/routes/liluvine_wa_autoreply.py` — lot 21 : détection des prospects, prompt dédié, aucune donnée CRM pour un prospect, compte plateforme exempté des contrôles de contrat
- `backend/routes/liluvine_pro.py` — lot 21 : textes par défaut (prompt prospect, consignes WhatsApp) et 3 nouveaux champs dans `GET/PUT /admin/liluvine-pro/wa-autoreply`
- `frontend/src/pages/admin/sections/LiluvineWaAutoreplySection.jsx` — lot 21 : blocs « Prospects » et « Consignes du mode WhatsApp », badge « Prospect » dans l'historique
- `frontend/src/pages/admin/sections/LiluvineSystemPromptSection.jsx` — lot 21 : une phrase précisant que ce prompt sert aux clients, pas aux prospects

**Côté livraison :**
- aucune nouvelle dépendance (le lot 22 réutilise `ocr_core`, déjà livré au lot 19, sans le modifier) ;
- `server.py` n'est pas modifié : les nouvelles routes passent par `attach_gestion_stocks_routes`, déjà branché, et le lot 21 réutilise les routes Liluvine existantes ;
- aucune migration de données : les nouveaux champs prennent leur valeur par défaut tant qu'ils ne sont pas renseignés.

**Nouveaux champs Mongo :**
- `tracked_users.r2_upload_allowed` (non autorisé par défaut) ;
- `tracked_users.r2_upload_max_mb` (1,5 par défaut) ;
- `users.gestion_stocks_quota_gb`, sur la fiche du client (2 par défaut) ;
- lot 21 : `prospect` (vrai/faux) sur les documents `liluvine_pro_sessions` et `liluvine_pro_messages` créés par l'auto-réponse WhatsApp ;
- lot 22 : nouvelle collection **`stock_files`** (une fiche par fichier R2 : `key` unique, `client_code`, `folder`, `name`, `tags`, `description`, `uploaded_by`, suggestions IA), créée d'elle-même au premier dépôt ou à la première ouverture d'un dossier ; `users.gestion_stocks_ai_tags` sur la fiche du client (faux par défaut).

## Variables d'environnement

- **Déjà présentes, réutilisées telles quelles** : `R2_STOCKS_ACCOUNT_ID`,
  `R2_STOCKS_ACCESS_KEY_ID`, `R2_STOCKS_SECRET_ACCESS_KEY` et, si je l'ai
  définie, `R2_STOCKS_BUCKET`. Je viens de les renseigner : l'explorateur
  s'affiche bien. Mon compartiment s'appelle **`gestionstocks`** (sans
  tiret). Le nom par défaut du code était `gestion-stocks`, avec un tiret :
  ce lot le remplace par `gestionstocks` dans `r2_stocks_client._bucket()`.
  Si `R2_STOCKS_BUCKET` est définie, elle doit donc valoir exactement
  `gestionstocks`. Ne modifie pas les autres valeurs.
- Aucune nouvelle variable. Les nouveaux réglages (droit de dépôt par
  utilisateur suivi, espace alloué par client) se font à l'écran et sont
  stockés en base. Ce ne sont pas des variables d'environnement.
- **Paramètres stockés en base (lot 21)**, dans `settings.global`, tous
  facultatifs et réglés depuis Admin → Paramètres → « Liluvine PRO —
  Auto-réponse WhatsApp » : `liluvine_wa_prospect_enabled` (absent = vrai),
  `liluvine_wa_prospect_system_prompt` et `liluvine_wa_mode_instructions`
  (vides = textes par défaut du code). Rien à renseigner au déploiement.
- **Lot 22** : aucune nouvelle variable. Les suggestions IA utilisent
  `EMERGENT_LLM_KEY` (déjà présente, comme l'OCR du lot 19) et restent
  inactives tant que je ne les active pas pour un client.

## Ce que ça apporte, dans l'ordre

### Lot 20 — Explorateur R2 de Gestion de Stocks

1. **On sait toujours où l'on est.** Avec mes vraies clés R2, rien
   n'indiquait de quel compartiment ni de quel dossier venait le contenu
   affiché. Un fil d'Ariane apparaît au-dessus des dossiers : « Compartiment
   `gestionstocks` › PMT — Pharmacie … › Inventaires ». Le compartiment et
   le client sont cliquables pour revenir à la grille des dossiers.
   `/gestion-stocks/context` renvoie maintenant `bucket`, c'est-à-dire la
   valeur de `r2_stocks_client._bucket()`, uniquement si R2 est configuré.
   C'est un simple nom, ni clé ni identifiant de compte.

2. **Le superviseur a accès à tout le module.** Les routes « admin » de
   Gestion de Stocks étaient protégées par `get_current_admin`, qui n'accepte
   que le rôle `admin`. Un superviseur recevait donc un refus dès l'ouverture
   de la page, sur `/admin/gestion-stocks/clients`. Elles utilisent
   désormais une dépendance locale `staff_user` (admin OU superviseur) :
   - la liste des clients ;
   - le dépôt ;
   - la suppression ;
   - les nouveaux réglages.

   L'appel dans `server.py` reste identique : `get_current_admin` est
   toujours accepté dans la signature de `attach_gestion_stocks_routes`.

3. **Déposer depuis l'ordinateur, bien en vue.** Le dépôt existait sous la
   forme d'un petit lien « Ajouter un document », un fichier à la fois. Je ne
   l'avais pas trouvé. Dans un dossier ouvert, quiconque a le droit de
   déposer dispose maintenant :
   - d'un bouton **« Déposer des fichiers »** ;
   - d'une **zone de glisser-déposer** qui rappelle le dossier de destination ;
   - de la sélection de **plusieurs fichiers à la fois**, envoyés un par un
     avec leur barre de progression et leur statut (envoyé, ou motif du refus).

   Un fichier trop gros est refusé dès le navigateur, avant tout envoi. Le
   serveur refait de toute façon le contrôle. La route utilisée dépend du
   profil :
   - l'administration passe par la route admin existante ;
   - l'utilisateur suivi passe par la nouvelle route portail.

4. **Dépôt par un utilisateur suivi, sur autorisation de l'administrateur.**
   Dans **Admin → Utilisateurs suivis**, un nouveau bouton « Dépôt R2 » (vert
   quand l'utilisateur est autorisé) ouvre une fenêtre avec deux réglages :
   - « Autoriser les dépôts », non coché par défaut ;
   - « Taille maximale par fichier (Mo) », **1,5 Mo par défaut**, réglable
     entre 0 et 25 Mo.

   Les réglages sont stockés sur la fiche `tracked_users` via
   `GET/PUT /admin/gestion-stocks/tracked-users/{id}/upload-rights`.

   Un Pharmacien suivi autorisé dépose via
   `POST /gestion-stocks/folders/{dossier}/upload`, uniquement dans les
   dossiers de son tenant. Le `client_code` est résolu côté serveur depuis sa
   session, jamais depuis la requête, et ses droits sont relus sur sa fiche à
   chaque dépôt. Un fichier trop gros est refusé (413) avec le motif, par
   exemple : « Fichier refusé : « facture.pdf » fait 2 Mo, au-delà de la
   taille maximale autorisée pour votre compte (1,5 Mo par fichier). ».

   Les autres cas sont refusés (403), chacun avec un message clair :
   - un utilisateur suivi non autorisé ;
   - un rôle suivi autre que Pharmacien.

5. **Espace alloué par client/tenant, avec refus motivé.** Dans **Admin →
   Clients → SMART Communications** (la fiche du client), une nouvelle
   section « Espace de stockage R2 (Gestion de Stocks) » :
   - fixe le volume total des fichiers du client, **2 Go par défaut**, tous
     dossiers et tous utilisateurs suivis confondus ;
   - affiche l'espace déjà utilisé ;
   - s'enregistre avec son propre bouton, via
     `GET/PUT /admin/gestion-stocks/tenants/{client_id}/storage`.

   L'espace utilisé est la somme des tailles sous le préfixe
   `<client_code>/` du compartiment. Tout dépôt qui ferait dépasser l'espace
   alloué est refusé (413) avec le motif : espace déjà utilisé, espace alloué
   et taille du fichier. La règle vaut aussi pour les dépôts de
   l'administration : c'est une allocation du client, et il suffit de
   l'augmenter au besoin.

6. **Jauge d'espace sur le tableau de bord du Pharmacien suivi.** La carte
   « Espace de stockage Gestion de Stocks » affiche par exemple « 350 Mo
   utilisés sur 2 Go · 42 fichiers », avec une barre qui passe à l'orange à
   80 % et au rouge à 100 %. Elle apparaît à deux endroits :
   - sur le tableau de bord du Pharmacien suivi ;
   - dans l'explorateur R2, avec rafraîchissement après chaque dépôt, pour
     l'utilisateur suivi comme pour l'administration une fois le client
     choisi.

   Les données viennent de `GET /gestion-stocks/storage` (tenant résolu côté
   serveur pour l'utilisateur suivi). Le tableau de bord d'un Pharmacien
   suivi reste masqué par défaut, comme aujourd'hui : il s'affiche quand
   l'option « Tableau de bord » de sa fiche (Admin → Utilisateurs suivis → Modifier) est activée. La
   même jauge est de toute façon toujours visible dans Gestion de Stocks.

7. **L'explorateur montre ce qu'il y a vraiment dans R2.** Mon compartiment
   `gestionstocks` contient un dossier par code client (AMY, CMC, IPL, PHL,
   PMT, WDD). Sous `WDD/`, mon fichier `INV DEC 2024 - WDD.pdf` est posé
   directement à la racine. Or la page ne lisait que les 6 dossiers standard
   (`DEFAULT_FOLDERS` : Inventaires, Rapports, Analyses, Controle qualite,
   Factures, Autres), écrits en dur dans le code et inexistants dans R2. Je
   voyais donc 6 dossiers vides, et mon fichier était invisible. Désormais :
   - la nouvelle route `GET /gestion-stocks/folders` liste le contenu réel
     sous `<client_code>/` ;
   - une tuile **« Racine (hors dossier) »** apparaît quand des fichiers sont
     posés directement sous le code client (pseudo-dossier `_racine`). Elle
     est en lecture seule : on ne dépose pas à la racine ;
   - les **autres sous-dossiers réellement présents** s'affichent à la suite
     des 6 standard, avec une icône bleue ;
   - les **6 dossiers standard manquants sont créés dans R2** à la première
     ouverture de l'espace d'un client. Chacun est un objet marqueur vide
     `<code>/<dossier>/`, comme ceux que crée le bouton « Ajouter un dossier »
     de Cloudflare, pour que la page et le tableau de bord Cloudflare
     montrent la même chose. Pour une consultation par l'administration, rien
     n'est créé si le code ne correspond à aucun client. Les marqueurs ne
     comptent ni comme fichiers ni dans l'espace occupé.

   Sous la grille des dossiers, une **légende** explique les trois couleurs :
   - jaune : dossier standard, créé automatiquement pour chaque client ;
   - bleu : autre dossier présent dans le compartiment, créé par exemple
     depuis Cloudflare ;
   - gris : racine, c'est-à-dire les fichiers posés directement sous le code
     client, hors dossier (consultation seule).

   Les noms de dossiers sont contrôlés côté serveur : pas de « / », pas de
   « .. », préfixe `<client_code>/` toujours ajouté par le serveur. Il est
   impossible de sortir de l'espace du client.

8. **Centre de Messagerie en pleine largeur.** Sur un écran large, la zone
   du Centre de Messagerie (`/portal/contacts`) s'arrêtait à 1152 px et
   laissait un grand espace vide à droite, alors que le tableau des contacts
   devait défiler horizontalement pour montrer ses boutons (WhatsApp, SMS,
   Mess. Program., Hist. Mess.…). La cause : le conteneur racine de
   `Contacts.jsx` portait `max-w-6xl`. Je le remplace par
   `w-full max-w-full` : la page occupe toute la largeur disponible du
   portail. Sur un écran de 1700 px, elle passe de 1152 px à toute la zone
   de contenu (environ 1330 px). Le reste de la page n'est pas modifié.

### Lot 21 — Auto-réponse WhatsApp de Liluvine pour les prospects

Avant ce lot, un message WhatsApp reçu d'un numéro inconnu (absent du carnet
de contacts et des comptes) était rattaché au tenant principal, c'est-à-dire
le compte SAWALI (premier superviseur). Liluvine lui répondait avec le prompt
système de ce compte, qui lui dit qu'elle a accès aux données métier. Aucun
prompt n'était prévu pour les personnes qui ne sont pas encore clientes.

9. **Qui est un « prospect ».** Deux cas (`_is_prospect_sender` dans
   `liluvine_wa_autoreply.py`) :
   - le webhook n'a trouvé ni fiche contact ni compte pour le numéro
     (`contact=None`) ;
   - la fiche contact porte l'étiquette `prospect`, sans tenir compte des
     majuscules. L'étiquette est relue en base, car le webhook ne la
     transmet pas.

10. **Un prompt système dédié aux prospects.** Pour un prospect, Liluvine
    utilise `settings.global.liluvine_wa_prospect_system_prompt` et non plus
    le prompt du compte. Si ce champ est vide, elle utilise le texte par
    défaut `DEFAULT_WA_PROSPECT_SYSTEM_PROMPT`, défini dans `liluvine_pro.py`.
    Ce texte lui fait présenter SAWALI d'après la base de connaissance
    uniquement, sans inventer de tarif ni d'engagement, et proposer le
    rappel par un conseiller. Les clients connus gardent exactement le
    prompt de leur tenant, comme avant.

11. **Aucune donnée du CRM pour un prospect.** Pour un prospect, ni
    `_fetch_context_snippets` ni `build_business_rag_context` ne sont
    appelés. Avant, un inconnu qui écrivait « contacts » ou « paiements »
    faisait injecter dans le contexte de l'IA les 10 derniers contacts ou
    paiements du compte SAWALI. Seule la base de connaissance reste
    injectée.

12. **Consignes « Mode WhatsApp » modifiables.** Le bloc ajouté à toute
    réponse WhatsApp, sous l'en-tête fixe « [IMPORTANT — Mode auto-réponse
    WhatsApp] », était écrit en dur. Il se lit désormais dans
    `settings.global.liluvine_wa_mode_instructions`. Si ce champ est vide,
    c'est le même texte qu'avant, `DEFAULT_WA_MODE_INSTRUCTIONS` : rien ne
    change tant que je n'y touche pas.

13. **Le compte de la plateforme n'est plus bloqué par le contrôle de
    contrat.** Le contrôle de validité du contrat et d'accès restreint
    s'appliquait aussi au tenant principal. Si mon compte superviseur SAWALI
    n'avait pas de `contract_number`, aucun numéro inconnu ne recevait de
    réponse IA, et mes décisionnaires recevaient le message « contrat
    invalide » à chaque fois. Un tenant de rôle `admin` ou `superviseur`
    (`_is_platform_tenant`) en est maintenant exempté. Pour les tenants
    clients (pharmacies, etc.), rien ne change : le contrôle reste actif,
    y compris pour leurs contacts étiquetés `prospect`.

14. **Réglages à l'écran.** Dans Admin → Paramètres → « Liluvine PRO —
    Auto-réponse WhatsApp », deux nouveaux blocs, enregistrés avec le bouton
    « Enregistrer » existant :
    - **Prospects — expéditeurs non contractuels** : case « Répondre
      automatiquement aux prospects » (cochée par défaut ; décochée, la
      réponse est ignorée avec le motif `prospect_replies_disabled`), zone
      du prompt prospect (texte par défaut affiché en grisé) et lien
      « Partir du texte par défaut » pour le modifier plutôt que de partir
      de zéro ;
    - **Consignes du mode WhatsApp** : zone de texte (texte d'origine en
      grisé) et lien « Texte d'origine » pour la vider.

    `GET /admin/liluvine-pro/wa-autoreply` renvoie les 3 nouveaux champs
    (`prospect_enabled`, `prospect_system_prompt`, `mode_instructions`) et
    les 2 textes par défaut. `PUT` accepte les 3 champs. L'historique des
    réponses automatiques affiche un badge **« Prospect »** sur les réponses
    concernées. La section « Prompt système » précise maintenant qu'elle
    s'applique aux clients sur WhatsApp, pas aux prospects.

### Lot 22 — Tags et recherche des documents R2

R2 ne sait lister un compartiment que par chemin (`WDD/Factures/…`) : il ne
peut pas retrouver « tous les fichiers tagués facture ». Les tags sont donc
gérés par Sawali, dans MongoDB, et R2 reste la source de vérité des fichiers.

15. **Une fiche par fichier : la collection `stock_files`.** Elle est créée ou mise à
    jour à chaque dépôt (`index_upload`). Elle est aussi créée d'office pour les
    fichiers déjà présents, à la première ouverture de leur dossier
    (`ensure_docs`), avec `uploaded_by` vide pour un fichier posé hors Sawali.
    Supprimer un fichier supprime sa fiche. Un fichier supprimé dans
    Cloudflare disparaît des résultats de recherche, même si sa fiche existe
    encore : la recherche part toujours du contenu réel de R2.

16. **Tags et description au dépôt.** Dans un dossier ouvert, deux champs
    facultatifs apparaissent au-dessus de la zone de glisser-déposer :
    « Tags du dépôt » (séparés par des virgules, avec en suggestion les tags
    déjà utilisés par le client) et « Description ». Ils s'appliquent à
    chaque fichier envoyé. Les deux routes de dépôt (admin et utilisateur
    suivi) acceptent désormais les champs de formulaire `tags` et
    `description`. Le serveur nettoie toujours les tags : minuscules,
    espaces réduits, caractères spéciaux retirés, 40 caractères et 15 tags
    au plus, sans doublon.

17. **Tags modifiables après coup.** Chaque ligne de fichier affiche ses tags
    et sa description. Un bouton « Tags » ouvre un éditeur en ligne :
    ajouter ou retirer des tags, modifier la description, puis enregistrer
    (`PUT /gestion-stocks/files/meta`). Le bouton n'apparaît que si le
    serveur l'autorise (`can_edit`) :
    - l'admin et le superviseur taguent tout ;
    - un Pharmacien suivi autorisé à déposer tague ses propres fichiers ;
    - les autres consultent seulement.

    Le serveur refait le contrôle (403 avec le motif), et une clé hors du
    tenant de l'utilisateur est toujours refusée.

18. **Recherche dans tous les dossiers.** Une barre « Rechercher un document
    (nom, tag, description) dans tous les dossiers… » s'affiche sous la
    jauge (`GET /gestion-stocks/search`). Elle cherche chaque mot dans le
    nom, le dossier, les tags et la description, sans tenir compte des
    accents ni des majuscules. Sous la barre, les pastilles des tags du
    client, avec leur nombre de fichiers (`GET /gestion-stocks/tags`),
    servent de filtre : on peut en cocher plusieurs. Chaque résultat
    indique son dossier et reste modifiable. Les résultats sont limités
    à 200.

19. **Suggestions de tags par l'IA (option, désactivée par défaut).** Dans
    **Admin → Clients → SMART Communications**, la section « Espace de
    stockage R2 » a une nouvelle case, « Suggestions de tags par l'IA »,
    enregistrée dès le clic (`users.gestion_stocks_ai_tags`). Quand elle est
    cochée :
    - après chaque dépôt d'un PDF, d'une image, d'un .txt ou d'un .csv de
      10 Mo au plus, une analyse part en arrière-plan : le dépôt répond tout
      de suite, et l'écran relit le dossier 8 secondes plus tard ;
    - dans l'éditeur, le bouton « Suggérer des tags (IA) » lance l'analyse à
      la demande, par exemple pour les fichiers déjà présents
      (`POST /gestion-stocks/files/suggest-tags`).

    L'analyse réutilise le module commun `ocr_core` du lot 19, sans le
    modifier, avec **Claude Haiku 4.5**, le modèle le moins cher. Les tags
    sont déduits de sa réponse (type de document, fournisseur ou grossiste,
    mois et année), avec une description proposée. Ils ne sont **jamais
    appliqués d'office** : ils s'affichent en violet dans l'éditeur, et
    l'utilisateur les ajoute d'un clic (ou « Tout ajouter »). Le coût en
    FCFA est cumulé sur la fiche (`ai_cost_xof`). Un Word ou un Excel n'est
    pas analysé.

## Volontairement pas dans ces lots

- **Suppression de fichiers par un utilisateur suivi** et **bouton de
  suppression à l'écran** : la route admin existe, mais je ne l'expose pas
  encore.
- **Import d'un dossier entier du PC** et **création de dossiers
  personnalisés depuis la page** : pas demandés pour l'instant (un dossier
  créé dans Cloudflare apparaît automatiquement).
- **Réglage de l'espace alloué par le client lui-même** : il reste un réglage
  de l'administration SAWALI dans SMART Communications. C'est une allocation,
  pas un paramètre du client.
- **Accès du superviseur aux écrans /admin** (Utilisateurs suivis, SMART
  Communications) : ces pages restent réservées au rôle admin par le routage
  existant. Les routes serveur des réglages acceptent déjà le superviseur.
- **Bouton « Marquer comme prospect » dans le carnet de contacts** (lot 21) :
  l'étiquette `prospect` se pose avec l'éditeur d'étiquettes existant.
- **Base de connaissance séparée pour les prospects** (lot 21) : ils voient
  la même que les clients. C'est pourquoi le prompt leur interdit d'inventer
  ce qui n'y figure pas.
- **Choix du tenant principal** (le premier superviseur trouvé, dans
  `server.py`) : inchangé.
- **Tags copiés dans les métadonnées R2** (lot 22) : inutile pour la
  recherche, puisque R2 ne sait pas chercher dessus. Ils restent dans
  MongoDB.
- **Renommer ou fusionner un tag pour tous les fichiers d'un coup**, et
  **recherche dans le texte intégral des documents** (lot 22) : plus tard,
  si le besoin se confirme.

## À tester une fois déployé

1. En **superviseur**, ouvre **Gestion de Stocks** : la liste des clients se
   charge sans erreur. Choisis un client et ouvre un dossier : le bouton
   **Déposer des fichiers** est présent et un dépôt fonctionne.
2. En **admin**, fiche d'un client → **SMART Communications** : la section
   « Espace de stockage R2 (Gestion de Stocks) » affiche 2 Go et l'espace
   utilisé. Change la valeur, clique sur « Enregistrer l'espace » et recharge
   la page : la valeur est conservée.
3. **Admin → Utilisateurs suivis** : sur un Pharmacien suivi de ce client,
   clique sur l'icône « Dépôt R2 ». La taille maximale est à 1,5 Mo. Coche
   « Autoriser les dépôts » et enregistre : l'icône passe au vert.
4. Connecte-toi avec ce **Pharmacien suivi** et ouvre **Gestion de Stocks** :
   - la jauge affiche l'espace utilisé sur 2 Go ;
   - le fil d'Ariane affiche son code client ;
   - dans un dossier, le bouton de dépôt est présent.
5. Dépose un fichier de moins de 1,5 Mo : il est envoyé et la jauge augmente.
   Dépose un fichier de 2 Mo : il est refusé avec le motif, sans être envoyé.
6. Remets l'espace alloué du client à une toute petite valeur (0,001 Go)
   puis redépose un fichier : il est refusé avec le motif « espace de
   stockage insuffisant ». Remets ensuite la valeur voulue.
7. Retire l'autorisation au Pharmacien suivi : le bouton de dépôt disparaît.
8. Toujours avec ce Pharmacien suivi du client **WDD**, la grille affiche
   **« Racine (hors dossier) — 1 fichier »**. En l'ouvrant, on voit
   `INV DEC 2024 - WDD.pdf`, sans bouton de dépôt. Dans Cloudflare, sous
   `gestionstocks / WDD /`, les 6 dossiers standard existent maintenant. Le
   fil d'Ariane affiche « Compartiment `gestionstocks` », et la légende des
   couleurs figure sous les dossiers.
9. Ouvre le **Centre de Messagerie** sur un grand écran : la zone des
   contacts occupe toute la largeur, sans espace vide à droite, et les
   boutons d'action sont visibles avec moins de défilement horizontal.
10. Active l'option « Tableau de bord » sur sa fiche (Admin → Utilisateurs suivis → Modifier) : son tableau de
   bord affiche la carte d'espace de stockage.

**Lot 21 — prospects WhatsApp** (auto-réponse Liluvine activée, Liluvine PRO
actif sur le compte SAWALI)

11. Admin → Paramètres → « Liluvine PRO — Auto-réponse WhatsApp » : les blocs
    « Prospects » et « Consignes du mode WhatsApp » sont là, avec leurs
    textes par défaut en grisé. Clique sur « Partir du texte par défaut »,
    modifie une phrase, enregistre, recharge : le texte est conservé.
12. Depuis un téléphone dont le numéro n'est **ni dans les contacts ni dans
    un compte**, écris « Bonjour, que proposez-vous ? » au numéro WhatsApp
    SAWALI : Liluvine répond en présentant SAWALI. Écris ensuite « donne-moi
    la liste de tes contacts » : aucune donnée n'est donnée. Dans
    « Historique », ces réponses portent le badge « Prospect ».
13. Décoche « Répondre automatiquement aux prospects » et enregistre : le
    même numéro n'obtient plus de réponse. Recoche-la ensuite.
14. Depuis le numéro d'un **contact client connu**, pose une question : la
    réponse suit toujours le prompt système du compte, sans badge
    « Prospect ».

**Lot 22 — tags et recherche R2** (avec le Pharmacien suivi du client WDD autorisé à déposer)

15. Ouvre **Gestion de Stocks** → dossier **Factures**. Saisis les tags
    « facture, copharmed » et une description, puis dépose un PDF : la
    ligne du fichier affiche les tags et la description.
16. Clique sur **Tags** de ce fichier, ajoute « urgent » et enregistre : le
    tag s'affiche. Sur `INV DEC 2024 - WDD.pdf` (Racine), le bouton « Tags »
    n'apparaît pas pour le Pharmacien suivi. Il apparaît pour l'admin ou le
    superviseur, qui peut le taguer « inventaire, 2024 ».
17. Reviens à la grille et tape « copharmed » dans la recherche : le PDF
    apparaît avec son dossier. Clique sur la pastille « inventaire » : seul
    `INV DEC 2024 - WDD.pdf` s'affiche. La croix efface la recherche.
18. En **admin**, fiche du client WDD → **SMART Communications** : coche
    « Suggestions de tags par l'IA ». Côté Pharmacien suivi, dépose un
    nouveau PDF sans tag : un message annonce les suggestions. Environ
    10 secondes plus tard, la ligne indique « x tag(s) suggéré(s) par
    l'IA ». Dans « Tags », les suggestions violettes s'ajoutent d'un clic.
19. Sur un fichier existant, clique sur « Suggérer des tags (IA) » : les
    suggestions arrivent avec leur coût en FCFA. Décoche ensuite l'option
    côté admin : le bouton disparaît.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch en UN SEUL `git am` et déploie, c'est tout.
