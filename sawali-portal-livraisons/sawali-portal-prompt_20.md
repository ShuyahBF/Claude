# Sawali — Lot 20 : Explorateur R2 de Gestion de Stocks (emplacement, dépôts autorisés, espace alloué)

Applique `sawali-portal-corrections_20_55df89f.patch` sur la branche
`Site-SawaliSmartSystems`. Ce patch remplace entièrement la version
`sawali-portal-corrections_20_bac3898.patch` que je t'avais peut-être
transmise : ne tiens compte que de celle-ci.

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

**Nouveaux fichiers frontend**
- `frontend/src/components/R2StorageGauge.jsx` — jauge « espace occupé / espace alloué »

**Fichiers modifiés**
- `backend/routes/gestion_stocks.py` — accès superviseur, dépôt par les utilisateurs suivis autorisés, espace alloué par tenant, nouvelles routes
- `frontend/src/pages/portal/GestionStocks.jsx` — fil d'Ariane, dépôt multi-fichiers (glisser-déposer, progression), jauge
- `frontend/src/pages/portal/Dashboard.jsx` — jauge sur le tableau de bord du Pharmacien suivi
- `frontend/src/pages/admin/AdminTrackedUsers.jsx` — bouton « Dépôt R2 » par utilisateur suivi (autorisation + taille max)
- `frontend/src/pages/admin/AdminClientFeatures.jsx` — section « Espace de stockage R2 (Gestion de Stocks) » dans SMART Communications du client

**Côté livraison :**
- aucune nouvelle dépendance ;
- `server.py` n'est pas modifié : les nouvelles routes passent par `attach_gestion_stocks_routes`, déjà branché ;
- aucune migration de données : les nouveaux champs prennent leur valeur par défaut tant qu'ils ne sont pas renseignés.

**Nouveaux champs Mongo :**
- `tracked_users.r2_upload_allowed` (non autorisé par défaut) ;
- `tracked_users.r2_upload_max_mb` (1,5 par défaut) ;
- `users.gestion_stocks_quota_gb`, sur la fiche du client (2 par défaut).

## Variables d'environnement

- **Déjà présentes, réutilisées telles quelles** : `R2_STOCKS_ACCOUNT_ID`,
  `R2_STOCKS_ACCESS_KEY_ID`, `R2_STOCKS_SECRET_ACCESS_KEY` et, si je l'ai
  définie, `R2_STOCKS_BUCKET` (sinon `gestion-stocks`). Je viens de les
  renseigner : l'explorateur s'affiche bien.
- Aucune nouvelle variable. Les nouveaux réglages (droit de dépôt par
  utilisateur suivi, espace alloué par client) se font à l'écran et sont
  stockés en base. Ce ne sont pas des variables d'environnement.

## Ce que ça apporte, dans l'ordre

1. **On sait toujours où l'on est.** Avec mes vraies clés R2, rien
   n'indiquait de quel compartiment ni de quel dossier venait le contenu
   affiché. Un fil d'Ariane apparaît au-dessus des dossiers : « Compartiment
   `gestion-stocks` › PMT — Pharmacie … › Inventaires ». Le compartiment et
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

## Volontairement pas dans ce lot

- **Suppression de fichiers par un utilisateur suivi** et **bouton de
  suppression à l'écran** : la route admin existe, mais je ne l'expose pas
  encore.
- **Import d'un dossier entier du PC** : pas demandé pour l'instant.
- **Réglage de l'espace alloué par le client lui-même** : il reste un réglage
  de l'administration SAWALI dans SMART Communications. C'est une allocation,
  pas un paramètre du client.
- **Accès du superviseur aux écrans /admin** (Utilisateurs suivis, SMART
  Communications) : ces pages restent réservées au rôle admin par le routage
  existant. Les routes serveur des réglages acceptent déjà le superviseur.

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
8. Active l'option « Tableau de bord » sur sa fiche (Admin → Utilisateurs suivis → Modifier) : son tableau de
   bord affiche la carte d'espace de stockage.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
