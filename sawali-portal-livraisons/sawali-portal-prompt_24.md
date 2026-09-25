# Sawali — Lot 24 : Centre de Messagerie (non-lus, doublons, colonne), Liluvine (fil, diagnostic), fenêtres défilantes

Applique `sawali-portal-corrections_24_b98e5b1.patch` sur la branche
`conflict_230926_1008`. La base attendue est ton commit `a708771` (lot 23),
suivi de `4c23f4b Auto-generated changes`, qui ne touche que
`.emergent/emergent.yml` : le patch s'applique tel quel par-dessus. Ce patch
remplace `…_24_f4ddc14.patch`, que je ne t'ai jamais soumis. C'est un
`git format-patch` d'un seul commit : applique-le en UN SEUL `git am`, puis
redéploie (bouton Deploy compris).

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveaux fichiers backend** (tests autonomes, Mongo simulé — tu ne les lances pas)
- `backend/tests/test_messaging_center_lot24.py`
- `backend/tests/test_contacts_duplicates_lot24.py`
- `backend/tests/test_liluvine_thread_mirror_lot24.py`

**Fichiers backend modifiés**
- `backend/server.py` — non-lus limités à 30 jours, « Tout marquer comme lu », enregistrement idempotent des contacts inconnus, reconnaissance des numéros dans le webhook, outil « Doublons », journal des décisions de Liluvine
- `backend/routes/liluvine_wa_autoreply.py` — copie dans le fil des réponses aux annonces, corrections de commande et `!reactions`
- `backend/routes/liluvine_reactions.py` — ajout automatique d'un contact : retire son entrée « inconnu » et rattache ses messages
- `backend/routes/liluvine_pro.py` — route du journal des décisions
- `backend/tests/test_messaging_center_lot23.py` — adapté aux nouvelles fonctions

**Fichiers frontend modifiés**
- `frontend/src/pages/portal/Contacts.jsx` — colonne « Dernière interaction », « Tout marquer comme lu », fenêtre « Doublons », tag « Relayé », message « déjà présent »
- `frontend/src/pages/admin/sections/LiluvineWaAutoreplySection.jsx` — écran « Pourquoi Liluvine n'a pas répondu ? »
- `frontend/src/index.css` — fenêtres modales défilantes
- `frontend/src/components/ui/dialog.jsx` — boîtes de dialogue limitées à 90 % de la hauteur

**Côté livraison**
- Aucune nouvelle dépendance, aucune migration.
- Nouvelle collection **`liluvine_wa_autoreply_log`** : une ligne par
  message WhatsApp reçu. Elle se crée toute seule au premier message.

## Variables d'environnement

Aucune nouvelle variable, aucun paramètre à renseigner en base.

## Ce que ça apporte, dans l'ordre

### Centre de Messagerie

1. **Les anciens messages ne comptent plus comme non lus.** Après le lot 23,
   j'avais 47 anciens messages non lus. Ce sont des messages reçus
   autrefois et jamais marqués comme lus, parce qu'ils n'étaient rattachés à
   aucun contact ; le lot 23 les a rattachés. Désormais,
   `_wa_unread_summary` (badge, cloche, pastilles) ne compte que les non-lus
   **des 30 derniers jours** (`WA_UNREAD_MAX_AGE_DAYS`). Les plus anciens
   restent non lus en base et sont renvoyés à part (`older`).

2. **Bouton « Tout marquer comme lu ».** Il apparaît à côté des filtres dès
   qu'il reste des non-lus, et indique « (+47 anciens) » s'il y a de
   l'historique. Après confirmation, `POST /me/whatsapp/mark-all-read` marque
   comme lus tous les non-lus rattachés à un contact visible, quel que soit
   leur âge. Les expéditeurs inconnus ne sont pas touchés : ils restent dans
   l'Inbox unifiée.

