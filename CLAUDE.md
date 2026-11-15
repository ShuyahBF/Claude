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
