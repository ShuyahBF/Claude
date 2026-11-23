# Règles permanentes du propriétaire (ShuyahBF) — dépôt Paiement Mobile

Les règles générales (livraison, version et lot, tableaux, HFSQL, chargement des pages…) sont reprises dans le CLAUDE.md des autres dépôts
(ex. ShuyahBF/Emergent) ; la règle 12 ci-dessous s apparente à tous les dépôts.

## Outils de la session et comptes rendus par e-mail (règle 12, 17/10/2026 : « ajoute cette règle partout »)
- **Outils différés** : dans une session, les outils des connecteurs (Gmail, Google Drive, Agenda, Render, GitHub…) apparaissent par leur NOM
  seulement ; ils ne sont utilisables qu'après les avoir chargés avec ToolSearch. AVANT de dire qu'un outil manque, le CHERCHER avec ToolSearch
  (ex. « gmail send message », « google drive create file »). Ne jamais conclure « je n'ai pas l'outil » sans cette recherche.
- **Compte rendu par e-mail** : après chaque livraison, envoyer l'e-mail HTML à jfrancois.ouoba@gmail.com avec l'outil Gmail
  (`mcp__Gmail__send_message`, champ `htmlBody`) : date et heure, identification (dépôt, lot, commit), périmètre, comment vérifier, à activer,
  points d'attention, reste à faire. Ce n'est pas un envoi « à un tiers » : le propriétaire l'a demandé de façon permanente (règle « Livraison et déploiement »).
- **Google Drive** : disponible pour déposer ou lire des documents si le propriétaire le demande ; jamais de secret dans un document.

## Exemples d'identification dans les formulaires (règle 13, 06/11/2026)
- Dans TOUT formulaire où la personne s'identifie (nom, e-mail), les exemples affichés sont LOCAUX : nom « BADINI Awa » (NOM puis prénom) et
  e-mail Gmail « awa.badini@gmail.com ». Jamais « Jean Dupont », « Prénom Nom » ni « @entreprise.fr / @exemple.com ».
- Une seule source par plateforme : SAWALI = constantes `EXEMPLE_NOM` / `EXEMPLE_EMAIL` dans `frontend/src/lib/exemplesIdentite.js`, importées par
  chaque formulaire ; ailleurs, créer le même fichier (ou l'équivalent côté application : texte d'indication des champs, WinForms comprises).

## Boutons « Actualiser » et toasts (règle 17, 14/11/2026 : « C'est une règle. Ne suppose pas »)
- Après TOUTE correction ou nouveauté qui change des RÉSULTATS présentés (graphique, totaux, liste, statut, calcul), l'écran concerné a un bouton « Actualiser » (avec pictogramme,
  règle 15) que l'utilisateur peut actionner : on ne suppose jamais qu'il verra la correction apparaître tout seul.
- TOUTE actualisation affiche un TOAST « … en cours » dès l'appui, puis un toast de résultat (ce qui a été relu, nombre d'éléments, erreurs éventuelles). Jamais d'actualisation silencieuse.
- On ne suppose pas non plus ce que montre l'écran de l'utilisateur : si un résultat ne change pas après une correction, demander la capture et la version affichée, et vérifier avec les valeurs réelles.
- Mise en œuvre : Concentration = `Avis.enCours` / `Avis.resultat` ; web = `toast` de l'application ; WinForms = infobulle ou message d'état.

