# Albarka — Lot 3 : gestion de formulaires (`/admin/forms`) sur le module commun `forms_core`

Applique `albarka-portal-corrections_3_7387b59.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `b545832` (celui que tu as
créé en publiant le lot 2, `aaf483b`, l'OCR sur le module commun `ocr_core`).
C'est un `git format-patch` d'un seul commit : applique-le en UN SEUL `git am`,
puis redéploie.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/forms_core/__init__.py`, `fields.py`, `validation.py`, `stats.py`, `export.py`, `api.py` : module commun de formulaires (types de questions, validation, statistiques, export CSV, routes)
- `backend/albarka_forms.py` : branchement Albarka du module (destinataires, e-mail/WhatsApp, stockage, journal)
- `backend/tests/test_forms_lot3.py` : tests du branchement Albarka. Tu ne les lances pas.

**Nouveaux fichiers frontend**
- `frontend/src/components/forms-core/` : `FormsLibrary.jsx`, `FormDetail.jsx`, `FormBuilder.jsx`, `FormRenderer.jsx`, `FormSendPanel.jsx`, `FormResponses.jsx`, `FormStats.jsx`, `PublicFormPage.jsx`, `MyForms.jsx`, `fieldTypes.js` : écrans communs
- `frontend/src/pages/admin/AdminForms.jsx`, `frontend/src/pages/portal/MyForms.jsx`, `frontend/src/pages/public/FillForm.jsx` : pages Albarka qui affichent ces écrans

**Fichiers modifiés**
- `backend/albarka_models.py` : rôle `formulaires` ajouté à `ALBARKA_ROLES`, nouvelle constante `FORMS_ROLES`
- `backend/server.py` : 3 routeurs Formulaires inclus sous `/api`, index Mongo créés au démarrage
- `frontend/src/App.js` : routes `/admin/forms`, `/admin/forms/:id`, `/portal/formulaires` et `/f/:token`
- `frontend/src/components/PortalLayout.jsx` : menu « Formulaires » (personnel) et « Mes formulaires » (client)
- `frontend/src/pages/admin/AdminStaff.jsx` : case « Formulaires » dans la fiche du personnel

Aucune nouvelle dépendance : `qrcode` et `Pillow` sont déjà dans
`requirements.txt`, `recharts` et `lucide-react` déjà dans `package.json`.
Aucune migration : les nouvelles collections (`forms`, `forms_submissions`,
`forms_invitations`, `forms_categories`, `forms_counters`, `forms_rate`) se
créent à la première utilisation. Les pièces jointes vont dans
`stored_objects` avec `kind = "form_upload"`, comme les autres fichiers.

## Variables d'environnement

- **Nouvelles** : aucune.
- **Déjà présentes, réutilisées telles quelles** : `EMERGENT_EMAIL_KEY` (e-mails
  d'invitation), la configuration R2 existante (pièces jointes ; en stockage
  local, les fichiers sont relus directement), `JWT_SECRET_KEY`, `MONGO_URL`,
  `DB_NAME`.
- **Paramètres stockés en base (AdminSettings), pas des variables
  d'environnement** : l'expéditeur des e-mails et la configuration WhatsApp
  Meta existants sont repris tels quels. Rien de nouveau à configurer.

## Ce que ça apporte, dans l'ordre

1. **Un module commun, comme pour l'OCR.** J'ai déjà une gestion de
   formulaires sur ma plateforme Sawali. Plutôt que d'en faire une deuxième
   copie, j'en ai tiré un module réutilisable dans tous mes projets :
   `backend/forms_core/` et `frontend/src/components/forms-core/` sont des
   copies identiques de ce module. Ne les modifie jamais directement : une
   amélioration arrivera sous forme de patch qui les remplace à l'identique.
   Le module ne connaît ni la base, ni l'authentification, ni l'envoi de
   messages. Tout ce qui est propre au cabinet est dans
   `backend/albarka_forms.py` (classe `AlbarkaFormsAdapter`) et dans les trois
   petites pages Albarka.

2. **Accès réservé au nouveau rôle « Formulaires ».**
   - `formulaires` est un rôle cumulable, ajouté à `ALBARKA_ROLES` (donc aussi
     à `STAFF_ROLES`), avec `FORMS_ROLES = ["formulaires"]`.
   - Dans **Personnels**, je coche « Formulaires » dans la fiche d'un
     collaborateur, en plus de son métier. Seuls ces collaborateurs voient le
     menu « Formulaires » dans la barre latérale.
   - Côté serveur, toutes les routes `/api/forms/...` passent par
     `require_roles(FORMS_ROLES)`. Le superviseur garde son passe-droit
     habituel, comme pour le module Paiements.

3. **Constructeur de formulaires (`/admin/forms`).**
   - La bibliothèque offre : indicateurs globaux, catégories, recherche,
     formulaires actifs ou archivés, duplication, archivage (jamais de
     suppression définitive).
   - Chaque formulaire est numéroté `FORM-ALBARKA-0001`, etc.
   - La fiche d'un formulaire a 4 onglets : Constructeur, Envoi & suivi,
     Réponses, Statistiques.
   - Le constructeur propose 19 types de questions : texte, paragraphe,
     e-mail, téléphone, nombre, date, choix unique ou multiple, cases à cocher,
     oui/non, note en étoiles, échelle 0-10, lien, tableau, fichier joint,
     signature, titre. Il permet aussi :
     - plusieurs pages ;
     - le glisser-déposer ;
     - les questions obligatoires ;
     - « afficher seulement si… » (une question n'apparaît que selon une
       réponse précédente) ;
     - un aperçu ;
     - des réglages : date de clôture, message de remerciement, identité
       demandée ou non aux non-clients, modification de sa réponse, adresses
       prévenues à chaque réponse.
   - Le serveur valide chaque réponse lui-même (formats, bornes, options
     autorisées, questions masquées ignorées). Ce que le navigateur vérifie
     n'est donc pas la seule barrière.

