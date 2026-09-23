# Sawali — Lot 20 : Explorateur R2 de Gestion de Stocks (fil d'Ariane + dépôt depuis l'ordinateur)

Applique `sawali-portal-corrections_20_bac3898.patch` sur la branche
`Site-SawaliSmartSystems`. Base attendue : le commit où tu as appliqué le
lot 19 (`sawali-portal-corrections_19_66b5ce6.patch`, « feat(ocr-pieces):
page « OCR sur Pièces » sur le module commun ocr_core »), que tu as publié.
C'est un `git format-patch` d'un seul commit : applique-le en UN SEUL
`git am`, puis redéploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Fichiers modifiés**
- `backend/routes/gestion_stocks.py` — `/gestion-stocks/context` renvoie en plus `bucket` et `max_upload_mb` (5 lignes)
- `frontend/src/pages/portal/GestionStocks.jsx` — fil d'Ariane et dépôt multi-fichiers dans le bloc « Explorateur Stockage R2 »

Aucun nouveau fichier, aucune nouvelle dépendance, aucune nouvelle route :
le dépôt réutilise la route existante
`POST /admin/gestion-stocks/{client_code}/{folder}/upload`.

## Variables d'environnement

- **Déjà présentes, réutilisées telles quelles** : `R2_STOCKS_ACCOUNT_ID`,
  `R2_STOCKS_ACCESS_KEY_ID`, `R2_STOCKS_SECRET_ACCESS_KEY` et, si je l'ai
  définie, `R2_STOCKS_BUCKET` (sinon `gestion-stocks`). Je viens de les
  renseigner : l'explorateur s'affiche bien.
- Aucune nouvelle variable, aucun paramètre stocké en base (AdminSettings).

## Ce que ça apporte, dans l'ordre

1. **On sait toujours où l'on est.** En testant l'explorateur avec mes
   vraies clés R2, rien n'indiquait de quel compartiment ni de quel dossier
   venait le contenu affiché. Un fil d'Ariane apparaît maintenant au-dessus
   des dossiers : « Compartiment `gestion-stocks` › PMT — Pharmacie … ›
   Inventaires ». Le compartiment et le client sont cliquables pour revenir
   à la grille des dossiers. Le nom du compartiment vient du serveur :
   `/gestion-stocks/context` renvoie maintenant `bucket` (valeur de
   `r2_stocks_client._bucket()`, donc `R2_STOCKS_BUCKET` ou `gestion-stocks`,
   uniquement quand R2 est configuré). C'est un simple nom, ni clé ni
   identifiant de compte. Pour un Pharmacien suivi, le client affiché est son
   propre code client, toujours résolu côté serveur.

2. **Déposer des fichiers depuis l'ordinateur, bien en vue (admin).** Le
   dépôt existait déjà, mais sous la forme d'un petit lien « Ajouter un
   document », un seul fichier à la fois, visible seulement après avoir
   ouvert un dossier : je ne l'avais pas trouvé. Dans un dossier ouvert,
   l'admin a maintenant :
   - un bouton **« Déposer des fichiers »** bien visible ;
   - une **zone de glisser-déposer** qui rappelle le dossier de destination ;
   - la sélection de **plusieurs fichiers à la fois**. Ils partent un par un
     sur la route existante, chacun avec sa barre de progression et son
     statut (envoyé, ou message d'erreur) ;
   - un fichier au-delà de la taille maximale (25 Mo, renvoyée par le serveur
     dans `max_upload_mb`) est refusé avant l'envoi, avec un message clair.

   Au niveau de la grille des dossiers, une phrase rappelle à l'admin qu'il
   faut ouvrir un dossier pour y déposer des documents.

3. **Dépôt réservé au rôle admin, comme le serveur.** La route de dépôt est
   protégée par `get_current_admin` (rôle `admin` uniquement). Le bouton, la
   zone de glisser-déposer et le rappel ne s'affichent donc que pour le rôle
   `admin` (`canUpload`), et non plus pour tout `isAdmin` (qui inclut
   superviseur), pour ne pas proposer une action qui serait refusée. Le
   Pharmacien suivi garde un accès en lecture seule, comme je le veux.

## Volontairement pas dans ce lot

- **Dépôt par le Pharmacien suivi** : je garde le dépôt réservé à l'admin.
- **Import d'un dossier entier du PC** et **suppression depuis l'interface**
  (la route `DELETE /admin/gestion-stocks/file` existe mais n'est pas
  branchée à l'écran) : pas demandés pour l'instant.
- **Accès du superviseur à la liste des clients** :
  `/admin/gestion-stocks/clients` est protégée par `get_current_admin`. Un
  superviseur qui ouvre la page reçoit donc un refus sur cette liste. Je ne
  change rien ici tant que je n'ai pas décidé du rôle du superviseur dans ce
  module.

## À tester une fois déployé

1. Connecte-toi en **admin** et ouvre **Gestion de Stocks**. Choisis un
   client : le fil d'Ariane affiche « Compartiment `<nom du compartiment>` ›
   `<code> — <nom du client>` ».
2. Ouvre le dossier **Inventaires** : le fil d'Ariane se termine par
   « Inventaires », avec un bouton **Déposer des fichiers** et une zone de
   glisser-déposer.
3. Clique sur **Déposer des fichiers** et choisis **plusieurs fichiers**
   (un PDF, une photo, un Excel) : chacun affiche sa progression puis une
   coche. Un message « n documents déposés dans Inventaires » apparaît et la
   liste se met à jour.
4. Glisse un fichier depuis l'explorateur de ton ordinateur sur la zone
   pointillée : il est déposé de la même façon.
5. Essaie un fichier de **plus de 25 Mo** : il est marqué « Trop volumineux
   (max 25 Mo) » sans être envoyé.
6. Double-clique un fichier déposé : il s'ouvre dans un nouvel onglet.
7. Clique sur le nom du compartiment dans le fil d'Ariane : tu reviens à la
   grille des dossiers.
8. Connecte-toi en **Pharmacien suivi** : le fil d'Ariane affiche son code
   client et le dossier ouvert, mais sans bouton ni zone de dépôt.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
