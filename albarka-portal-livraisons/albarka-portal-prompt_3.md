# Albarka — Lot 3 : formulaires, rôle Caissier, administrateur réservé, espace client avec notifications

Applique `albarka-portal-corrections_3_7a62fdf.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `b545832` (celui que tu as
créé en publiant le lot 2, `aaf483b`, l'OCR sur le module commun `ocr_core`).
C'est un `git format-patch` d'un seul commit : applique-le en UN SEUL `git am`,
puis redéploie. Ce patch remplace entièrement la version précédente du lot 3
(`…_3_7387b59.patch`, formulaires seuls) que je t'avais envoyée : n'applique
que celui-ci.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/forms_core/__init__.py`, `fields.py`, `validation.py`, `stats.py`, `export.py`, `api.py` : module commun de formulaires (types de questions, validation, statistiques, export CSV, routes)
- `backend/albarka_forms.py` : branchement Albarka du module (destinataires, e-mail/WhatsApp, stockage, journal)
- `backend/albarka_client_space.py` : espace client (dépôts du cabinet sans OCR, mise à disposition des factures, modules visibles, notifications à modèles)
- `backend/tests/test_forms_lot3.py`, `backend/tests/test_client_space_lot3.py` : tests. Tu ne les lances pas.

**Nouveaux fichiers frontend**
- `frontend/src/components/forms-core/` : `FormsLibrary.jsx`, `FormDetail.jsx`, `FormBuilder.jsx`, `FormRenderer.jsx`, `FormSendPanel.jsx`, `FormResponses.jsx`, `FormStats.jsx`, `PublicFormPage.jsx`, `MyForms.jsx`, `fieldTypes.js` : écrans communs
- `frontend/src/pages/admin/AdminForms.jsx`, `frontend/src/pages/portal/MyForms.jsx`, `frontend/src/pages/public/FillForm.jsx` : pages Albarka qui affichent ces écrans
- `frontend/src/components/ClientSpacePanel.jsx` : panneau « Espace client » d'un client (modules, dépôt/scan, suivi)
- `frontend/src/pages/admin/AdminClientSpace.jsx` : page « Dépôt espace client »
- `frontend/src/pages/admin/ClientDocsNotifPanel.jsx` : réglage des textes de notification (Paramètres → Notifications)
- `frontend/src/pages/portal/CabinetDocuments.jsx` : page client « Factures & documents »

**Fichiers modifiés**
- `backend/albarka_models.py` : rôle `formulaires`, constantes `FORMS_ROLES`, `ENCAISSEMENT_ROLES`, `CLIENT_SPACE_ROLES`, `CLIENT_PORTAL_MODULES`, fonctions `effective_roles()` et `client_modules()`, champ `portal_modules` du modèle `User`
- `backend/albarka_auth.py` : rôles effectifs appliqués à chaque requête (administrateur réservé au compte admin)
- `backend/albarka_clients.py` : attribution du rôle Administrateur refusée hors compte admin
- `backend/albarka_phase_c.py` : encaissement et reçus réservés au Caissier, reçu délivré à chaque encaissement, case « visible dans l'espace client » à la création
- `backend/albarka_notifications.py` : envoi d'un modèle WhatsApp Meta (`send_whatsapp_template`) et état de la fenêtre de 24 h (`wa_window_state`)
- `backend/albarka_admin_settings.py` : réglages des notifications de l'espace client
- `backend/albarka_documents.py`, `albarka_missions.py`, `albarka_echeances.py`, `albarka_forms.py` : respect des modules fermés pour un client
- `backend/server.py` : routeurs Formulaires et Espace client inclus sous `/api`, index Mongo créés au démarrage
- `frontend/src/App.js` : routes `/admin/forms`, `/admin/forms/:id`, `/admin/espace-client`, `/portal/formulaires`, `/portal/documents-cabinet` et `/f/:token`
- `frontend/src/components/PortalLayout.jsx` : menus « Formulaires », « Dépôt espace client », Caisse ouverte au caissier ; menu client filtré selon les modules ouverts, « Factures & documents »
- `frontend/src/pages/admin/AdminStaff.jsx` : cases « Formulaires » et « Caissier », case Administrateur retirée
- `frontend/src/pages/admin/AdminBilling.jsx` : Encaisser et « Reçu de caisse » réservés au caissier, reçu proposé après encaissement, mise à disposition du client
- `frontend/src/pages/admin/AdminClientDetail.jsx` : onglet « Espace client »
- `frontend/src/pages/admin/AdminSettings.jsx` : bloc « Documents mis à disposition des clients »

Aucune nouvelle dépendance : `qrcode` et `Pillow` sont déjà dans
`requirements.txt`, `recharts` et `lucide-react` déjà dans `package.json`.
Aucune migration : les nouvelles collections (`forms`, `forms_submissions`,
`forms_invitations`, `forms_categories`, `forms_counters`, `forms_rate`,
`client_documents`) se créent à la première utilisation. Les fichiers vont
dans `stored_objects` avec `kind = "form_upload"` (formulaires) ou
`kind = "client_space"` (dépôts), comme les autres fichiers. Les factures
existantes reçoivent un champ `client_visible` absent = non visible : rien de
ce qui existe n'apparaît chez un client tant que je ne l'ai pas mis à
disposition. Aucun rôle n'est effacé en base.

