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
