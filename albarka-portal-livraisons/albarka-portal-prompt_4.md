# Albarka — Lot 4 : rôle Superviseur réservé, suppression du personnel, comptes de test, Paramètres

Applique `albarka-portal-corrections_4_56d4b58.patch` sur la branche
`conflict_030926_0658`. Base attendue : le commit `3d6b60a` (« Auto-generated
changes », juste après `2e0a021`, le lot 3 que tu as publié). C'est un
`git format-patch` d'un seul commit : applique-le en UN SEUL `git am`, puis
redéploie (backend et frontend) et enregistre sur GitHub.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveau fichier backend**
- `backend/tests/test_accounts_lot4.py` : tests du lot. Tu ne les lances pas.

**Fichiers modifiés**
- `backend/albarka_models.py` : suppression de `effective_roles()` (lot 3), ajout de `is_test_account()`, `hide_test_accounts_filter()`, `NOT_TEST_ACCOUNT` et `SETTINGS_ROLES`
- `backend/albarka_auth.py` : retour à la version d'avant le lot 3 (plus de rôles « effectifs »)
- `backend/albarka_clients.py` : règle Superviseur, retour de la règle Administrateur d'origine, suppression d'un compte du personnel, comptes de test (`POST` et `DELETE /clients/test-accounts`), masquage des comptes de test
- `backend/albarka_admin_settings.py`, `albarka_settings_tests.py`, `albarka_branding.py`, `albarka_signing.py` : routes des Paramètres réservées au superviseur
- `backend/albarka_dashboard.py`, `albarka_forms.py`, `albarka_phase_c.py`, `albarka_notifications.py`, `albarka_reports_mgmt.py` : comptes de test masqués ou exclus des envois de masse
- `backend/tests/test_client_space_lot3.py` : tests de la règle Administrateur du lot 3 retirés
- `frontend/src/pages/admin/AdminStaff.jsx` : case Superviseur verrouillée, case Administrateur rétablie, bouton Supprimer, bouton « Créer comptes de test », badge TEST
- `frontend/src/components/PortalLayout.jsx` : menu Paramètres réservé au superviseur
- `frontend/src/pages/admin/AdminSettings.jsx` : réglage RGPD modifiable par le superviseur

Aucune nouvelle dépendance, aucune migration. Nouvelle collection
`deleted_users` (trace des comptes du personnel supprimés), créée à la
première suppression. Les comptes de test portent `is_test_account: true`.

## Variables d'environnement

- **Nouvelles** : aucune.
- **Déjà présentes, réutilisées telles quelles** : `EMERGENT_EMAIL_KEY` (codes
  de connexion des comptes de test), `JWT_SECRET_KEY`, `MONGO_URL`, `DB_NAME`.
- **Paramètres stockés en base (AdminSettings)** : aucun nouveau.

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
   - La suppression d'un compte **client** ne change pas.

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

## Volontairement pas dans ce lot

- **Suppression des comptes clients** : elle reste possible pour tout
  collaborateur, comme aujourd'hui. Je la restreindrai si besoin.
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

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch et déploie, c'est tout.