## Variables d'environnement

- **Nouvelles** : aucune.
- **Déjà présentes, réutilisées telles quelles** : `EMERGENT_EMAIL_KEY` (e-mails
  d'invitation), la configuration R2 existante (pièces jointes ; en stockage
  local, les fichiers sont relus directement), `JWT_SECRET_KEY`, `MONGO_URL`,
  `DB_NAME`.
- **Paramètres stockés en base (AdminSettings), pas des variables
  d'environnement** : l'expéditeur des e-mails et la configuration WhatsApp
  Meta existants sont repris tels quels. Nouveaux réglages, avec des valeurs
  par défaut qui marchent sans rien toucher (Paramètres → Notifications) :
  `client_docs_notify_enabled`, `client_docs_templates`,
  `client_docs_wa_template_name`, `client_docs_wa_template_lang`,
  `client_docs_wa_template_params`, `client_docs_email_fallback`.

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

8. **Rôle Caissier : seul habilité à encaisser et à délivrer un reçu.**
   - La case « Caissier » apparaît dans la fiche du personnel (le rôle
     existait côté serveur, mais la case manquait). Le rôle est cumulable :
     une secrétaire qui a aussi « Caissier » peut encaisser, une secrétaire
     sans ce rôle ne le peut plus.
   - `POST /billing/payments` passe par `require_roles(ENCAISSEMENT_ROLES)`
     (`["caissier"]`, avec le passe-droit superviseur habituel). Créer un
     « Reçu de caisse » (`document_type = "recu"`) exige aussi ce rôle. Dans
     l'écran Caisse, le bouton **Encaisser** et l'option « Reçu de caisse »
     ne s'affichent que pour lui, et le menu Caisse lui est ouvert.
   - **Chaque encaissement délivre automatiquement un reçu** (`REC-…`) du
     montant encaissé, avec son PDF, relié à la facture (`invoice_id`,
     `payment_id`). Après l'encaissement, un bouton « Voir le reçu » l'ouvre.
     Seule une facture peut être encaissée (pas une proforma ni un reçu).
   - Ces reçus d'encaissement ne sont pas une nouvelle vente : ils sont exclus
     du « Facturé », du « Reste dû » et de la situation de compte, sinon le
     montant serait compté deux fois. Un reçu fait à la main (vente payée
     comptant, sans facture) reste compté comme avant.
   - La création d'une facture, d'un reçu ou d'une proforma passe maintenant
     par une seule fonction `_new_billing_document()` (numéro, PDF, journal,
     archive), utilisée par la création manuelle et par l'encaissement.

9. **Administrateur : le compte admin seulement.**
   - Le rôle `administrateur` est réservé au compte
     `admin@sawalismartsystems.com`, qui le porte d'office.
   - Sur tout autre compte, il est ignoré : `effective_roles()` le retire
     des rôles à chaque requête (`get_current_user`, `/auth/me`, liste du
     personnel). Rien n'est effacé en base : si un collaborateur l'avait, il
     perd simplement les droits qui vont avec.
   - Il ne peut plus être attribué à personne (création ou modification d'un
     collaborateur → 403), et la case a disparu de la fiche du personnel.

10. **Espace client : le client ne voit que ce qui le concerne et que le
    cabinet a mis à sa disposition.**
    - **Documents faits hors du portail.** Menu « Dépôt espace client », ou
      onglet « Espace client » de la fiche d'un client :
      - je dépose un ou plusieurs fichiers (PDF, images, Word, Excel ; 10 par
        dépôt, 20 Mo chacun), ou je scanne avec l'appareil photo du
        téléphone ;
      - je choisis une catégorie : facture, proforma, reçu, rapport,
        déclaration fiscale, attestation, contrat, courrier, autre ;
      - titre, référence, montant et date sont facultatifs ;
      - **aucune analyse OCR** n'est faite ;
      - je peux déposer en « masqué » pour publier plus tard ;
      - un reçu déposé reste réservé au Caissier ;
      - rôles : `CLIENT_SPACE_ROLES` (direction, DG, administrateur,
        secrétariat, comptable, fiscaliste, aide-comptable, caissier).
    - **Factures de la Caisse.** Case « Mettre à disposition dans l'espace du
      client » à la création, ou bouton sur chaque ligne de la Caisse, pour
      publier ou retirer. Le reçu délivré à l'encaissement suit la visibilité
      de sa facture.
    - **Suivi.** Le panneau montre, pour chaque document :
      - s'il est visible ;
      - si le client l'a consulté, et quand ;
      - par quel canal il a été prévenu, ou pourquoi il ne l'a pas été.
      Je peux aussi le prévenir à nouveau ou retirer le document.
    - **Modules visibles, client par client.** J'ouvre ou je ferme : Mes
      pièces, Factures & documents, Mes missions, Échéances, Mes formulaires,
      Historique. Tableau de bord et Mon compte restent toujours visibles.
      Sans réglage, tout est ouvert, comme aujourd'hui.
      - Côté serveur, un module fermé renvoie une liste vide (pièces, missions,
        échéances, formulaires, documents) et le dépôt de pièces est refusé.
      - Le menu du client n'affiche que les modules ouverts.
      - Réglage : `PUT /client-space/modules/{id}`, rôles de gestion des
        clients.
    - **Côté client : « Factures & documents ».** La page montre tout ce qui
      a été mis à disposition, avec :
      - un filtre par catégorie ;
      - une pastille « Nouveau » tant qu'il ne l'a pas ouvert ;
      - le statut « Payée / À payer / reste … » pour les factures de la
        Caisse ;
      - les boutons Ouvrir et Télécharger.
      Le serveur ne renvoie que les documents du client connecté, rendus
      visibles.

