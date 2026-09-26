# Albarka — Lot 5 : design SAWALI sur tout le portail (champs, listes, cases, tableaux, fenêtres, boutons)

Applique `albarka-portal-corrections_5_17d196a.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `36d9fc1` (« Auto-generated
changes », juste après `655653f`, le lot 4 que tu as publié). C'est un
`git format-patch` d'un seul commit : applique-le en UN SEUL `git am`, puis
redéploie le frontend (le backend n'est pas modifié) et enregistre sur GitHub.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveau fichier**
- `frontend/src/components/forms-core/ui.js` : boîte à outils de styles du module commun Formulaires (boutons pleins colorés, champs, pastilles, onglets, cartes, fenêtres, tableaux, badges)

**Fichiers modifiés**
- `frontend/src/index.css` : thème « portail » (polices Space Grotesk et Geist, champs, cases à cocher, tableaux, cartes, menu latéral)
- `frontend/src/components/PortalLayout.jsx` : classe `portal-ui` posée sur la page pendant qu'on est dans le portail, fond gris clair
- `frontend/src/components/ui/button.jsx`, `input.jsx`, `textarea.jsx`, `label.jsx`, `checkbox.jsx`, `switch.jsx`, `select.jsx`, `table.jsx`, `dialog.jsx`, `tabs.jsx`, `badge.jsx`, `card.jsx` : briques communes au design SAWALI
- `frontend/src/components/forms-core/FormsLibrary.jsx`, `FormDetail.jsx`, `FormBuilder.jsx`, `FormSendPanel.jsx`, `FormResponses.jsx`, `FormStats.jsx`, `FormRenderer.jsx`, `PublicFormPage.jsx`, `MyForms.jsx` : module commun forms-core 1.1.0 (écrans Formulaires)
- `frontend/src/components/AccountActions.jsx`, `TemporaryAccessButton.jsx`, `ClientSpacePanel.jsx`, `frontend/src/pages/admin/AdminStaff.jsx`, `AdminClients.jsx` : actions des listes en boutons pleins colorés
- `frontend/src/version.js` : `v2026.5`

Aucune dépendance nouvelle, aucune migration, aucun changement du backend ni
des données. Les nouvelles polices sont chargées depuis Google Fonts et
jsDelivr, comme les polices actuelles.

## Variables d'environnement

Aucune nouvelle variable.

## Ce que ça apporte, dans l'ordre

1. **Thème « portail » au design SAWALI.**
   - Il s'applique aux espaces connectés, côté cabinet (`/admin`) et côté
     client (`/portal`). Le site public et la page de connexion gardent leurs
     polices et leurs fonds ; seuls leurs champs et boutons prennent le
     nouveau style (étiquettes en petites majuscules, coins arrondis).
   - Titres en Space Grotesk, texte en Geist, fond gris très clair, titres de
     page plus compacts.
   - Menu latéral : le lien actif est une pastille pleine verte, les liens sont
     en gras.

2. **Tous les champs, listes et cases du site.**
   - Champs texte, zones de texte et listes déroulantes : coins arrondis, bord
     gris clair, cadre vert au clic.
   - Étiquettes des champs en petites majuscules grises.
   - Cases à cocher et boutons radio aux couleurs du cabinet.
   - Tableaux : en-têtes en petites majuscules sur fond gris clair, ligne
     surlignée au survol.
   - Fenêtres : coins arrondis, fond voilé plus léger, titre en gras.
   - Onglets soulignés, qui remplacent l'onglet actif encadré de rouge.
   - Boutons sans ombre ; bouton secondaire blanc bordé de gris.

3. **Formulaires (module commun forms-core 1.1.0).**
   - Bibliothèque en cartes, comme SAWALI : numéro, état (Ouvert, Clos,
     Public), nombre de réponses, auteur. Les actions sont des boutons pleins
     colorés : Envoyer (vert), Éditer (noir), Données (bleu), Stats (violet),
     Dupliquer (gris), Archiver (rouge).
   - Onglets « Mes formulaires » et « Archivés », pastilles de catégories
     remplies de leur couleur, bouton « Gérer », recherche.
   - Fenêtre « Nouveau formulaire » : titre et catégorie ; un titre déjà
     utilisé est signalé et bloque la création.
   - Constructeur, Envoi & suivi, Réponses, Statistiques, page publique et
     « Mes formulaires » côté client au même design.

4. **Actions des listes en boutons pleins colorés.**
   - Clients et Personnels : Modifier (noir), Désactiver (orange) ou Réactiver
     (vert), Mot de passe (bleu), Accès temporaire (violet), Supprimer (rouge),
     Ouvrir (vert).
   - Dépôt espace client : Ouvrir (bleu), Masquer (noir) ou Rendre visible
     (vert), Prévenir à nouveau (orange), Retirer (rouge).

5. **Version affichée : v2026.5** dans la barre jaune.

## Volontairement pas dans ce lot

- **Site public et page de connexion** : ils gardent l'identité Albarka
  actuelle (polices Fraunces et Manrope, fond crème). Seuls leurs champs et
  boutons, qui sont les briques communes, prennent le nouveau style.
- **Couleur principale** : elle reste le vert Albarka. Seule la mise en forme
  reprend celle de SAWALI.
- **Aucun changement de fonctionnement** : seuls les libellés « Ouvrir » et
  « Réponses » de la bibliothèque des formulaires deviennent « Éditer » et
  « Données ».

## À tester une fois déployé

1. Connecte-toi au cabinet. La barre jaune affiche **v2026.5**. Le lien actif
   du menu est une pastille verte pleine, et les titres sont dans la nouvelle
   police.
2. **Clients** : les actions sont des petits boutons pleins colorés. Clique
   **Nouveau client** : la fenêtre a des coins arrondis, des étiquettes en
   petites majuscules et un cadre vert autour du champ actif.
3. **Personnels** : même rendu. Les actions (désactiver, mot de passe,
   supprimer) fonctionnent comme avant.
4. **Formulaires** : les cartes affichent les boutons Envoyer, Éditer, Données
   et Stats. Clique **Nouveau formulaire** et saisis le titre d'un formulaire
   existant : le message « Un formulaire porte déjà ce titre » s'affiche et le
   bouton reste grisé.
5. Ouvre un formulaire (**Éditer**), ajoute une question, puis **Aperçu** et
   **Enregistrer**. Dans **Envoi & suivi**, envoie-le à un client.
6. Côté client, **Mes formulaires** : des cartes avec l'état « À remplir » et
   le bouton **Remplir**. Remplis et envoie le formulaire.
7. **Dépôt espace client** : les actions de la liste sont colorées. Le dépôt
   pour un ou plusieurs clients fonctionne comme au lot 4.
8. **Paramètres** : les onglets sont soulignés (plus d'encadré rouge), et les
   champs et interrupteurs ont le nouveau style.
9. Parcours rapide des autres pages : Pièces, Missions, Échéances, Paie & RH,
   Rapports, Contrats, Caisse, Paiements, Comptabilité, Messagerie, WhatsApp,
   Archives, Journal, Mon compte. Tout doit s'afficher et fonctionner comme
   avant, avec le nouveau style.
10. Le **site public** (page d'accueil) et la **page de connexion** gardent
    leurs polices et leur fond crème. Sur la page de connexion, les étiquettes
    « EMAIL » et « MOT DE PASSE » sont en petites majuscules et les champs
    ont des coins arrondis. La connexion (mot de passe puis code) fonctionne
    comme avant.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs). Rappel : **aucun test, build, lint, Testing Agent ou analyse
automatique** entre-temps. Applique le patch et déploie, c'est tout.
