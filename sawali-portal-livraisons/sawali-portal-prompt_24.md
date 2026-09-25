# Sawali — Lot 24 : anciens messages non lus, « Tout marquer comme lu », colonne « Dernière interaction »

Applique `sawali-portal-corrections_24_f4ddc14.patch` sur la branche
`conflict_230926_1008`. La base attendue est ton commit `a708771` (lot 23),
suivi de `4c23f4b Auto-generated changes`, qui ne touche que
`.emergent/emergent.yml` : le patch s'applique tel quel par-dessus. C'est un
`git format-patch` d'un seul commit : applique-le en UN SEUL `git am`, puis
redéploie (bouton Deploy compris).

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

## Fichiers touchés

**Nouveau fichier backend**
- `backend/tests/test_messaging_center_lot24.py` — tests autonomes (Mongo simulé). Tu ne les lances pas.

**Fichiers modifiés**
- `backend/server.py` — non-lus limités aux 30 derniers jours, nouvelle route `POST /me/whatsapp/mark-all-read`
- `backend/tests/test_messaging_center_lot23.py` — adapté aux nouvelles fonctions
- `frontend/src/pages/portal/Contacts.jsx` — colonne « Dernière interaction », bouton « Tout marquer comme lu »

Aucune nouvelle dépendance, aucune migration de données : aucun message
n'est modifié en base tant que je ne clique pas sur « Tout marquer comme lu ».

## Variables d'environnement

Aucune nouvelle variable, aucun paramètre à renseigner en base.

## Ce que ça apporte, dans l'ordre

1. **Les anciens messages ne comptent plus comme non lus.** Après le lot 23,
   mon Centre de Messagerie affichait 47 anciens messages non lus. Ce sont
   des messages reçus avant le lot 23 et jamais marqués comme lus : sans
   contact rattaché, ou d'un numéro enregistré sans indicatif, ils ne
   pouvaient pas l'être. Le lot 23 les rattache enfin à leur contact, et ils
   sont apparus d'un coup.

   `_wa_unread_summary` (qui sert le badge de la sidebar, la cloche et les
   pastilles des contacts) ne compte plus que les non-lus **des 30 derniers
   jours** (`WA_UNREAD_MAX_AGE_DAYS = 30`, sur `created_at`). Les non-lus
   plus anciens restent non lus en base : ils sont seulement renvoyés à part
   (`older`) avec `max_age_days`. `/me/notifications/counts` et
   `/me/whatsapp/unread` suivent automatiquement, puisqu'ils utilisent la
   même fonction.

2. **Bouton « Tout marquer comme lu ».** À côté des filtres (Tous / Partagés
   équipe / Privés / Non-lus), un bouton apparaît dès qu'il reste des
   non-lus, récents ou anciens. Il indique « (+47 anciens) » quand il y a de
   l'historique. Après confirmation, il appelle
   `POST /me/whatsapp/mark-all-read`, qui marque comme lus **tous** les
   messages non lus rattachés à un contact visible, quel que soit leur âge
   (`read_by_us_at`, `read_by_us_id`). La réponse renvoie le nombre de
   messages traités. Les messages d'expéditeurs inconnus ne sont pas
   touchés : ils se traitent dans l'Inbox unifiée. Le badge et la cloche
   recomptent aussitôt.

   Le rattachement d'un message à un contact est désormais écrit une seule
   fois (`_wa_visible_contact_index`, `_wa_attribute`), et partagé par le
   comptage et par ce bouton.

3. **« Dernière interaction » en colonne.** La date et l'heure du dernier
   échange (« Aujourd'hui 14:32 », « Hier 09:10 », « 12/09/2026 16:05 »),
   avec la flèche verte (reçu) ou bleue (envoyé), ou « Aucun échange »,
   deviennent une colonne du tableau, juste après « Nom ». Sur mobile, où la
   colonne est masquée, l'information reste affichée sous le nom.

## Volontairement pas dans ce lot

- **Durée de 30 jours réglable à l'écran** : pas nécessaire pour l'instant.
- **Marquer comme lus les messages d'expéditeurs inconnus** depuis le Centre
  de Messagerie : ils restent gérés dans l'Inbox unifiée.

## À tester une fois déployé

1. Ouvre le **Centre de Messagerie** : la colonne « Dernière interaction »
   figure après « Nom », avec les dates et les flèches.
2. La bulle de la sidebar et la cloche ne comptent plus les 47 anciens
   messages : seuls restent les non-lus des 30 derniers jours, 0 s'il n'y en
   a pas.
3. Le bouton « Tout marquer comme lu (+47 anciens) » est affiché. Clique
   dessus et confirme : un message indique le nombre traité, puis le bouton
   disparaît.
4. Envoie un WhatsApp depuis un contact : en 15 s au plus, la bulle affiche
   1 et le contact remonte en tête avec « Aujourd'hui HH:MM ».

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **aucun test, build, lint, Testing Agent ou
analyse automatique** entre-temps. Applique le patch en UN SEUL `git am` et
déploie, c'est tout.