3. **« Dernière interaction » en colonne.** Juste après « Nom » : date et
   heure du dernier échange, flèche verte (reçu) ou bleue (envoyé), ou
   « Aucun échange ». Sur mobile, l'information reste sous le nom.

4. **Plus de doublon quand on enregistre un contact inconnu.** Chaque contact
   enregistré depuis la liste des « contacts inconnus qui vous ont écrit »
   apparaissait en double. La cause : un inconnu qui écrit crée une entrée
   dans `wa_pending_imports`, puis l'option Liluvine « ajout automatique des
   nouveaux contacts » crée aussitôt son contact. « Enregistrer » en créait
   alors un second. Même chose pour un contact saisi sans indicatif
   (« 70 11 11 11 ») : le webhook ne le reconnaissait pas et le classait
   comme inconnu. Corrections :
   - **enregistrement idempotent**
     (`POST /me/wa-pending-imports/{id}/import`) : si le numéro existe déjà
     dans le carnet (8 derniers chiffres, toute mise en forme), aucun
     contact n'est créé, les messages sont rattachés au contact existant, la
     réponse contient `already_present: true`, et l'écran affiche « existe
     déjà : pas de doublon ». Les autres entrées du même numéro sont retirées ;
   - **liste nettoyée** (`GET /me/wa-pending-imports`) : un numéro déjà
     présent dans le carnet, ou en double dans la liste, n'est plus proposé,
     et son entrée est supprimée ;
   - **ajout automatique Liluvine** : après avoir créé le contact, il retire
     l'entrée « inconnu » du numéro et rattache ses messages ;
   - **webhook** : un contact saisi sans indicatif ou avec des espaces est
     reconnu sur ses 8 derniers chiffres (`_find_contact_by_phone`), donc
     n'est plus classé comme inconnu.

5. **Outil « Doublons », réservé au superviseur.** Un bouton « Doublons »
   dans l'en-tête du Centre de Messagerie (visible seulement pour le rôle
   `superviseur`) ouvre la liste des contacts qui partagent le même numéro
   (`GET /me/contacts-duplicates`).
   - Dans chaque groupe, la fiche **gardée** (en vert) est la plus complète :
     nombre d'informations renseignées (nom autre qu'un numéro, société,
     email, téléphone, WhatsApp, notes, photo, code, adresse, ville,
     étiquettes, groupes). À égalité, c'est la plus ancienne.
   - Les autres fiches, moins complètes ou plus récentes, sont **proposées
     et pré-cochées** « À SUPPRIMER ». Le superviseur décoche celles à
     conserver, puis « Supprimer les N sélectionné(s) » et confirme.
   - `POST /me/contacts-duplicates/delete` ne supprime **que** des fiches
     proposées comme doublons, jamais la fiche gardée d'un groupe. Avant de
     supprimer, il rattache leurs messages WhatsApp et SMS à la fiche
     gardée.
   - Les deux routes renvoient 403 à tout autre rôle, admin compris.

6. **Tag « Relayé » lisible.** Dans la conversation, le tag « Relayé » d'un
   message envoyé passe sur fond blanc, texte vert, avec un liseré vert.
   Avant, il était blanc translucide, donc invisible sur une bulle claire.

### Liluvine (auto-réponse WhatsApp)

7. **Toutes ses réponses apparaissent dans le fil.** Les réponses aux modèles
   d'annonce (publicités Facebook), les messages de correction de commande
   (« Vous vouliez dire !garde ? ») et `!reactions` partaient sur WhatsApp
   sans être enregistrés dans `whatsapp_messages`. Elles manquaient donc
   dans la conversation. Elles passent maintenant par `_send_mirrored`, qui
   enregistre la réponse dans le fil : `contact_id`, `phone_digits`,
   `auto_reply`, `ai_generated`, `command`.

