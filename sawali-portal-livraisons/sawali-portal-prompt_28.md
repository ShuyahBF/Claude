# Sawali — Lot 28 : zone de saisie de la conversation en pleine largeur + découpage de server.py (sans changement de comportement)

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.
**Ne modifie, ne déplace et ne « corrige » aucun fichier du patch.**

Applique `sawali-portal-corrections_28_057b712.patch` sur la branche
`conflict_230926_1008`. Base attendue : ton commit `ce753a0` (« Auto-generated
changes », juste après `47e17b9`, le lot 27 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit. Il est volumineux (le contenu de `backend/server.py` est déplacé dans
un nouveau dossier) : c'est normal.

## Procédure, dans cet ordre

1. **Note le commit actuel** : `git rev-parse --short HEAD` doit afficher
   `ce753a0`. Si ce n'est pas le cas, arrête-toi et renvoie-moi ce qu'il affiche.
2. Applique le patch en UN SEUL `git am`. S'il échoue : `git am --abort`,
   arrête-toi et renvoie-moi le message exact (ne tente aucune résolution).
3. Vérifie que le dossier `backend/server_parts/` contient **20 fichiers
   `p01_…py` à `p20_…py` et un `README.md`**, et qu'ils sont bien suivis par git
   (`git ls-files backend/server_parts | wc -l` doit afficher **21**).
4. Enregistre sur GitHub (« Save to GitHub »).
5. Redéploie (backend et frontend, bouton Deploy compris).
6. Contrôles juste après le déploiement (voir « Vérification immédiate »).

## Fichiers touchés

**Backend — découpage physique de `backend/server.py`**
- `backend/server.py` : passe de 26 464 à environ 1 110 lignes. Il garde le
  début (imports, application FastAPI, aides communes) et le branchement final,
  et exécute à la place de chaque ancien bloc une ligne
  `_inclure_partie("pXX_….py")`.
- `backend/server_parts/` (nouveau dossier) : 20 fichiers thématiques
  (`p01_sante_auth_public.py` … `p20_branchement_routeurs.py`) + `README.md`.
  Chaque fichier est un morceau de l'ancien server.py **recopié à
  l'identique**, exécuté par server.py dans SON espace de noms : mêmes
  variables, même ordre d'exécution. Aucune ligne de logique n'est réécrite.
- `backend/server_parts/p06_medias_ia_version_cms.py` : seule modification
  hors copie — l'empreinte de déploiement (`/api/version`) inclut aussi les
  fichiers de `server_parts/`.
- Tests (tu ne les lances pas) : `backend/tests/_source_serveur.py`,
  `backend/tests/test_server_parts_lot28.py` (nouveaux) ; 5 tests existants
  adaptés pour lire la source recollée.

**Frontend**
- `frontend/src/pages/portal/Contacts.jsx` : fenêtre « Conversation » du
  Centre de Messagerie.

Aucune dépendance nouvelle, aucune variable d'environnement nouvelle, aucune
donnée modifiée. La commande de démarrage reste `uvicorn server:app`.

## Ce que ça apporte

1. **Zone de saisie en pleine largeur** : dans la fenêtre « Conversation »,
   les cinq boutons (joindre, partager, note vocale, presse-papiers, emojis)
   passent au-dessus de la zone de saisie, avec le compteur « x / 4096 » à
   droite. La zone de texte prend toute la largeur (3 lignes, agrandissable).
2. **server.py découpé en 20 fichiers thématiques** (WhatsApp, SMS,
   formulaires, paramètres, planificateur…) : plus facile à lire et à
   corriger, sans aucun changement de comportement. Vérifié avant livraison :
   - en recollant les 20 parties, on retrouve l'ancien server.py octet pour octet ;
   - mêmes 986 routes, même schéma OpenAPI, mêmes tâches de démarrage, mêmes
     middlewares, mêmes noms globaux ;
   - démarrage réel avec base simulée : réponses identiques ;
   - suite de tests complète : résultats identiques test par test.

## Vérification immédiate après le déploiement

1. `https://sawalismartsystems.com/health` affiche `{"status":"ok",…}`.
2. `https://sawalismartsystems.com/api/version` répond (le `deploy_seq`
   augmente de 1, c'est normal).
3. Les logs backend ne contiennent **ni `NameError`, ni `ImportError`, ni
   `server_parts`** dans une trace d'erreur.

Si l'un de ces trois points échoue : applique **tout de suite** la procédure
de retour arrière ci-dessous, puis renvoie-moi le message d'erreur exact
(logs backend).

## Procédure de retour arrière (en cas d'erreur constatée)

Le lot tient en un seul commit : on l'annule d'un bloc, sans rien réécrire.

1. Annule le commit du lot 28 :
   ```
   git revert --no-edit HEAD
   ```
   (HEAD est le commit du lot 28 ; s'il y a eu un commit « Auto-generated
   changes » après lui, annule le commit du lot 28 par son identifiant :
   `git log --oneline -3` pour le trouver, puis `git revert --no-edit <id>`.)
2. Vérifie : `git diff ce753a0 --stat -- backend frontend` ne doit rien
   afficher (le code est revenu exactement à l'état du lot 27).
3. Enregistre sur GitHub (« Save to GitHub »), puis redéploie (Deploy).
4. Contrôle : `/health` répond `ok`.
5. Renvoie-moi le message d'erreur exact : je corrige et je te redonne un lot.

Autre possibilité équivalente : le bouton de retour à un point de contrôle
(rollback) d'Emergent, en choisissant le point **juste avant** l'application
de ce patch, puis « Save to GitHub » et Deploy.

## À tester une fois déployé

1. Centre de Messagerie → conversation d'un contact qui t'a écrit il y a
   moins de 24 h : les boutons sont sur une ligne au-dessus de la zone de
   saisie ; la zone de texte occupe toute la largeur jusqu'au bouton
   « Envoyer ».
2. Écris un long message puis Ctrl+Entrée : il part.
3. Clique sur 😊 : l'emoji s'insère à la position du curseur.
4. Parcours rapide (le découpage ne doit rien changer) : connexion, Tableau
   de bord, Formulaires & Sondages, Caisse/Facturation, Paramètres (admin) —
   tout s'affiche comme avant.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **AUCUN test, build, lint, Testing Agent ou
analyse automatique**. Applique le patch en UN SEUL `git am`, enregistre sur
GitHub, puis déploie.
