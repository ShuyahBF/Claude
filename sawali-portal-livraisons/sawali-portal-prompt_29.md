# Sawali — Lot 29 : Centre de Messagerie plus rapide + mesure des temps de réponse

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `sawali-portal-corrections_29_1ca6c11.patch` sur la branche
`conflict_230926_1008`. Base attendue : ton commit `ec599b9` (« Auto-generated
changes », juste après `db42025`, le lot 28 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit. Dans cet ordre :

1. vérifie que `git rev-parse --short HEAD` affiche `ec599b9` (sinon arrête-toi
   et renvoie-moi ce qu'il affiche) ;
2. applique le patch en UN SEUL `git am` (en cas d'échec : `git am --abort`,
   arrête-toi et renvoie-moi le message exact) ;
3. enregistre sur GitHub (« Save to GitHub ») ;
4. redéploie (backend et frontend, bouton Deploy compris) ;
5. contrôles immédiats (plus bas).

## Fichiers touchés

**Backend**
- `backend/server_parts/p11_whatsapp.py` : liste des contacts (dernière
  interaction calculée par MongoDB) ; numéros en attente d'import (carnet lu
  une seule fois).
- `backend/server_parts/p10_site_public_marketing.py` : périmètre visible d'un
  utilisateur mémorisé 60 secondes.
- `backend/server_parts/p17_demarrage_planificateur.py` : 4 index MongoDB
  créés **en arrière-plan** au démarrage (ne retardent pas le démarrage).
- `backend/server.py` : mesure du temps de réponse de chaque route, en mémoire.
- `backend/server_parts/p09_supervision_parametres.py` : route admin
  `GET /api/admin/perf/routes`.
- `backend/tests/test_perf_lot29.py` (nouveau, tu ne le lances pas).

**Frontend**
- `frontend/src/pages/portal/Contacts.jsx` et
  `frontend/src/hooks/useWhatsAppNotifier.js` : les compteurs de non-lus sont
  partagés entre la cloche et le Centre de Messagerie.
- `frontend/src/components/RoutePerfSection.jsx` (nouveau) et
  `frontend/src/pages/admin/AdminHealthDashboard.jsx` : tableau « Temps de
  réponse par route » dans Santé applicative.

Aucune dépendance nouvelle, aucune variable d'environnement nouvelle, aucune
donnée modifiée (seuls des index sont ajoutés).

## Ce que ça apporte

1. **Liste des contacts** : pour classer par dernière interaction, le serveur
   rapatriait jusqu'à 20 000 messages WhatsApp et 20 000 SMS et les parcourait
   un par un, à chaque ouverture, toutes les 2 minutes et à chaque nouveau
   message. MongoDB fait maintenant ce regroupement lui-même et ne renvoie
   qu'une ligne par numéro. Même résultat (vérifié par des tests d'équivalence).
2. **Numéros en attente d'import** (relus toutes les 15 s) : une recherche dans
   tout le carnet était lancée pour chacun des numéros en attente (jusqu'à 50).
   Le carnet est maintenant lu une seule fois. Même règle de correspondance
   (8 derniers chiffres, mise en forme ignorée).
3. **Périmètre visible** (utilisé par presque toutes les routes de la
   messagerie) : il demandait à chaque fois une recherche sur tous les
   utilisateurs ; il est mémorisé 60 secondes.
4. **Index MongoDB** adaptés aux requêtes les plus fréquentes (messages par
   client et par date, non-lus, numéros en attente).
5. **Moins d'appels** : la page ne redemande plus les non-lus que la cloche
   vient de relire (environ un tiers d'appels « non-lus » en moins).
6. **Mesure permanente** : Santé applicative affiche maintenant, pour chaque
   route, le nombre d'appels, la moyenne, le maximum et les appels de plus
   d'une seconde, depuis le dernier démarrage.

## Vérification immédiate après le déploiement

1. `https://sawalismartsystems.com/api/health` affiche `{"status":"ok"}`
   (l'adresse `/health` sans `/api` affiche la page du site : c'est normal).
2. Le Centre de Messagerie s'ouvre et affiche les contacts.
3. Les logs backend ne contiennent pas de trace d'erreur ; un message
   `[lot29] index … non créé` est sans gravité (il signale seulement qu'un
   index n'a pas pu être ajouté) — renvoie-le-moi s'il apparaît.

## Procédure de retour arrière (en cas d'erreur constatée)

1. `git revert --no-edit HEAD` (si un commit « Auto-generated changes » suit
   celui du lot 29 : `git log --oneline -3`, puis
   `git revert --no-edit <id du commit du lot 29>`).
2. Vérifie : `git diff ec599b9 --stat -- backend frontend` n'affiche rien.
3. « Save to GitHub », puis Deploy ; contrôle `/api/health`.
4. Renvoie-moi le message d'erreur exact.

Les index ajoutés restent en base après un retour arrière : ils sont sans
effet sur le fonctionnement (ils accélèrent seulement certaines lectures).

## À tester une fois déployé

1. Centre de Messagerie : la liste s'affiche, triée par dernière interaction
   comme avant ; les pastilles de non-lus et la cloche affichent le même nombre.
2. Un contact t'écrit sur WhatsApp : la pastille apparaît (15 s au plus) et le
   contact remonte en tête.
3. Un numéro inconnu t'écrit : il apparaît dans les numéros à importer ; un
   numéro déjà enregistré n'y apparaît pas.
4. Admin → Santé applicative : le tableau « Temps de réponse par route »
   s'affiche (filtre « contacts »).

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact.
Rappel : **AUCUN test, build, lint, Testing Agent ou analyse automatique**.
Applique le patch en UN SEUL `git am`, enregistre sur GitHub, puis déploie.
