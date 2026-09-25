# Sawali — Lot 23 : explorateur R2 complet, Liluvine prospects, Centre de Messagerie fiable

Applique `sawali-portal-corrections_23_689830c.patch` sur la branche
`Site-SawaliSmartSystems`. La base attendue est ton commit `6ea933f`, celui
où tu viens d'appliquer le patch consolidé des lots 20 à 22. C'est un
`git format-patch` d'un seul commit : applique-le en UN SEUL `git am`, puis
redéploie. Pense aussi à publier le déploiement (bouton Deploy), sinon la
production reste sur l'ancienne version : aujourd'hui, les routes des lots
20 à 22 y répondent encore 404.

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend** (tests autonomes, avec Mongo, R2 et IA simulés — tu ne les lances pas)
- `backend/tests/test_gestion_stocks_lot23.py`
- `backend/tests/test_messaging_center_lot23.py`
- `backend/tests/test_liluvine_kb_audience_lot23.py`

**Fichiers backend modifiés**
- `backend/routes/gestion_stocks.py` — suppression d'un fichier, création de dossier, renommage de tag, indexation du texte (4 nouvelles routes)
- `backend/routes/gestion_stocks_tags.py` — extraction du texte intégral (PDF, Word, Excel, PowerPoint, txt, csv), extraits de recherche, renommage de tag, nom de dossier
- `backend/server.py` — Centre de Messagerie : compteur de non-lus unique, rapprochement par numéro, « dernière interaction », conversation (les 1000 messages les plus récents)
- `backend/routes/liluvine_kb.py` — public visé par une entrée de la base de connaissance
- `backend/routes/liluvine_wa_autoreply.py` — un prospect reçoit la base de connaissance « prospects »
- `backend/tests/test_liluvine_wa_prospects_lot21.py` — adapté au paramètre `audience`

**Fichiers frontend modifiés**
- `frontend/src/pages/portal/GestionStocks.jsx` — « Nouveau dossier », « Gérer les tags », « Indexer le contenu des fichiers existants »
- `frontend/src/components/R2FileTags.jsx` — bouton de suppression, extrait du texte trouvé
- `frontend/src/pages/portal/Contacts.jsx` — date de dernière interaction, liste et conversation actualisées automatiquement, coller depuis le presse-papiers, bouton « Prospect »
- `frontend/src/components/PortalLayout.jsx` — badge du Centre de Messagerie = même nombre que la cloche
- `frontend/src/hooks/useWhatsAppNotifier.js` — recompte immédiat après lecture ; correctif du bouton « notifications bureau »
- `frontend/src/pages/portal/UnifiedInbox.jsx` — prévient le badge après lecture
- `frontend/src/pages/admin/sections/LiluvineKnowledgeBaseSection.jsx` — choix du public (tous / clients / prospects)

**Côté livraison**
- Aucune nouvelle dépendance. Le texte des PDF est lu avec PyMuPDF, déjà
  installé ; celui de Word, Excel et PowerPoint avec la bibliothèque
  standard de Python.
- Aucune migration. Les entrées existantes de la base de connaissance sans
  `audience` valent « tous ».

**Nouveaux champs Mongo**
- `stock_files.content_text`, `text_indexed_at` et `ai_text` (texte cherchable).
- `liluvine_knowledge.audience` (`all`, `clients` ou `prospects`).

## Variables d'environnement

Aucune nouvelle variable, et aucun paramètre à renseigner en base.

## Ce que ça apporte, dans l'ordre

### Explorateur Stockage R2

1. **Supprimer un fichier depuis l'écran.** Une corbeille apparaît sur chaque
   ligne quand le serveur l'autorise (`can_delete`), avec la même règle que
   pour les tags :
   - l'admin et le superviseur suppriment tout ;
   - un Pharmacien suivi autorisé à déposer supprime seulement ses propres
     fichiers.

   Une confirmation est demandée. La route est
   `DELETE /gestion-stocks/files?key=…` : 403 hors droits ou hors du tenant,
   404 si le fichier n'existe pas. La fiche `stock_files` est supprimée
   avec le fichier, et la jauge se met à jour.

2. **Créer un dossier depuis la page.** Le bouton « Nouveau dossier »
   au-dessus de la grille est proposé à l'administration et aux comptes
   autorisés à déposer (`POST /gestion-stocks/folders`). Il crée le marqueur
   vide `<code>/<nom>/` dans R2, comme Cloudflare.
   - Nom : lettres, chiffres, espaces, `- _ . ( )`, 60 caractères au plus.
   - Refusé : un doublon, un dossier standard, un nom avec « / » ou
     commençant par un point.
   - Pour l'administration, le code client doit correspondre à un vrai client.

   La légende des couleurs est mise à jour : un dossier bleu a été créé avec
   « Nouveau dossier » ou depuis Cloudflare.

