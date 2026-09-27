# Sawali — Lot 25 : droits d'accès alignés (Traducteur, modérateur, Registre des erreurs, Caisse, liens cryptés, liste noire IP, profil Fabricant)

Applique `sawali-portal-corrections_25_0f62076.patch` sur la branche
`conflict_230926_1008`. Base attendue : ton commit `399c63f` (« Auto-generated
changes », juste après `68a931c`, le lot 24 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit : applique-le en UN SEUL `git am`, puis redéploie (backend et frontend,
bouton Deploy compris) et enregistre sur GitHub.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveau fichier backend** (test autonome avec MongoDB simulé — tu ne le lances pas)
- `backend/tests/test_roles_links_blacklist_lot25.py`

**Backend modifié**
- `backend/auth.py` : rôle modérateur accepté sous ses deux orthographes
- `backend/server.py` : les deux orthographes du rôle modérateur ; liens cryptés réservés au super-admin ; liste noire IP (refus de bloquer sa propre adresse, super-admin jamais bloqué)
- `backend/routes/auth.py` : profil (`business_type`) du client parent renvoyé aux utilisateurs suivis (`/auth/me` et connexion)
- `backend/routes/internal_chat.py`, `liluvine_pro.py`, `smart_comm_senders.py`, `vidal.py`, `wa_otp_login_9o.py` : les deux orthographes du rôle modérateur

**Frontend modifié**
- `frontend/src/App.js` : route `/portal/i18n` (page Régionalisation pour le Traducteur)
- `frontend/src/pages/auth/Login.jsx` : redirection du Traducteur vers `/portal/i18n`
- `frontend/src/components/PortalLayout.jsx` : liens Traducteur, Registre des erreurs, Caisse, Documentation, Formulaires, Voice Studio, Brochures et Liluvine — Historique
- `frontend/src/pages/admin/AdminClients.jsx` : rôle « Administrateur plateforme (accès complet) » avec avertissement et confirmation
- `frontend/src/pages/admin/StoryStudio.jsx` : libellé « Générer l'image » / « Générer la vidéo »
- `frontend/src/components/TicketsBubble.jsx`, `ContactGroupChips.jsx`, `frontend/src/pages/portal/Contacts.jsx`, `LiluvinePro.jsx`, `frontend/src/pages/admin/AdminLiluvineHistory.jsx` : rôle modérateur reconnu sous ses deux orthographes

Aucune dépendance nouvelle, aucune migration, aucune donnée modifiée.

## Variables d'environnement

Aucune nouvelle variable.

## Ce que ça apporte, dans l'ordre

1. **Le Traducteur accède enfin à la page Régionalisation.**
   - Avant, il était envoyé sur `/admin/i18n`, réservé au rôle système
     admin, et renvoyé vers le portail sans rien pouvoir faire.
   - La même page est maintenant ouverte sur `/portal/i18n` : son lien, sa
     redirection après connexion et son accès y pointent.
   - Le serveur limite déjà ses droits à la lecture et à l'écriture de ses
     langues. L'export/import CSV et les suggestions IA restent réservés à
     admin et superviseur.

2. **Le rôle modérateur fonctionne sous ses deux orthographes.**
   - Le formulaire Clients enregistre « moderateur », alors qu'une partie du
     code testait « moderator » : un modérateur système perdait des droits.
   - Les deux orthographes sont acceptées partout, côté serveur et côté
     écran.
   - Brochures et Liluvine PRO — Historique sont aussi visibles du rôle
     système modérateur, en plus de l'utilisateur suivi « Moderation ».

3. **Registre des erreurs.**
   - Le lien n'est plus affiché qu'aux comptes que le serveur accepte : admin,
     superviseur et modérateur système. Les autres ne voient plus un lien qui
     leur répondait « Accès réservé ».
   - L'utilisateur suivi « Moderation » ne le voit pas : ce registre contient
     les erreurs de tous les clients.

4. **Rôle « Admin (client) ».**
   - Il est renommé « Administrateur plateforme (accès complet) », parce qu'il
     ouvre toute l'administration.
   - Une confirmation s'affiche quand on le choisit, et un encadré
     d'avertissement reste visible tant qu'il est sélectionné.
   - Les droits ne changent pas.

5. **Liens cryptés.** La création d'un lien est maintenant refusée côté
   serveur à tout compte qui n'est pas le super-admin
   admin@sawalismartsystems.com. Avant, seul l'écran était réservé : n'importe
   quel admin pouvait créer un lien en appelant l'API.

6. **Caisse.** Le lien « Caisse/Facturation » n'est plus montré à un
   utilisateur suivi Comptable qui n'a pas le droit Caisse (la page le
   refusait). La condition est la même que celle de la page.