## Menus et sous-menus : majuscule à chaque mot (règle 18, 14/11/2026 : « chaque 1ère lettre des mots est en majuscule sauf si le contraire est précisé. Valable pour toutes les plateformes »)
- Dans TOUS les menus et sous-menus (barre latérale, groupes dépliables, onglets de navigation, menus d'application), **chaque mot du libellé commence par une majuscule** :
  « Gestion Des Contacts », « Demandes À SAWALI », « Contacts Clients ». Seule exception : quand le propriétaire précise le contraire pour un libellé.
- Seule la première lettre de chaque mot est forcée en majuscule : les sigles et noms déjà en majuscules (SAWALI, DG, OHADA, PI-SPI) ne sont jamais abaissés ; un mot qui suit une apostrophe garde sa casse (« L'ordre »).
- Mise en œuvre : UNE fonction par plateforme, appliquée au dessin des libellés (web : `titreMenu` ; WinForms / Android : équivalent), avec une option « casse libre » pour une exception. On n'écrit pas les majuscules à la main libellé par libellé.
- Valable pour toutes les plateformes, existantes ou à venir.

## Tableaux : toutes les colonnes triables (règle 19, 15/11/2026 : « pour tout tableau présentant des données, rends toutes les colonnes triables si les types de champs le permettent »)
- Sur TOUT tableau qui présente des données (écran, application, état), **chaque colonne est triable** d'un clic sur son en-tête dès que le type de champ le permet (texte, nombre, montant, date) :
  1er clic = croissant (▲), 2e clic = décroissant (▼), 3e clic = ordre d'origine. L'en-tête de la colonne triée est mis en évidence (orange) avec son pictogramme ▲ / ▼ ; les autres colonnes portent un pictogramme ⇅ discret.
- Les valeurs VIDES restent toujours en dernier, quel que soit le sens. Les textes se comparent sans accents ni majuscules, les nombres et montants numériquement, les dates chronologiquement (jamais comme du texte).
- Tableau PAGINÉ ou chargé par morceaux : le tri se fait côté SERVEUR, sur toutes les lignes filtrées, AVANT la pagination (trier seulement les lignes affichées donnerait un faux classement). Petit tableau entièrement chargé : tri dans le navigateur.
- Seules les colonnes d'ACTIONS (boutons) et les colonnes sans valeur comparable (case à cocher de sélection, pictogramme seul) ne sont pas triables.
- Mise en œuvre : SAWALI = `frontend/src/lib/tri.js` (`useTri`, `trierLignes`) et `frontend/src/components/ThTri.jsx` (en-tête triable), tri serveur de Transactions SMS dans `backend/routes/transactions_sms.py` (`trier`) ; e-Kol = `triTableaux.js` ; WinForms = `DataGridView` avec `SortMode = Automatic` ; Android Compose = en-tête cliquable. Même règle sur toute plateforme, existante ou à venir.
- Cette règle complète la règle 3 « Tableaux » (survol, sélection, nombres à droite).


## APK livré à CHAQUE livraison (règle du propriétaire, 16/11/2026 : « Tu ne m'envoies plus les APK »)
- Après toute livraison qui touche cette application (même quand le changement vit dans le site affiché par l'application), construire un APK **release** (non débogable, jamais « debug » dans le nom) et l'ENVOYER au propriétaire avec `SendUserFile`, dans le chat, sans attendre qu'il le demande.
- Numéro de version +1 à chaque APK ; nom du fichier livré sans « debug » ni « release » (ex. `concentration-1.38.apk`, `personnel-maison-1.33.apk`, `auror-direct-2.12.0.apk`).
- Build : option Gradle `-PsignerAvecCleLocale=true` (clé locale de l'environnement, aucune clé dans le dépôt). Vérifier que le fichier contient bien la nouvelle version avant de l'envoyer.
- Mentionner dans le compte rendu que Android refuse parfois la mise à jour (signature différente) et que la désinstallation efface les données locales.


## Pictogramme œil sur toute saisie secrète (règle 22, 16/11/2026 : « pour toute saisie d'un mot de passe, pin ou passphrase mettre un pictogramme œil pour afficher ou masquer. Applique cela à tous nos projets, web comme Android »)
- **Toute saisie d'un mot de passe, d'un code PIN, d'une phrase secrète, d'un jeton ou d'une clé secrète** (connexion, création, confirmation, changement, ouverture d'un coffre, fenêtre de sécurité d'un paiement, paramètres…) porte un **pictogramme œil** : œil ouvert = saisie masquée (un clic l'affiche), œil barré / singe = saisie visible (un clic la masque). **Masquée par défaut** à chaque ouverture.
- Le pictogramme est **dans le champ** (à droite), avec une description d'accessibilité (« Afficher la saisie » / « Masquer la saisie ») et une zone tactile d'au moins 44 px.
- **Un seul composant par plateforme**, utilisé partout (jamais un `<input type="password">` nu) : web = `ChampMotDePasse` / `MotDePasse` / `PasswordInput` (ou le champ de base de l'interface qui l'intègre quand `type="password"`) ; Android Compose = champ avec `trailingIcon` (`Visibility` / `VisibilityOff`) ; Android à vues = `FrameLayout` + œil ; WinForms = case ou bouton œil qui bascule `UseSystemPasswordChar`.
- Un nouvel écran, un nouveau projet : le champ secret reçoit l'œil dès la première version. Exception : la saisie d'un code à usage unique (code reçu par e-mail ou SMS, code de l'application d'authentification), qui n'est pas un secret durable.

## Énergie SONABEL et publication dans ShuyahStore (17/11/2026)
- « Payée » (et « payee ») compte comme une dépense ; la facture SONABEL (« Tsdaae », « Tde », « TVA », « Cout energie ») compte pour son TOTAL (somme de l'énergie et des taxes, ou la ligne « Total ») ; rubrique « énergie » ; carte « ⚡ Énergie (SONABEL) — dépenses par mois » dans « Lecture des SMS » (`energieParMois`). Le SMS détaillé de la SONABEL n'est pas compté une 2e fois quand l'opérateur a envoyé sa propre confirmation du même montant à moins de 15 minutes (`marquerDoublonsEnergie`). Seuls les 10 premiers caractères d'un SMS sont gardés.
- Règle du propriétaire (17/11/2026) : publier l'APK dans ShuyahStore à CHAQUE livraison (`POST https://shuyahstore-api.onrender.com/api/dev/depot`, jeton injecté par le secret réseau, clé de signature PERMANENTE), sauf indication contraire.

## Avant toute livraison du site auRor (17/11/2026, après la page blanche du lot 190)
- `cd mobile-payments-web/frontend && npm test` : logique des SMS, calcul local du code USSD, cache chiffré hors connexion et **rendu des écrans de paiement** (`tests/rendu.test.mjs` : chaque écran est dessiné une fois ; il détecte un écran qui plante à l'affichage). `npm run build` seul ne le voit pas.
- `npm run lint:paiement` : ordre des déclarations de l'écran de paiement direct.
- Hors connexion (lot 192) : cache chiffré des opérateurs / services / marchands, paiement préparé sur le téléphone (`lib/ussdLocal.js`, même calcul que `backend/ussd.py`), file d'attente chiffrée envoyée par `POST /api/paiements/hors-ligne` (idempotent, le serveur recalcule le code, jamais de code secret gardé).

## Tableaux de plus de 30 lignes : barre de défilement (règle 24, 18/11/2026 : « C'est une règle à considérer partout sur toutes les plateformes »)
- Tout tableau qui présente PLUS DE 30 LIGNES défile dans son cadre (hauteur = 30 lignes + l'en-tête) au lieu d'allonger la page ; l'en-tête reste visible en haut pendant le défilement ;
  à l'impression, toutes les lignes sortent. Exception possible : `<table data-sans-defilement>`.
- Mise en œuvre ici : module global `mobile-payments-web/frontend/src/lib/defilementTableaux.js` installé au démarrage du site (règles CSS dans `index.css`) : rien à ajouter tableau par tableau.

## Compte rendu par e-mail AUTOMATIQUE après toute livraison (règle du propriétaire, 19/11/2026 : « L'envoi de l'e-mail doit être automatique »)
- L'e-mail HTML à jfrancois.ouoba@gmail.com (outil Gmail, voir règle 12) part TOUT SEUL à la fin de CHAQUE livraison, sans que le
  propriétaire ait à le demander ni à le rappeler, et sans demander confirmation avant l'envoi.
- « Livraison » = tout ce qui atteint le propriétaire ou les utilisateurs, même sans fusion ni déploiement Render : dépôt d'un APK ou d'une
  nouvelle version dans ShuyahStore, publication d'une version, correction, changement de libellé, simple règle ajoutée au CLAUDE.md, fichier
  envoyé au propriétaire. Aucune exception de taille.
- Ne pas conclure « la règle ne s'applique pas, rien n'a été déployé sur Render » : en cas de doute, envoyer l'e-mail.
- Contenu : date et heure, identification (dépôt, branche, commit, version, lot), périmètre, comment vérifier, à activer, points
  d'attention, reste à faire. Jamais de secret (clé, mot de passe, chaîne de connexion) dans l'e-mail.
- Charger l'outil Gmail avec ToolSearch AVANT de dire qu'il manque ; s'il est vraiment indisponible, le dire dans le chat et ne pas clore la livraison.


## Signature et publication des APK : clé permanente seulement, publication directe dans ShuyahStore (règle du propriétaire, 19/11/2026)
- **Plus JAMAIS la clé de test** (option `-PsignerAvecCleLocale=true`, clé « Android Debug ») pour un APK livré au propriétaire, **sauf demande EXPRESSE** de sa part dans la conversation. Cette règle remplace toute consigne plus ancienne qui l'autorisait.
- Tout APK est signé avec la clé PERMANENTE de ShuyahStore (variables `ANDROID_KEYSTORE_FILE` / `_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`). Avant de livrer, vérifier avec `apksigner verify --print-certs` que le certificat est celui de ShuyahStore (« CN=ShuyahStore »), jamais « Android Debug ».
- **Fichier de clé absent** (chemin de `ANDROID_KEYSTORE_FILE` introuvable : c'est le cas dans une session neuve) : ne construire AUCUN APK de remplacement. Le dire au propriétaire et lui demander de joindre `cle-shuyahstore-shuyahstore.p12` à la conversation (pièce jointe, jamais collé dans le texte) ; le recopier à l'emplacement attendu, sans l'afficher ni le commiter.
- **Publication DIRECTE dans ShuyahStore à CHAQUE livraison** (`POST https://shuyahstore-api.onrender.com/api/dev/depot`, jeton injecté par le secret réseau « Jeton de dépôt ShuyahStore »), en plus de l'envoi de l'APK dans le chat. Dire dans le compte rendu si la version a été publiée directement ou mise en validation.

## Copie de sécurité chiffrée en fichier (web 168 · Android 2.38.0, propriétaire 23/11/2026 : « sauvegarder toutes les données sur le périphérique, de manière cryptée »)
- Profil → « Sécurité et sauvegarde » → « Copie de sécurité sur ce téléphone (fichier chiffré) » : même instantané (journal, carnet, lignes de SMS) et même chiffrement que la sauvegarde en ligne (clé du coffre), enregistré dans un fichier `.aursauv` (« AURSAUV1 » + contenu base64) choisi par l'utilisateur ; restauration SANS RIEN ÉCRASER (éléments absents ajoutés).
  Code : `frontend/src/lib/copieLocale.js` (test `tests/copieLocale.test.mjs`), `BlocSauvegarde.jsx` ; pont Android `enregistrerFichier` / `choisirFichier` (`PontAuRor.kt`, `WebActivity.kt` : sélecteur de fichiers d'Android, aucune autorisation). Application d'avant la 2.38 : message « mettez l'application à jour ».
- auRor se connecte déjà par téléphone ou e-mail + mot de passe ; aucun identifiant de sauvegarde supplémentaire n'est nécessaire (le coffre est lié au compte).
- Test connu en échec AVANT ces changements (dépend de la date du jour) : `tests/liluvineReglage.test.mjs` (« silencieuse : pas de bonjour »).

## Budget de dépenses et détails des SMS (web 169, lot 217, propriétaire 23/11/2026)
- Profil → « Mon budget de dépenses » (`components/BudgetProfil.jsx`, logique pure `lib/budget.js`, test `tests/budget.test.mjs`) : plafond en FCFA sur une période (jour, semaine, quinzaine, mois, trimestre, an), TOUS opérateurs confondus ; modifiable (bouton Enregistrer actif si modifié), désactivable (réglage conservé), réinitialisable (le compteur repart de zéro à cet instant, confirmation). Gardé sur le téléphone (`auror_budget`), jamais envoyé au serveur.
- Les dépenses comptées = lignes de SMS « payées » qui sont de vraies transactions (ni recette, ni promo, ni doublon), depuis le début de la période ou la dernière réinitialisation. Sans SMS lus (hors application Android « direct »), le niveau reste à zéro.
- Payer.jsx : à chaque paiement préparé, `NiveauBudget` montre le niveau (barre, reste, part de chaque portefeuille) AVEC le montant saisi ; si le paiement ferait dépasser, une fenêtre propose « Forcer le paiement » ou « Annuler ». Un paiement égal au reste n'est pas un dépassement.
- Mes SMS de paiement : bouton « Détails / Motif » par ligne (`DetailsLigneSms.jsx`) : motif (liste finie + « Autre… »), détail des achats, jusqu'à 3 photos de ticket ou facture pour une dépense ; motif et note pour un paiement reçu. Texte gardé dans la ligne (donc dans la sauvegarde chiffrée) ; photos réduites dans IndexedDB (`lib/piecesSms.js`), NON sauvegardées en ligne.

## Calculette, rubriques en tableau, évolution du solde (web 170, lot 218, propriétaire 23/11/2026)
- Calculette (`components/CalculetteMontant.jsx`, calcul sûr sans eval `lib/calcul.js`, test `tests/calcul.test.mjs`) : bouton « 🧮 Calculer » à côté du montant du budget et dans chaque rubrique ; « Valider » met le résultat (entier) dans le champ, à enregistrer ensuite.
- Détail des achats en TABLEAU (`DetailsLigneSms.jsx`) : rubrique, montant, catégorie (liste finie), total et écart avec le SMS ; gardé dans la ligne (`articles`, donc dans la sauvegarde chiffrée). Recherche plein texte (`RechercheRubriques.jsx`, `rechercherRubriques`) : une ligne par rubrique trouvée (SMS, date et heure, intitulé, catégorie, montant), colonnes triables, total collé dessous, clic = détails du SMS.
- Profil → budget : graphique « Évolution de mon solde sur la période » (`GraphiqueSolde.jsx`, `serieSolde`) : somme des derniers soldes annoncés par les SMS de chaque portefeuille ; les entrées d'argent (paiements reçus) sont repérées en vert et listées. Sans solde dans les SMS, pas de courbe (message explicatif).