3. **Renommer, fusionner ou retirer un tag pour tout un client.** Sous la
   recherche, l'administration dispose de « Gérer les tags » : on choisit un
   tag, on tape le nouveau nom, puis « Appliquer »
   (`PUT /gestion-stocks/tags/rename`, réservé à l'admin et au superviseur).
   - Si le nouveau nom existe déjà, les deux tags sont fusionnés, sans
     doublon sur un même fichier.
   - Un nouveau nom vide retire le tag de tous les fichiers.
   - La réponse renvoie le nombre de fichiers modifiés et la nouvelle liste
     des tags.

4. **Rechercher dans le texte des documents.** La barre de recherche cherche
   aussi dans le contenu, sans tenir compte des accents ni des majuscules.
   Quand un fichier est trouvé grâce à son contenu, l'extrait correspondant
   s'affiche en dessous, par exemple « … 12 boîtes de DOLIPRANE 1000 lot
   45871 … ».
   - **Au dépôt**, le texte est extrait tout de suite, sans IA et sans coût :
     PDF avec couche texte, Word, Excel, PowerPoint, .txt, .csv, jusqu'à
     15 Mo et 20 000 caractères.
   - **Pour un scan ou une photo**, c'est le texte lu par l'IA (synthèse et
     champs) qui devient cherchable, si l'option « Suggestions de tags par
     l'IA » du lot 22 est activée.
   - **Pour les fichiers déjà présents**, le texte est extrait en arrière-plan
     à l'ouverture de leur dossier (20 fichiers par ouverture). Le bouton
     « Indexer le contenu des fichiers existants » (administration,
     `POST /gestion-stocks/reindex`) traite d'un coup tous les fichiers du
     client.

### Liluvine (prospects WhatsApp)

5. **Bouton « Prospect » sur chaque contact.** Dans le Centre de Messagerie,
   un bouton violet en tête des actions pose ou retire l'étiquette
   `prospect`. Ce contact reçoit alors les réponses de Liluvine avec le
   prompt et la base de connaissance des prospects (lot 21). L'étiquette
   « prospect » s'affiche en violet sous le nom.

6. **Base de connaissance par public.** Dans Paramètres → « Liluvine PRO —
   Base de connaissance », chaque entrée a un « Public visé », et chaque
   entrée affiche une pastille avec son public :
   - « Tous » : valeur par défaut, et valeur des entrées existantes ;
   - « Clients seulement » ;
   - « Prospects seulement ».

   Un sélecteur « Import : … » fixe le public des PDF, TXT et captures
   importés. Côté serveur, `build_kb_context(audience=…)` :
   - **un prospect WhatsApp** ne reçoit que « Tous » et « Prospects
     seulement », et pas la recherche sémantique Qdrant, dont les
     collections peuvent contenir des documents internes ;
   - **les clients, le chat interne et les SMS** ne reçoivent jamais les
     entrées « Prospects seulement ».

   Le cache du contexte est séparé par public.

### Centre de Messagerie

7. **Un seul compteur de non-lus.** La bulle de la sidebar, la cloche et les
   pastilles des contacts ne disaient pas la même chose. Il y avait trois
   calculs, sur trois périmètres :
   - un seul `client_id` pour le badge ;
   - tous les tenants pour l'admin ;
   - des messages d'expéditeurs inconnus qu'aucune conversation ne permettait
     de marquer comme lus.

   Désormais :
   - une seule fonction, `_wa_unread_summary`, sert
     `/me/notifications/counts` (`contacts_unread`) et `/me/whatsapp/unread`,
     sur le périmètre visible de l'utilisateur, admin compris ;
   - elle ne compte que les messages rattachés à un contact visible, donc
     qu'on peut ouvrir et marquer comme lus ;
   - les messages d'inconnus sont renvoyés à part (`unknown`) : ils restent
     dans l'Inbox unifiée.

   Côté écran, la bulle de la sidebar affiche le même nombre que la cloche,
   relu toutes les 15 s, au lieu d'un second compteur relu toutes les 90 s.
   Ouvrir une conversation (Centre de Messagerie ou Inbox unifiée) déclenche
   un recompte immédiat.

8. **Messages reconnus par numéro.** Un contact enregistré sans indicatif
   (« 70 11 11 11 ») ne retrouvait pas les messages reçus de
   « 22670111111 ». Le rapprochement se fait maintenant sur les 8 derniers
   chiffres du numéro, et partout de la même façon : comptage, « marquer comme
   lu » et affichage de la conversation.

9. **Tri par « dernière action » fiable, avec la date.** Certains contacts
   restaient en tête alors qu'ils n'avaient pas écrit depuis longtemps. Le
   calcul :
   - parcourait les messages de **tous** les tenants ;
   - comptait les **envois en masse** (campagnes WhatsApp/SMS) ;
   - mélangeait l'horodatage Meta (secondes Unix) avec des dates ISO.

   Il ne prend plus que les messages de ce tenant, hors envois en masse
   (`bulk`), sur la date `created_at` posée par Sawali, et renvoie le sens du
   dernier échange (`last_interaction_direction` : `in` ou `out`).

   Sous chaque nom s'affichent la date et l'heure du dernier échange
   (« Aujourd'hui 14:32 », « Hier 09:10 », « 12/09/2026 16:05 »), avec une
   flèche verte (reçu) ou bleue (envoyé), ou « Aucun échange ». La liste est
   relue en silence dès qu'un nouveau message arrive (le contact remonte en
   tête), toutes les 2 minutes, et à la fermeture d'une conversation.

10. **Conversation ouverte actualisée automatiquement.** La fenêtre de
    conversation relit les messages toutes les 8 s quand l'onglet est
    visible, sans clignoter. Un message reçu pendant qu'elle est ouverte
    s'affiche tout seul et est marqué comme lu. Si l'on est remonté lire
    l'historique, on n'est pas ramené en bas : un bouton « Nouveau message »
    apparaît. La route renvoie maintenant les 1000 messages **les plus
    récents** (avant : les 1000 plus anciens, si bien que les nouveaux
    manquaient dans une longue conversation).

11. **Coller depuis le presse-papiers.** Dans la zone de saisie, Ctrl+V
    d'une image (une capture d'écran, par exemple) la joint au message avec
    un aperçu, comme le trombone. Elle part par
    `/me/whatsapp/send-media`, déjà existant, avec la saisie comme légende.
    Un nouveau bouton « Coller » lit le presse-papiers : l'image en priorité,
    sinon le texte, ajouté à la saisie. Si le navigateur refuse l'accès, un
    message invite à utiliser Ctrl+V.

