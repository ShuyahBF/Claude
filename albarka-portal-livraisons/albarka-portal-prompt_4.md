# Albarka — Lot 4 : Superviseur réservé, comptes, présence, déconnexion automatique, liste blanche, notifications push, journal avec IP, comptes de test, Paramètres, dépôt multi-clients, barre jaune

Applique `albarka-portal-corrections_4_3156df6.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `3d6b60a` (« Auto-generated
changes », juste après `2e0a021`, le lot 3 que tu as publié). C'est un
`git format-patch` d'un seul commit : applique-le en UN SEUL `git am`, puis
redéploie (backend et frontend) et enregistre sur GitHub. Ce patch remplace
entièrement les versions précédentes du lot 4 (`…_4_56d4b58.patch`,
`…_4_37ad3ec.patch`, `…_4_90834f0.patch`, `…_4_8fd0653.patch`,
`…_4_439dc65.patch` et `…_4_af5114c.patch`) que je t'avais envoyées : n'applique que celui-ci.

Vocabulaire : quand je dis « admin », je parle du compte
`admin@sawalismartsystems.com`, le super-utilisateur de la plateforme, pas du
rôle Administrateur.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers**
- `backend/tests/test_accounts_lot4.py` : tests du lot. Tu ne les lances pas.
- `frontend/src/components/AccountActions.jsx` : actions sur un compte (désactiver, réinitialiser le mot de passe, supprimer) et colonne « Connexion / modification »
- `backend/albarka_presence.py` : présence en temps réel (keep-alive)
- `frontend/src/components/Presence.jsx` : battements depuis chaque page, pastilles et libellés de présence
- `frontend/src/components/AutoLogoutGate.jsx`, `frontend/src/lib/useIdleTimer.js` : déconnexion automatique pour inactivité (repris de Sawali)
- `frontend/src/lib/busyTasks.js` : suivi des tâches en cours, qui empêchent la déconnexion automatique
- `backend/albarka_access.py` : liste blanche du personnel (appareils + IP) et jetons d'accès temporaires
- `backend/tests/test_access_lot4.py` : tests. Tu ne les lances pas.
- `frontend/src/lib/device.js` : identifiant de l'appareil et code d'accès temporaire
- `frontend/src/pages/admin/StaffAccessPanel.jsx` : Paramètres → Accès du personnel
- `frontend/src/components/TemporaryAccessButton.jsx` : bouton « Accès temporaire » (Personnels)
- `frontend/src/components/RecentClientsCard.jsx` : tableau de bord, derniers clients connectés
- `frontend/src/pages/public/Error404.jsx` : page « ERREUR 404 » neutre
- `backend/albarka_push.py` : notifications push (Web Push, chiffrement RFC 8291 et VAPID avec `cryptography`)
- `backend/albarka_request_ctx.py` : IP et navigateur de la requête en cours (pour le Journal)
- `backend/tests/test_push_lot4.py` : tests. Tu ne les lances pas.
- `frontend/public/sw.js` : service worker qui affiche les notifications
- `frontend/public/manifest.json` : portail installable sur l'écran d'accueil (nécessaire au push sur iPhone)
- `frontend/src/components/PushOptIn.jsx` : « Notifications sur cet appareil » (espace client)
- `frontend/src/components/MultiClientUpload.jsx` : Dépôt → mode « Plusieurs clients »
- `frontend/src/components/SidebarInfoBar.jsx` : barre jaune en haut de la sidebar (date/heure, version)
- `frontend/src/version.js` : numéro de version affiché (`APP_VERSION = "v2026.4"`)

**Fichiers modifiés**
- `backend/albarka_models.py` : suppression de `effective_roles()` (lot 3), ajout de `is_test_account()`, `hide_test_accounts_filter()`, `NOT_TEST_ACCOUNT` et `SETTINGS_ROLES`
- `backend/albarka_auth.py` : retour à la version d'avant le lot 3 (plus de rôles « effectifs »), plus la date d'émission (`iat`) dans le jeton, la fermeture des sessions ouvertes avant une réinitialisation du mot de passe, le contrôle de la liste blanche dans `verify-otp` et une session bornée à la fin d'un accès temporaire
- `backend/albarka_models.py` (en plus) : `OtpVerifyRequest` accepte `device_id` et `access_code`
- `backend/albarka_presence.py` (en plus) : début de session, dernière activité réelle, `GET /presence/recent-clients`
- `backend/albarka_myaccount.py` : date de dernière modification notée quand la personne modifie son propre compte ; `GET /me/idle-config` (délai de déconnexion automatique)
- `backend/albarka_clients.py` : règle Superviseur, retour de la règle Administrateur d'origine, suppression d'un compte (personnel : superviseur ; client : admin), `POST /clients/{id}/active`, `POST /clients/{id}/reset-password`, date et auteur de la dernière modification, comptes de test (`POST` et `DELETE /clients/test-accounts`), masquage des comptes de test
- `backend/albarka_admin_settings.py`, `albarka_settings_tests.py`, `albarka_branding.py`, `albarka_signing.py` : routes des Paramètres réservées au superviseur ; nouveau réglage `auto_logout_minutes`
- `backend/albarka_dashboard.py`, `albarka_forms.py`, `albarka_phase_c.py`, `albarka_notifications.py`, `albarka_reports_mgmt.py` : comptes de test masqués ou exclus des envois de masse ; `albarka_phase_c.py` renvoie aussi `peer_id` pour les discussions directes du chat
- `backend/server.py` : routeur Présence inclus sous `/api`, index créé au démarrage
- `frontend/src/components/ChatBubble.jsx` : présence des collègues et de l'interlocuteur ; l'enregistrement d'une note vocale compte comme tâche en cours
- `frontend/src/pages/admin/AdminWhatsAppConversations.jsx` : présence sur le portail des contacts clients
- `backend/tests/test_client_space_lot3.py` : tests de la règle Administrateur du lot 3 retirés
- `frontend/src/pages/admin/AdminStaff.jsx` : case Superviseur verrouillée, case Administrateur rétablie, actions sur les comptes, bouton « Créer comptes de test », badge TEST
- `frontend/src/pages/admin/AdminClients.jsx` : actions sur les comptes, colonne « Connexion / modification », suppression pour admin
- `frontend/src/components/PortalLayout.jsx` : menu Paramètres réservé au superviseur, battements de présence, « hors ligne » envoyé à la déconnexion
- `frontend/src/contexts/AuthContext.jsx`, `frontend/src/pages/auth/Login.jsx` : appareil et code d'accès temporaire envoyés à la vérification du code, lien `/login?acces=…`, redirection vers « ERREUR 404 »
- `frontend/src/App.js` : route `/erreur-404`
- `frontend/src/pages/admin/AdminShared.jsx` : carte « Derniers clients connectés » sur le tableau de bord
- `backend/albarka_phase_c.py` (en plus) : `_log_platform_event` enregistre `ip` et `user_agent`
- `backend/server.py` (en plus) : middleware qui retient l'IP réelle (`X-Forwarded-For`) de chaque requête, routeur Push
- `backend/albarka_client_space.py` (en plus) : push envoyé en plus de WhatsApp pour les documents mis à disposition
- `frontend/public/index.html` : lien vers le manifeste et balises « application » pour iPhone
- `frontend/src/pages/admin/AdminPhaseC.jsx` : colonne « Adresse IP » dans le Journal plateforme
- `frontend/src/pages/portal/CabinetDocuments.jsx`, `frontend/src/pages/admin/ClientDocsNotifPanel.jsx` : activation du push côté client, interrupteur dans les Paramètres
- `backend/albarka_client_space.py` (en plus) : `POST /client-space/documents/multi` (même document déposé chez plusieurs clients) ; `backend/tests/test_client_space_lot3.py` : test correspondant
- `frontend/src/pages/admin/AdminClientSpace.jsx` : choix « Un client » / « Plusieurs clients » ; `frontend/src/components/PortalLayout.jsx` (en plus) : barre jaune
- `frontend/src/pages/admin/AdminSettings.jsx` : réglage RGPD modifiable par le superviseur ; champ « Déconnexion automatique après inactivité »

Aucune nouvelle dépendance, aucune migration. Nouvelle collection
`deleted_users` (trace des comptes supprimés), créée à la première
suppression. Les comptes portent désormais `updated_at`, `updated_by` et
`updated_by_name` (dernière modification) et, après une réinitialisation,
`password_changed_at`. Les comptes de test portent `is_test_account: true`.
Nouvelle collection `presence` (un document par compte, index sur
`last_seen`), créée au premier battement. Nouvelles collections
`trusted_devices`, `device_requests` et `access_tokens` (codes stockés
hachés, jamais en clair), `push_subscriptions` (un document par appareil
abonné). Les entrées du Journal portent désormais `ip` et `user_agent` (les
anciennes n'en ont pas).
Les jetons de connexion déjà émis restent valables : seule une
réinitialisation du mot de passe ferme les sessions du compte concerné.

## Variables d'environnement

- **Nouvelles, facultatives** : `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`
  (clés des notifications push, en base64url). Si elles sont absentes, une
  paire est générée au premier besoin et gardée en base (document
  `settings`, `_id: "push_vapid"`, jamais renvoyé par l'API). **Rien à
  configurer.** Ne change pas ces clés ensuite, sinon les appareils déjà
  abonnés ne recevraient plus rien.
- **Déjà présentes, réutilisées telles quelles** : `EMERGENT_EMAIL_KEY` (codes
  de connexion des comptes de test), `JWT_SECRET_KEY`, `MONGO_URL`, `DB_NAME`.
- **Paramètres stockés en base (AdminSettings)** : `auto_logout_minutes`
  (défaut 30, 0 = désactivé, 120 max), réglable dans Paramètres → Cabinet ;
  `staff_whitelist_enabled` (défaut **désactivé** : rien ne change au
  déploiement), `staff_ip_whitelist` (adresses ou plages CIDR),
  `access_token_issuer_emails` (modifiable par admin seul), dans Paramètres →
  Accès du personnel ; `client_docs_push_enabled` (défaut activé), dans
  Paramètres → Notifications.

## Ce que ça apporte, dans l'ordre

1. **Correction du lot 3 sur le rôle Administrateur.** J'ai confondu mes
   termes. Par « administrateur », je voulais parler du compte qui a tous les
   droits sur la plateforme, pas du seul `admin@sawalismartsystems.com`.
   J'annule donc la règle du lot 3 qui réservait le rôle `administrateur` au
   compte admin :
   - `effective_roles()` disparaît ;
   - `albarka_auth.py` revient à sa version d'origine ;
   - dans `albarka_clients.py`, la règle d'origine revient : seul un compte
     qui a le rôle Administrateur peut l'attribuer ou le retirer ;
   - la case Administrateur réapparaît dans la fiche du personnel pour les
     administrateurs, comme avant.

2. **Rôle Superviseur : interdit à tous sauf au compte admin du portail.**
   - Le Superviseur a tous les droits (passe-droit de `require_roles`). Seul
     `admin@sawalismartsystems.com` peut le donner ou le retirer : à la
     création (`POST /clients/staff`) comme à la modification
     (`PATCH /clients/{id}`), sinon 403.
   - Un compte qui a déjà le rôle Superviseur ne peut être modifié que par un
     superviseur ou par le compte admin.
   - Dans la fiche du personnel, la case « Superviseur » est grisée pour
     tous, sauf pour le compte admin, avec une mention qui l'explique.

3. **Supprimer un compte du personnel : superviseur uniquement.**
   - Un bouton Supprimer (corbeille), avec une fenêtre de confirmation,
     apparaît sur chaque ligne de **Personnels**, pour le superviseur.
   - Côté serveur, `DELETE /clients/{id}` sur un compte du personnel exige le
     rôle Superviseur. Le compte admin du portail n'est jamais supprimable, et
     un superviseur ne peut être supprimé que par le compte admin. On ne peut
     pas non plus supprimer son propre compte.
   - Le compte est effacé, mais une copie est gardée dans `deleted_users`
     (avec qui a supprimé et quand), et l'action est tracée dans le Journal
     plateforme (`staff.delete`).
   - Supprimer un compte **client** est réservé à **admin** : le bouton
     corbeille de la liste Clients n'apparaît que pour lui. Sinon, 403. Même
     trace dans `deleted_users` et le Journal (`client.delete`).

4. **Bouton « Créer comptes de test » (Personnels, superviseur).**
   - Il crée, ou remet à neuf s'ils existent déjà, les comptes de ma recette :
     TEST Secrétaire A (secrétariat), TEST Secrétaire B (secrétariat +
     caissier), TEST Collaborateur Formulaires (comptable + formulaires), TEST
     Comptable, TEST Client 1 et TEST Client 2.
   - Il crée aussi TEST Superviseur, mais seulement si c'est le compte admin
     qui lance l'opération (règle du point 2). Sinon, le compte est signalé
     « ignoré ».
   - Je donne l'e-mail qui recevra les codes de connexion et un mot de passe
     commun. Chaque compte reçoit une adresse « +alias » de cet e-mail (ex.
     `moi+test-secretaire@gmail.com`) : tous les codes OTP arrivent dans la
     même boîte.
   - Je peux aussi donner le WhatsApp (+226…) de Client 1 et de Client 2 pour
     tester les notifications.
   - Un vrai compte qui utiliserait déjà une de ces adresses n'est jamais
     touché.
   - Le bouton « Supprimer les comptes de test » les efface tous d'un coup
     (`DELETE /clients/test-accounts`).

5. **Comptes de test invisibles, sauf pour le superviseur.**
   - Ils portent `is_test_account: true`. Ils sont exclus :
     - de la liste des clients et du personnel ;
     - de la fiche client (404) ;
     - des sélecteurs de client ;
     - des destinataires de formulaires ;
     - des compteurs du tableau de bord.
     Tout cela vaut pour tout le monde sauf le superviseur, qui les voit avec
     un badge « TEST ».
   - Ils sont aussi toujours exclus des envois de masse : diffusion à tous les
     clients ou à tout le personnel, rapports en masse « tous les clients »,
     alertes au personnel lors d'un dépôt de pièce.

6. **Paramètres : superviseur uniquement.**
   - Le menu « Paramètres » de la barre latérale n'est plus visible que du
     Superviseur.
   - Côté serveur, les routes de la page passent toutes par
     `SETTINGS_ROLES = ["superviseur"]` : `/admin/settings`,
     `/admin/settings/test/*`, `/admin/branding`, `/admin/certificates`.
   - Le masquage RGPD des numéros, réservé jusqu'ici au rôle Administrateur
     littéral, est maintenant modifiable par le Superviseur, puisque lui seul
     accède aux Paramètres.

7. **Actions sur les comptes clients et du personnel.**
   - Dans les listes **Clients** et **Personnels**, chaque ligne a deux
     nouveaux boutons.
   - **Désactiver / Réactiver** (`POST /clients/{id}/active`) : la personne
     ne peut plus se connecter, avec effet immédiat.
   - **Réinitialiser le mot de passe** (`POST /clients/{id}/reset-password`) :
     - je saisis un mot de passe, ou je laisse vide pour en générer un de
       10 caractères, sans caractères ambigus ;
     - il s'affiche une seule fois, avec un bouton Copier, pour que je le
       transmette à la personne ;
     - les sessions ouvertes de ce compte sont fermées : le jeton contient
       maintenant sa date d'émission (`iat`), et `get_current_user` refuse un
       jeton émis avant `password_changed_at` ;
     - le mot de passe n'est jamais écrit dans le Journal.
   - **Qui peut faire ces actions :**
     - sur un client : rôles de gestion des clients ;
     - sur un collaborateur : superviseur, direction ou administrateur ;
     - un compte Superviseur : seulement un superviseur ou admin ;
     - le compte admin : lui seul ;
     - jamais sur son propre compte.
   - Nouvelle colonne **« Connexion / modification »** : dernière connexion
     (`last_login`, déjà enregistrée à chaque connexion), et dernière
     modification avec date, heure et auteur. Toute modification d'un compte
     met à jour cette date : fiche, rôles, numéros vérifiés, activation, mot
     de passe, et la personne elle-même dans « Mon compte ».

8. **Présence en temps réel (keep-alive) des clients et des collaborateurs.**
   - **Battement.** Chaque page ouverte du portail, espace client comme
     cabinet, envoie un battement toutes les 25 s (`POST /presence/heartbeat`,
     avec « onglet visible ou non » et la page ouverte).
   - **Hors ligne tout de suite** à la déconnexion et à la fermeture de
     l'onglet (`POST /presence/offline`, via un `fetch` `keepalive` qui garde
     le jeton). Au retour d'un onglet au premier plan, le battement part
     aussitôt.
   - **Trois états**, calculés par le serveur :
     - « En ligne » : battement de moins de 70 s, onglet visible ;
     - « Absent » : onglet en arrière-plan ;
     - « Hors ligne » : plus de battement depuis 70 s, ou déconnexion.
     Chaque état est affiché avec « vu il y a … ».
   - **Pas de WebSocket** dans l'application : le cabinet lit l'état toutes
     les 15 s (`GET /presence`, réservé au personnel ; comptes de test pour le
     superviseur seulement).
   - **Où ça s'affiche :**
     - **Clients** et **Personnels** : pastille et libellé dans la colonne
       « Connexion / modification », et le nombre de comptes en ligne sous le
       titre de la page ;
     - **chat interne** (bulle) : chaque collègue et chaque discussion
       directe est marqué ● en ligne, ◐ absent ou ○ hors ligne, les collègues
       en ligne en premier, et l'état de l'interlocuteur s'affiche au-dessus
       des messages ;
     - **messagerie WhatsApp** : quand le contact est un client du portail,
       une pastille le montre connecté, dans la liste et en tête de
       conversation. `GET /presence/by-phone` ne renvoie que l'état pour des
       numéros que le cabinet connaît déjà.

9. **Déconnexion automatique après inactivité, sauf tâche en cours** (repris
   de ma plateforme Sawali).
   - Sans clavier, souris, défilement ni toucher pendant le délai réglé (par
     défaut **30 minutes**), la session se ferme, côté client comme côté
     cabinet.
   - 30 s avant, une fenêtre « Session bientôt fermée » affiche un compte à
     rebours, avec « Rester connecté(e) » et « Se déconnecter maintenant ».
   - À la déconnexion, la présence passe « hors ligne » tout de suite, puis
     retour à la page de connexion avec un message.
   - Le délai se règle dans **Paramètres → Cabinet** (superviseur) :
     `auto_logout_minutes`, de 0 à 120, 0 = désactivée. Tout utilisateur
     connecté le lit via `GET /me/idle-config`.
   - **Jamais pendant une tâche en cours** (`frontend/src/lib/busyTasks.js`) :
     - une requête d'écriture vers l'API non terminée (envoi de fichier,
       génération de rapport, envoi WhatsApp…, hors battements de présence),
       suivie automatiquement par un intercepteur axios ;
     - l'enregistrement d'une note vocale dans le chat ;
     - la période d'inactivité ne recommence qu'une fois toutes les tâches
       terminées.

10. **Liste blanche du personnel : appareils et adresses IP.**
    - **Activation.** Désactivée par défaut. Le superviseur la règle dans
      **Paramètres → Accès du personnel**. Une fois activée, un collaborateur
      ne peut se connecter que depuis :
      - une **adresse IP ou plage autorisée** (réseau du bureau, notation CIDR
        acceptée ; l'écran affiche l'IP actuelle avec un bouton « ajouter ») ;
      - ou un **appareil autorisé** : chaque navigateur a un identifiant
        (`albarka_device_id`), envoyé à la vérification du code. L'appareil
        peut être partagé par tout le cabinet (« Autoriser cet appareil ») ou
        réservé à un collaborateur.
    - **Refus.** Le contrôle se fait **après** mot de passe **et** code OTP,
      dans `verify-otp` (`check_staff_access`). Hors liste, la réponse est
      une **404 « ERREUR 404 »** et l'écran affiche une page d'erreur neutre
      (`/erreur-404`) : un intrus ne sait même pas si ses identifiants
      étaient bons.
    - **Traces.** Chaque refus est tracé dans le Journal plateforme
      (`login.blocked_whitelist`, avec IP, appareil et navigateur). Il crée
      une **demande d'appareil**, que le superviseur approuve (pour ce
      collaborateur, ou comme poste partagé) ou refuse. Un appareil autorisé
      peut être retiré à tout moment.
    - **Exemptions.** Admin et le rôle Superviseur ne sont **jamais**
      bloqués (pour ne pas enfermer tout le monde dehors). Les clients ne
      sont pas concernés.
    - **Sessions déjà ouvertes.** Le contrôle a lieu à la connexion : les
      sessions en cours au moment de l'activation restent valables jusqu'à
      leur expiration ou à la déconnexion automatique.

11. **Jetons d'accès temporaires.**
    - **Qui les crée.** Admin, ou une adresse e-mail qu'admin désigne dans
      Paramètres → Accès du personnel (liste modifiable par admin seul), via
      le bouton **« Accès temporaire »** sur la ligne d'un collaborateur
      dans **Personnels**.
    - **Durée.** 4 h, 8 h, 24 h, 3 jours ou 7 jours, avec un message
      facultatif.
    - **Envoi.** Le collaborateur reçoit par **e-mail et WhatsApp** :
      - un lien `/login?acces=CODE` ;
      - le code, qu'il peut aussi saisir sous le code OTP (« J'ai un code
        d'accès temporaire »).
    - **Utilisation.**
      - Le jeton ouvre l'accès depuis n'importe quel appareil pendant sa
        durée ; mot de passe et OTP restent demandés.
      - La session ne dure pas plus longtemps que le jeton.
      - Il est lié à ce seul collaborateur.
    - **Suivi.**
      - Chaque utilisation est notée (date, IP, appareil).
      - Le jeton est révocable (Paramètres → Accès du personnel).
      - Le code n'est jamais stocké en clair ni écrit dans le Journal.

12. **Tableau de bord : les 10 derniers clients connectés.**
    - Pour la **Direction**, le **Secrétariat**, le Superviseur et **admin**,
      une carte « Derniers clients connectés » (`GET /presence/recent-clients`)
      montre, pour chacun :
      - l'état actuel (pastille) ;
      - l'heure de connexion ;
      - l'heure de la **dernière activité réelle** (clavier, souris,
        défilement) ;
      - la **durée jusqu'à la fin de toute activité détectée**.
    - Les battements de présence transportent maintenant l'heure de la
      dernière activité. Une nouvelle session commence après une
      déconnexion ou 70 s sans battement.

13. **Notifications push pour les documents mis à disposition d'un client.**
    - **Côté client.** En haut de « Factures & documents », le client voit
      **« Notifications sur cet appareil »** : Activer, Tester, Désactiver.
      Le navigateur demande l'autorisation, puis l'appareil est enregistré
      (`POST /push/subscribe`).
    - **Envoi.** À chaque dépôt visible ou mise à disposition, le client
      reçoit une notification sur ses appareils abonnés (« Facture
      disponible — Cabinet ALBARKA » + la liste), **en plus** de WhatsApp,
      même portail fermé. Le clic ouvre sa page.
    - **Compatibilité.**
      - Android et ordinateur : Chrome, Edge, Firefox.
      - iPhone et iPad : iOS 16.4 ou plus, **seulement si le portail est
        ajouté à l'écran d'accueil** (manifeste ajouté). L'écran l'explique
        au client.
    - **Technique.**
      - Chiffrement Web Push (RFC 8291) et identification VAPID (RFC 8292)
        codés avec `cryptography`, déjà présent : **aucune nouvelle
        dépendance**.
      - `frontend/public/sw.js` affiche les notifications.
      - Les abonnements expirés (réponse 404/410 du service de push) sont
        supprimés automatiquement.
    - **Réglages.**
      - Interrupteur « Notification push » dans Paramètres → Notifications.
      - Le suivi du document indique le canal « push » quand seul le push a
        abouti.

14. **Adresse IP dans le Journal plateforme.**
    - Un middleware retient l'IP réelle de chaque requête (premier
      `X-Forwarded-For`, derrière le proxy) et le navigateur.
    - `_log_platform_event` enregistre `ip` et `user_agent` pour **toutes**
      les actions tracées.
    - Le Journal plateforme a une nouvelle colonne « Adresse IP » ; le
      navigateur s'affiche au survol.

15. **Dépôt dans l'espace client : plusieurs clients en une fois.**
    - Le module **Dépôt espace client** propose deux modes : « Un client »
      (comme avant) et « Plusieurs clients ».
    - En mode « Plusieurs clients » : liste des clients actifs à cocher,
      recherche, « Tout sélectionner » (sur les résultats de la recherche),
      compteur de sélection ; même formulaire que pour un client.
    - `POST /client-space/documents/multi` (champ `tenant_ids` : identifiants
      séparés par des virgules, 300 clients maximum) : chaque fichier est
      stocké une seule fois, chaque client reçoit sa propre fiche et sa
      propre notification (push, WhatsApp ou e-mail).
    - Compte rendu affiché : nombre de documents et de clients prévenus,
      clients non prévenus avec le motif, clients dont le module « Factures
      & documents » est fermé. Action tracée `client_space.upload_multi`.

16. **Barre jaune en haut de la sidebar.**
    - Cabinet et espace client : date et heure en temps réel à gauche
      (mise à jour chaque seconde), numéro de version à droite.
    - La version vient de `frontend/src/version.js` (`v2026.4` pour ce lot) :
      c'est le seul endroit à modifier aux prochaines livraisons.

## Volontairement pas dans ce lot

- **Envoi automatique du nouveau mot de passe** par e-mail ou WhatsApp : je
  le transmets moi-même. Un mot de passe ne doit pas circuler par e-mail.
- **Suppression « douce »** d'un compte du personnel (désactivation) : la case
  « Compte actif » existe déjà pour ça. Supprimer efface le compte, avec une
  trace dans `deleted_users`.
- **Comptes de test sans alias « + »** : si ma messagerie n'accepte pas les
  alias « +… », les codes ne m'arriveront pas. J'utiliserai une adresse Gmail.

## À tester une fois déployé

1. Connecte-toi avec un compte **Direction** et ouvre **Personnels →
   Nouveau personnel** : la case « Superviseur » est grisée, avec la mention
   « réservé au compte admin du portail ». Le menu **Paramètres** n'apparaît
   pas.
2. Toujours en Direction, tente de modifier un compte Superviseur : message
   « Seul un superviseur peut modifier un compte Superviseur ».
3. Avec **admin@sawalismartsystems.com** : la case « Superviseur » est
   cochable. Donne-la puis retire-la à un collaborateur.
4. Avec un **Superviseur** : le menu **Paramètres** est là et le réglage RGPD
   est modifiable.
5. Superviseur → **Personnels → Créer comptes de test** : saisis ton adresse
   Gmail, un mot de passe et les WhatsApp des deux clients de test, puis
   **Créer / remettre à neuf**. La liste des comptes s'affiche avec leur
   adresse « +alias ». Dans Personnels, les comptes TEST apparaissent avec le
   badge « TEST ».
6. Connecte-toi avec un compte TEST (adresse +alias + mot de passe) : le code
   arrive dans ta boîte Gmail.
7. Avec un compte **Direction** : les comptes TEST n'apparaissent ni dans
   Personnels, ni dans Clients, ni dans le sélecteur de client de la Caisse.
8. Superviseur : supprime un compte du personnel (corbeille, puis
   confirmation). Le compte disparaît et l'action figure dans le **Journal
   plateforme**. Le bouton n'existe ni sur ton propre compte ni sur le compte
   admin.
9. **Créer comptes de test → Supprimer les comptes de test** : tous les
   comptes TEST disparaissent, les vrais comptes restent.
10. Un administrateur (rôle Administrateur) voit à nouveau la case
    Administrateur dans la fiche du personnel et peut la donner.
11. En **Direction**, ouvre **Clients** : pas de corbeille. Clique
    **Désactiver** (icône marche/arrêt) sur un client : il passe « Inactif ».
    Il ne peut plus se connecter, et la colonne affiche « Modifié : … ·
    Direction… ».
12. **Réinitialiser le mot de passe** (icône clé) en laissant le champ vide :
    un mot de passe de 10 caractères s'affiche, avec Copier. Le client se
    connecte avec celui-ci. S'il était déjà connecté ailleurs, sa session est
    fermée.
13. Connecte-toi avec **admin** : la corbeille apparaît dans **Clients**.
    Supprime un client de test : il disparaît, et l'action figure au Journal.
14. Après une connexion d'un compte, la colonne affiche « Connexion : » avec
    la date et l'heure.
15. Ouvre le portail avec un **client** sur un autre appareil (ou en
    navigation privée). Côté cabinet, dans **Clients**, il passe « En ligne »
    en moins de 15 s, et le compteur « client(s) en ligne » augmente. Mets
    son onglet en arrière-plan : « Absent ». Clique **Déconnexion** ou ferme
    l'onglet : « Hors ligne · Vu à l'instant ».
16. Ouvre la **bulle de chat** : les collègues connectés sont marqués ● et
    listés en premier. Démarre une discussion directe : l'état de ton
    interlocuteur s'affiche au-dessus des messages.
17. **WhatsApp** : ouvre la conversation d'un client connecté au portail. Une
    pastille « En ligne » apparaît dans la liste et sous son numéro.
18. **Paramètres → Cabinet** : règle « Déconnexion automatique » sur 1 minute
    et enregistre. Connecte-toi avec un client et ne touche à rien. Après
    30 s, la fenêtre « Session bientôt fermée » affiche le compte à rebours.
    À 1 minute, retour à la page de connexion avec le message d'inactivité.
19. Recommence en téléversant une grosse pièce (connexion lente) sans toucher
    à rien. Tant que l'envoi n'est pas fini, il n'y a ni avertissement ni
    déconnexion. **Remets ensuite le délai à 30 minutes.**
20. Superviseur → **Paramètres → Accès du personnel** : clique « Autoriser
    cet appareil » sur le poste du bureau et ajoute l'IP du bureau si elle
    est fixe. **Active** la liste blanche et enregistre.
21. Avec un comptable sur un **autre appareil** (téléphone en 4G) :
    identifiants et code corrects, puis page « 404 ERREUR ». La demande
    apparaît dans « Demandes en attente », et le Journal plateforme montre
    la tentative refusée.
22. Clique **« Pour ce collaborateur »** : le comptable se reconnecte depuis
    ce téléphone et entre.
23. Avec **admin** : dans « Adresses e-mail autorisées à créer des accès
    temporaires », mets l'adresse de la DG et enregistre.
24. La DG → **Personnels** → icône « Accès temporaire » sur une secrétaire →
    24 heures → **Créer et envoyer**. La secrétaire reçoit l'e-mail et le
    WhatsApp. Depuis son téléphone non autorisé, elle clique sur le lien,
    saisit mot de passe et code, et entre. **Révoque** l'accès : elle ne
    peut plus entrer depuis ce téléphone.
25. Avec la **Direction** ou le **Secrétariat** : le **Tableau de bord**
    affiche « Derniers clients connectés », avec la durée d'activité de
    chacun.
26. Pour revenir à l'état d'avant : **désactive** la liste blanche.
27. Sur un téléphone **Android** (Chrome), connecte-toi comme client, ouvre
    **Factures & documents** → **Activer**, accepte, puis **Tester** : la
    notification d'essai arrive. Ferme le portail. Côté cabinet, dépose un
    document pour ce client : la notification arrive, en plus du WhatsApp.
    Toucher la notification ouvre « Factures & documents ».
28. Sur **iPhone** : dans Safari, Partager → « Sur l'écran d'accueil »,
    ouvre le portail depuis l'icône ALBARKA, puis refais l'étape 27.
29. **Journal plateforme** : chaque nouvelle action (connexion refusée,
    suppression, réinitialisation…) affiche l'adresse IP de son auteur.
30. **Dépôt espace client** → **Plusieurs clients** : cherche, coche deux ou
    trois clients (ou « Tout sélectionner »), choisis un PDF, titre « Note
    des impôts 2026 », **Déposer chez N client(s)**, confirme. Le compte rendu
    indique les clients prévenus ; chaque client coché voit le document dans
    **Factures & documents** et reçoit son WhatsApp.
31. La **barre jaune** en haut de la sidebar affiche la date et l'heure qui
    avancent chaque seconde à gauche et **v2026.4** à droite, côté cabinet
    comme côté client.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