7. **Profil Fabricant transmis aux utilisateurs suivis.**
   - Le menu réduit « Fabricant » s'applique désormais aussi aux utilisateurs
     suivis d'un client Fabricant : le profil est lu sur le client parent.
   - Les rôles qui ont déjà leur propre menu (Traducteur, Médecin,
     Pharmacien, Secrétaire médicale) gardent leur menu.

8. **Documentation et Formulaires.**
   - « Documentation » reste visible pour les comptes qui peuvent créer un
     document (admin, superviseur, suivi Moderation, Administrateur ou
     Superviseur), même si le client n'en a encore aucun : ils peuvent créer
     le premier.
   - « Formulaires » est toujours visible, puisque tout compte peut créer un
     formulaire.

9. **Voice Studio.** Il est grisé, comme les autres modules IA, quand la
   fonctionnalité « Génération vocale IA » n'est pas activée pour le client.

10. **Story Studio.** Le bouton affiche « Générer l'image » ou « Générer la
    vidéo », au lieu de « Générer la image ».

11. **Liste noire IP : plus de verrouillage.**
    - Ajouter une adresse ou une plage qui contient sa propre adresse IP est
      refusé, avec un message en français.
    - Le super-admin connecté n'est jamais bloqué par la liste noire : il peut
      toujours corriger une erreur de blocage.

## Volontairement pas dans ce lot

- **Super-admin pas encore connecté depuis une adresse bloquée** : la page de
  connexion ne sait pas encore qui se connecte. La protection du point 11
  (refus de bloquer sa propre adresse) évite ce cas.
- **Registre des erreurs pour le suivi « Moderation »** : non ouvert, pour
  que chaque client ne voie pas les erreurs des autres.
- **Écrans admin destinés aux superviseurs et modérateurs** (Planning des
  gardes, Exclamations reçues, Suivi des logs VIDAL) : ils restent dans
  l'administration, réservée au rôle admin. Les rendre accessibles demande une
  décision sur ce qu'ils doivent voir.
- **Formulaires ouverts depuis l'administration** : ils continuent de
  s'ouvrir dans le portail.

## À tester une fois déployé

1. Connecte-toi avec un utilisateur suivi **Traducteur** : tu arrives sur
   **Régionalisation** (`/portal/i18n`). Modifie une traduction de ta langue
   et enregistre : c'est accepté.
2. Crée ou modifie un compte avec le rôle **Modérateur** (Admin → Clients).
   Connecte-toi avec : **Brochures & Guides**, **Liluvine PRO — Historique**
   et **Registre des erreurs** apparaissent et s'ouvrent.
3. Avec un **client standard** ou un utilisateur suivi : le lien **Registre
   des erreurs** n'apparaît plus.
4. Admin → Clients → modifier un compte → choisir **« Administrateur
   plateforme (accès complet) »** : une confirmation s'affiche, puis un
   encadré d'avertissement.
5. Avec un compte **admin qui n'est pas** admin@sawalismartsystems.com, essaie
   de créer un **lien crypté** : c'est refusé. Avec le super-admin, ça
   fonctionne.
6. Avec un utilisateur suivi **Comptable** sans droit Caisse : le lien
   **Caisse/Facturation** n'apparaît plus ; **GRH** reste.
7. Avec un utilisateur suivi d'un client dont le **profil d'entreprise est
   Fabricant** : le menu est celui des Fabricants.
8. Avec un utilisateur suivi **Moderation** d'un client sans aucun document :
   **Documentation** est dans le menu et « Nouveau document » fonctionne.
9. Désactive la fonctionnalité **Génération vocale IA** d'un client :
   **Voice Studio** apparaît grisé pour lui.
10. Admin → **Story Studio** : le bouton affiche « Générer l'image ».
11. Admin → **Blacklist IP** : ajoute ta propre adresse IP. Un message refuse
    l'ajout (« cette entrée contient votre propre adresse IP »). Ajouter une
    autre adresse fonctionne toujours.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch en UN SEUL `git am` et
déploie, c'est tout.