12. **Correctif.** Le bouton d'activation des notifications bureau (cloche)
    mettait une Promise dans son état : il est corrigé.

## Volontairement pas dans ce lot

- **Déplacer ou renommer un fichier ou un dossier R2**, et **supprimer un
  dossier entier** : pas demandés.
- **Temps réel par websocket** pour les messages WhatsApp : l'actualisation
  toutes les 8 s (conversation) et 15 s (compteurs) suffit pour l'usage, sans
  toucher au webhook.
- **Messages d'expéditeurs inconnus** : ils ne gonflent plus le badge du
  Centre de Messagerie et restent consultables dans l'Inbox unifiée et
  « Imports WA en attente ».
- **Accès du superviseur aux écrans admin** : abandonné, à ma demande.

## À tester une fois déployé

**Explorateur R2** (Pharmacien suivi du client WDD autorisé à déposer, puis admin)

1. Clique sur « Nouveau dossier », tape « Bons de commande », puis « Créer » :
   une tuile bleue apparaît, et le dossier existe dans Cloudflare.
2. Dépose un fichier dans ce dossier : sa ligne a une corbeille. Supprime-le
   après confirmation : il disparaît et la jauge baisse. Sur
   `INV DEC 2024 - WDD.pdf`, pas de corbeille pour le Pharmacien suivi ; il y
   en a une pour l'admin.
3. Dépose un PDF texte ou un Word contenant un mot rare, puis cherche ce mot :
   le fichier apparaît avec l'extrait.
4. En admin, clique sur « Indexer le contenu des fichiers existants » : un
   message indique le nombre de fichiers en cours d'indexation. Une minute
   plus tard, un mot du texte d'un ancien PDF le retrouve.
5. En admin, ouvre « Gérer les tags », renomme un tag vers un tag existant,
   puis « Appliquer » : les deux sont fusionnés dans les pastilles.

**Liluvine**

6. Dans le Centre de Messagerie, clique sur « Prospect ? » d'un contact : le
   bouton devient violet « Prospect » et l'étiquette apparaît. Un message
   WhatsApp de ce contact reçoit une réponse de style prospect.
7. Paramètres → Base de connaissance : crée une entrée « Prospects
   seulement » (par exemple une offre de découverte) et une entrée « Clients
   seulement ». Un numéro inconnu qui demande l'offre en reçoit le contenu ;
   un client connu ne la reçoit pas, et le prospect ne reçoit jamais l'entrée
   « Clients seulement ».

**Centre de Messagerie**

8. Sans conversation ouverte, envoie un WhatsApp depuis un téléphone
   enregistré dans les contacts : en 15 s au plus, la bulle de la sidebar et
   la cloche affichent le même nombre, et le contact remonte en tête avec
   « Aujourd'hui HH:MM » et une flèche verte.
9. Ouvre sa conversation : la bulle retombe aussitôt. Envoie un autre message
   depuis le téléphone : il apparaît dans la fenêtre en moins de 10 s, sans
   cliquer sur Actualiser.
10. Fais une capture d'écran, puis Ctrl+V dans la zone de saisie : l'image
    est jointe avec un aperçu. Tape une légende, envoie : elle arrive sur le
    téléphone.
11. Vérifie qu'un contact qui n'a rien écrit depuis longtemps n'est plus en
    tête, même après une campagne WhatsApp ou SMS.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch en UN SEUL `git am` et
déploie, c'est tout.