8. **« Pourquoi Liluvine n'a pas répondu ? »** Le webhook enregistre, pour
   **chaque** message reçu, la décision de l'auto-réponse
   (`liluvine_wa_autoreply_log`) :
   - répondue ;
   - ou le motif du silence : anti-flood, aucun mot-clé, hors plage horaire,
     liste blanche, humain aux commandes, Liluvine PRO non activé, contrat,
     message non textuel (vocal, image), erreur de l'IA, échec d'envoi, etc.

   Dans Paramètres → « Liluvine PRO — Auto-réponse WhatsApp », le bouton
   « Pourquoi Liluvine n'a pas répondu ? » affiche la répartition sur
   7 jours et les 60 dernières décisions, avec leur motif en clair
   (`GET /admin/liluvine-pro/wa-autoreply/decisions`).

   Le **prompt système n'est jamais la cause d'un silence** : il ne règle que
   le contenu. Les silences viennent des réglages, le plus souvent de
   l'anti-flood : 60 s par défaut, donc un deuxième message envoyé moins de
   60 s après la réponse est ignoré. Ils viennent aussi des messages
   vocaux, qui ne reçoivent pas de réponse IA.

### Interface

9. **Les fenêtres trop hautes défilent.** « Nouvel utilisateur suivi »,
   « Nouveau contact » et les autres fenêtres modales sortaient de l'écran :
   le bouton Enregistrer devenait inaccessible. Deux corrections :
   - une règle globale dans `index.css` couvre toutes les fenêtres
     « maison » (voile `fixed inset-0 flex items-center justify-center`) :
     le panneau est limité à la hauteur de l'écran et défile. Les panneaux
     qui gèrent déjà leur hauteur (`max-h-…`, `h-full`), comme la fenêtre de
     conversation, ne sont pas touchés ;
   - les boîtes de dialogue shadcn (`DialogContent`) sont limitées à 90 % de
     la hauteur et défilent.

## Volontairement pas dans ce lot

- **Fusion des informations** des doublons dans la fiche gardée (email,
  société…) : seuls les messages sont rattachés. Il suffit de décocher un
  doublon plus riche sur un point pour le garder.
- **Changer la valeur par défaut de l'anti-flood** (60 s) : c'est un réglage
  de l'écran. Je le baisserai moi-même si le journal montre que c'est la
  cause principale des silences.
- **Réponse IA aux messages vocaux** : la note vocale est transcrite ailleurs,
  mais l'auto-réponse ne la traite pas.

## À tester une fois déployé

1. **Centre de Messagerie** : la colonne « Dernière interaction » figure
   après « Nom ». Les 47 anciens non-lus ne sont plus comptés. « Tout
   marquer comme lu (+47 anciens) », puis confirmer : le bouton disparaît.
2. Un **numéro inconnu** écrit au WhatsApp SAWALI, puis tu cliques sur
   « Enregistrer » dans la liste des contacts inconnus : une seule fiche est
   créée. Clique une seconde fois, ou utilise un contact déjà ajouté par
   Liluvine : le message « existe déjà : pas de doublon » s'affiche.
3. En **superviseur**, clique sur « Doublons » : les groupes s'affichent avec
   la fiche gardée en vert et les doublons cochés. Décoche-en un, supprime
   les autres : ils disparaissent, et leurs messages sont dans la fiche
   gardée. En **admin**, le bouton n'apparaît pas.
4. Dans une conversation contenant un message relayé, le tag « Relayé » est
   lisible (fond blanc, texte vert).
5. Paramètres → Auto-réponse WhatsApp → **« Pourquoi Liluvine n'a pas
   répondu ? »** : après quelques messages reçus, chaque message a sa ligne
   (« Répondu », « Anti-flood… », « Message non textuel… »).
6. Un message qui déclenche un modèle d'annonce : la réponse de Liluvine
   apparaît dans la conversation du contact.
7. **Admin → Utilisateurs suivis → Nouvel utilisateur suivi**, sur un écran
   peu haut : la fenêtre défile jusqu'au bouton « Enregistrer ». Idem pour
   « Nouveau contact ».

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch en UN SEUL `git am` et
déploie, c'est tout.
