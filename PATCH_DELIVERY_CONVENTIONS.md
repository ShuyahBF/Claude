# Conventions de livraison — patch + prompt pour Emergent

Note technique à appliquer par défaut sur toute implémentation ou
correction future livrée sous forme de patch + prompt à soumettre à
Emergent (sawali-emergent ou tout projet similaire) — sans que l'utilisateur
ait à redemander ces règles.

## 1. Avant toute nouvelle implémentation

Vérifier l'état du dépôt (`git status`, `git fetch` + comparaison avec
`origin/<branche>`) pour savoir ce qui est déjà déployé/poussé avant de
commencer un nouveau travail. Ne jamais supposer l'état du dépôt à partir
de la seule mémoire de la conversation.

## 2. Une seule soumission tant que rien n'est confirmé publié

Tant que l'utilisateur n'a pas dit explicitement que le dernier patch +
prompt envoyés ont été publiés/appliqués côté Emergent, TOUT nouveau
travail (implémentation, correction, ajustement) doit être fusionné dans
UNE SEULE soumission qui remplace entièrement la précédente — jamais de
livraisons séparées qui s'accumulent. Le patch et le prompt envoyés à un
instant T sont donc toujours le reflet de la totalité du travail non
confirmé depuis la dernière base confirmée.

## 3. Nommage des fichiers

Suivre la numérotation de "lot" déjà en cours pour le projet (pas de
hash de commit dans le nom du prompt, un seul hash court — celui du
dernier commit du patch squashé — dans le nom du patch) :

- Patch : `sawali-portal-corrections_<lotDébut>_to_<lotFin>_<hashCourt>.patch`
  (ou juste `_<lotN>_<hashCourt>.patch` si un seul lot).
- Prompt : `sawali-portal-prompt_<lotDébut>_to_<lotFin>.md`
  (ou `_<lotN>.md` si un seul lot).

Un lot correspond à un ensemble cohérent de demandes traitées ensemble
(pas nécessairement 1 lot = 1 commit brut de dev) — une correction faite
avant que le lot précédent soit confirmé publié reste DANS ce même lot
(éventuellement suffixée, ex. "11b" dans un exemple déjà vu), elle
n'incrémente pas le numéro.

## 4. Format du patch

Un vrai `git format-patch` (série mbox, appliquable en UN SEUL `git am`),
jamais un simple `git diff`. Si l'historique de dev réel contient plusieurs
commits par lot (corrections, itérations), les SQUASHER en un seul commit
propre par lot avant de générer le patch — jamais exposer l'historique brut
de mes propres allers-retours/erreurs de développement.

Procédure sûre (ne jamais réécrire l'historique réel déjà poussé) :
1. Créer un worktree temporaire détaché à la dernière base confirmée.
2. Appliquer les diffs par lot (`git diff <finLotPrécédent>..<finLotN>`) et
   committer chacun avec un message rédigé (voir §6) — un commit par lot.
3. Générer `git format-patch <base>..HEAD --stdout` sur ce worktree.
4. Vérifier que le patch s'applique proprement (`git am` sur un checkout
   propre de la base) ET que l'arbre résultant est identique octet pour
   octet à la vraie branche poussée (`git diff <têteRéelle> <têteWorktree>`
   doit être vide).
5. Supprimer le(s) worktree(s) temporaire(s) — ne jamais pousser cette
   réécriture, elle n'existe que pour produire le fichier de livraison.

## 5. Contenu du prompt.md

Structure à reprendre systématiquement :

1. **Intro** : quel patch appliquer, sur quelle branche, quelle base
   attendue (dernier commit confirmé), un seul `git am`.
2. **Interdiction explicite, toujours présente** : aucune commande de
   test/build/lint, pas de ré-analyse du code, **et surtout AUCUN Testing
   Agent / agent évaluateur / analyseur automatique** — appliquer et
   déployer directement. Rappeler cette interdiction une seconde fois en
   fin de fichier.
3. **Fichiers touchés (cumulé)** — groupés : nouveaux fichiers backend,
   nouveaux fichiers frontend, fichiers modifiés.
4. **Variables d'environnement requises** — distinguer nouvelles
   variables à configurer, variables déjà présentes réutilisées telles
   quelles, et paramètres stockés en base (AdminSettings) qui ne sont PAS
   des variables d'environnement.
5. **Ce que ça apporte, dans l'ordre** — narré lot par lot, avec la
   justification technique (cause racine, preuve/évidence trouvée dans le
   code ou les données réelles, fichier/fonction précis), pas juste une
   liste de features.
6. **Volontairement pas dans ce lot** — lister explicitement ce qui a été
   sciemment laissé de côté et pourquoi.
7. **À tester une fois déployé** — script de test manuel numéroté, pour un
   humain, pas pour un agent automatique.
8. **Ligne de clôture** : invite à renvoyer le message d'erreur exact en
   cas de problème, en rappelant qu'aucun test/analyse automatique ne doit
   avoir lieu entre-temps.

## 6. Ton — règle la plus importante

**Ces fichiers sont rédigés à la première personne, comme si
l'utilisateur s'adressait lui-même et directement à l'agent Emergent.**
Je (Claude) ne dois jamais y apparaître comme narrateur qui rapporte ce
que l'utilisateur a dit ou décidé.

Concrètement :
- Jamais "l'utilisateur a dit/demandé/décidé..." → toujours parler à la
  première personne ("je veux...", "j'ai testé...", "je n'ai pas encore
  arrêté avec...").
- Jamais parler d'Emergent à la troisième personne ("appliqué par
  Emergent...") → s'adresser directement à lui ("tu as déjà appliqué...").
- Un tiers externe (ex. le développeur d'un outil de synchro) reste
  nommé, mais la phrase doit rester au "je"/"j'ai" de l'utilisateur, jamais
  formulée comme un compte-rendu détaché à la troisième personne.
- Les seules mentions de "Claude" tolérées sont des détails techniques
  factuels sur l'architecture du système livré (ex : "l'app appelle
  Claude via `EMERGENT_LLM_KEY`") — jamais une attribution du travail de
  rédaction ou de préparation du patch lui-même.

## 7. Après chaque implémentation : résumé + où cliquer + recette

Demandé explicitement par l'utilisateur (2026-09-26, Albarka lot 3). Après
chaque nouvelle implémentation livrée (dans ma réponse, en français, en plus
du patch + prompt), toujours donner :

1. **Le résumé** des modules ajoutés ou modifiés, module par module : ce que
   ça fait, qui y a accès, ce qui change pour l'utilisateur.
2. **Le lien de la sidebar** où cliquer pour chaque module (nom exact du menu
   et chemin, ex. « Cabinet → Formulaires (`/admin/forms`) »), côté
   personnel et côté client.
3. **La recette des lots concernés** : pour chaque module, qui se connecte
   (quel compte de test), comment faire (étapes), et ce qu'il faut vérifier.
   Commencer par les comptes à préparer, finir par la non-régression et
   « si quelque chose ne marche pas ». Proposer ensuite la checklist à cocher
   partagée (Artifact avec `db`), comme pour le lot 3 Albarka.

## Origine de ces règles

Établies le 2026-09 sur `Site-SawaliSmartSystems` (sawali-emergent),
lots 16 à 18 (ordonnance PDF, Liluvine Contrat & Accès, Gestion de
Stocks), à partir d'un exemple fourni par l'utilisateur
(`sawali-portal-prompt_9_to_11.md` / `sawali-portal-corrections_9_to_11b_*.patch`)
et de corrections successives sur le ton et le contenu.