4. **Le même formulaire envoyé à une liste de clients choisis.**
   - Dans « Envoi & suivi », je coche des clients : seuls les comptes clients
     actifs sont proposés, avec recherche et « tout sélectionner ».
   - Je choisis e-mail et/ou WhatsApp et j'ajoute un message si je veux.
   - Chaque client reçoit **son propre lien** : pas de connexion nécessaire,
     et le lien sait qui il est. Le renvoyer au même client réutilise son lien
     sans créer de doublon.
   - Le suivi montre qui a reçu, ouvert ou répondu, relance en un clic ceux
     qui n'ont pas répondu, et peut désactiver un lien.
   - Les envois respectent la fiche du client :
     - rien ne part si « recevoir les notifications » est décoché ;
     - WhatsApp passe par `whatsapp_number_of()` au format +226… ;
     - si Meta refuse parce que le client ne nous a pas écrit depuis 24 h, le
       suivi l'explique en clair au lieu d'un code d'erreur.
   - L'e-mail d'invitation suit le style des autres e-mails du cabinet et
     passe les garde-fous de `_assert_safe_email` : lien https, bouton
     « Remplir le formulaire » sans nom de domaine, aucun champ de saisie.
   - Si le portail est ouvert en http (poste local, aperçu), les liens envoyés
     utilisent `https://albarka-bf.com`. Sinon l'e-mail serait refusé.

5. **Un lien public pour les non-clients.**
   - Sur le même formulaire, j'active un lien public à partager partout
     (e-mail, WhatsApp, site, affiche avec le **QR code** téléchargeable).
   - Je peux le régénérer (l'ancien cesse de marcher) ou le désactiver.
   - Le non-client remplit sans compte. Nom et e-mail lui sont demandés si je
     l'ai réglé ainsi.
   - Protections : un champ piège invisible pour les robots et au plus
     30 envois par heure depuis une même connexion.
   - La page `/f/<jeton>` est pensée pour le téléphone.

6. **Côté client : « Mes formulaires ».**
   - Un nouveau menu dans l'espace client liste les formulaires reçus : à
     remplir, répondus ou clos.
   - Il y a un bouton Remplir, ou « Modifier ma réponse » si le formulaire le
     permet.

7. **Réponses et statistiques.**
   - Les réponses se filtrent par dates, origine (client invité ou lien
     public) et recherche. Le détail est affiché dans une fenêtre, les pièces
     jointes s'ouvrent, et l'export CSV s'ouvre directement dans Excel
     (séparateur « ; », accents conservés).
   - Les statistiques donnent :
     - le nombre de réponses et d'ouvertures, et le taux de réponse des
       invités ;
     - un graphique des réponses par jour ;
     - pour chaque question, les barres par option, la moyenne, la médiane et
       la répartition des notes, et les dernières réponses texte.
   - Chaque création, envoi, archivage et suppression de réponse est tracé
     dans le **Journal plateforme** (`_log_platform_event`, type `form`).

## Volontairement pas dans ce lot

- **Envoi aux contacts secondaires d'un client** (`albarka_contacts`) : seul
  le compte client reçoit l'invitation. Le rôle de chaque contact reste à
  préciser.
- **Modèle WhatsApp approuvé par Meta** pour écrire hors fenêtre de 24 h : le
  suivi signale le cas et l'e-mail prend le relais.
- **Case « Caissier » dans la fiche du personnel** : j'ai remarqué qu'elle
  n'existe pas encore dans `AdminStaff.jsx` alors que le rôle existe côté
  serveur. Je la traiterai à part.

## À tester une fois déployé

1. Connecte-toi en superviseur, ouvre **Personnels**, modifie un collaborateur
   et coche **Formulaires**. Reconnecte-toi avec ce collaborateur : le menu
   **Formulaires** apparaît. Un collaborateur sans cette case ne le voit pas.
2. **Formulaires → Nouveau formulaire**, titre « Enquête de satisfaction ».
   Ajoute un texte obligatoire « Votre nom », un choix unique « Service
   principal » (Comptabilité / Fiscalité / Paie), une note en étoiles et un
   fichier joint. **Enregistrer** : le numéro `FORM-ALBARKA-0001` s'affiche.
3. Onglet **Envoi & suivi** : coche deux clients, laisse E-mail, clique
   **Envoyer**. Les deux lignes passent à « Envoyé » et les clients reçoivent
   l'e-mail avec le bouton « Remplir le formulaire ».
4. Connecte-toi avec l'un de ces clients : **Mes formulaires** affiche
   l'enquête. Clique **Remplir**, réponds et envoie : écran de remerciement.
   Dans le suivi du cabinet, sa ligne passe à « Répondu ».
5. Toujours dans **Envoi & suivi**, clique **Activer le lien public**. Ouvre
   le lien sur un téléphone, en navigation privée : remplis-le comme un
   non-client, avec un PDF en pièce jointe. Scanne aussi le QR code.
6. Onglet **Réponses** : les deux réponses sont là. Ouvre le détail, clique
   sur le PDF, puis **Export Excel (CSV)** et ouvre le fichier dans Excel.
7. Onglet **Statistiques** : 2 réponses, graphiques par question.
8. **Relancer les non-répondants** : seul le client qui n'a pas répondu est
   relancé. **Journal plateforme** : les actions sur le formulaire y figurent.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