11. **Le client est prévenu par WhatsApp, avec des textes que je règle.**
    - À chaque dépôt visible ou mise à disposition, le client reçoit **un
      seul** message par dépôt, même avec plusieurs fichiers. Il liste les
      documents et donne le lien vers sa page.
    - **Paramètres → Notifications → « Documents mis à disposition des
      clients »** :
      - un texte par catégorie, plus un texte par défaut ;
      - des variables `{client}`, `{entreprise}`, `{cabinet}`, `{nombre}`,
        `{liste}`, `{titre}`, `{categorie}`, `{reference}`, `{montant}`,
        `{lien}` ;
      - un aperçu en direct et un retour au texte d'origine ;
      - un interrupteur général.
    - **Fenêtre de 24 h de WhatsApp.**
      - Si le client nous a écrit depuis moins de 24 h, le texte réglé part en
        message libre.
      - Sinon, et si j'ai renseigné le **nom d'un modèle approuvé par Meta**
        (avec sa langue et ses variables `{{1}}`, `{{2}}`… dans l'ordre), c'est
        ce modèle qui part, via la nouvelle `send_whatsapp_template()`.
      - Sinon, **repli e-mail** (réglable), avec un bouton « Ouvrir mon espace
        client » qui passe les garde-fous `_assert_safe_email`.
    - Un client qui a refusé les notifications ne reçoit rien. Chaque
      résultat est enregistré sur le document et affiché au cabinet.
    - Tout est tracé dans le Journal plateforme (type `client_document`).

## Volontairement pas dans ce lot

- **Envoi aux contacts secondaires d'un client** (`albarka_contacts`) : seul
  le compte client reçoit l'invitation. Le rôle de chaque contact reste à
  préciser.
- **Modèle Meta pour les invitations aux formulaires** : les formulaires
  restent en message libre, et l'e-mail prend le relais hors fenêtre de 24 h.
  Le modèle Meta ne sert pour l'instant qu'aux documents de l'espace client.
- **Textes réglables pour les autres notifications** (rappels d'échéances,
  dépôt d'une pièce par un client) : ils restent tels quels.
- **Tableau de bord du client** : il n'est pas filtré par les modules fermés.
  Seuls le menu et les listes le sont.
- **Ouvrir une facture de la Caisse depuis l'espace client d'un comptable** :
  le PDF reste soumis aux droits Caisse existants (`CAISSE_PDF_ACTION_ROLES`).
  Je n'élargis pas ces droits.
- **Passe-droit du superviseur** pour l'encaissement : conservé, comme pour
  les Paiements et le reste du portail.

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
9. **Personnels** : la fiche propose « Caissier » et plus « Administrateur ».
   Coche « Caissier » à une secrétaire.
10. Avec une secrétaire **sans** Caissier, ouvre la **Caisse** : pas de bouton
    Encaisser, pas d'option « Reçu de caisse ». Crée une facture pour un
    client, en cochant « Mettre à disposition dans l'espace du client » : le
    client reçoit le WhatsApp « Une nouvelle facture est disponible… ».
11. Avec la secrétaire **Caissière**, clique **Encaisser** sur cette facture
    et encaisse le total : le message « reçu REC-… délivré » s'affiche, et
    « Voir le reçu » ouvre le PDF. La carte « Facturé » ne double pas. Le
    client reçoit le WhatsApp du reçu.
12. **Dépôt espace client** : choisis le client, catégorie « Rapport »,
    téléverse un PDF (ou **Scanner** sur téléphone), **Déposer**. Le message
    « client prévenu par WhatsApp » s'affiche, et la ligne apparaît avec
    « Visible, non consulté ».
13. **Paramètres → Notifications** : modifie le texte « Rapport », vérifie
    l'aperçu et enregistre. Refais un dépôt « Rapport » : le WhatsApp suit le
    nouveau texte.
14. Dans la fiche du client, onglet **Espace client** : décoche « Mes
    missions » et enregistre.
15. Connecte-toi avec ce client. Le menu n'a plus « Mes missions » ;
    **Factures & documents** montre la facture (Payée), le reçu et le rapport,
    avec « Nouveau ». Ouvre-en un : côté cabinet, la ligne passe à « Consulté
    le … ».
16. Avec un compte qui avait le rôle Administrateur (autre que le compte
    admin) : il n'a plus accès aux réglages réservés à l'administrateur.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
