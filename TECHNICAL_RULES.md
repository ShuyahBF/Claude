# Règles techniques transverses

Règles à appliquer par défaut sur tout futur projet correspondant, sans
que l'utilisateur ait à les rappeler — indépendantes du site concerné.

## Synchronisation HFSQL (PCSOFT/WinDev) → MongoDB multi-tenant

**Contexte** : l'utilisateur gère des bases HFSQL (une base = une
pharmacie/officine, mono-tenant par nature — aucune des tables HFSQL ne
porte de notion de client/tenant). Quand ces données doivent alimenter une
plateforme SAAS multi-clients (ex : le module "Gestion Stocks" de
Site-SawaliSmartSystems), un outil externe synchronise les tables HFSQL
vers des collections MongoDB.

**Règle** (confirmée explicitement par l'utilisateur le 2026-09, à
appliquer sans redemander sur tout projet similaire) :

> L'outil de synchronisation AJOUTE une colonne d'identification du
> tenant sur CHAQUE document, dans CHAQUE collection/table synchronisée —
> cette colonne n'existe pas nativement côté HFSQL. Toute lecture côté
> plateforme (agrégations, listings, tableaux de bord) DOIT filtrer
> systématiquement sur cette colonne, résolue depuis la session de
> l'utilisateur connecté (jamais depuis un paramètre client librement
> modifiable par lui). Exemple : un utilisateur du tenant "PMT" ne doit
> jamais voir, dans aucune des tables synchronisées, une ligne dont la
> colonne tenant vaut autre chose que "PMT".

Points pratiques à vérifier à chaque nouveau projet de ce type :
- Nom exact de la colonne tenant (pas encore figé pour Sawali/Gestion
  Stocks — proposé par défaut : `client_code`, à aligner avec le
  développeur de l'outil de synchro).
- Les noms de collections/champs HFSQL sont en général conservés tels
  quels côté Mongo (français, avec espaces et accents) sauf décision
  contraire explicite — ne pas les renormaliser de son propre chef.
- Toujours écrire le contrôle d'accès comme pour du multi-tenant classique
  (résolution du tenant côté serveur, jamais confiance dans un paramètre
  client) — mêmes réflexes que pour un cloisonnement par `client_code` sur
  un stockage objet (S3/R2) : la même règle s'applique aux deux.

**Exemple d'implémentation** : `backend/routes/gestion_stocks.py` sur
`sawali-emergent` (branche `Site-SawaliSmartSystems`) — agrégations sur
les collections `Produit`, `AAcheté` (détail des ventes, malgré son nom),
`Vente`, `Inventory`/`DInventaire`, filtrées par `client_code`.

## Chargement des pages et gros calculs (règle 7, 15/10/2026 : « C'est une RÈGLE ! » — copie de CLAUDE.md des plateformes)
Constat e-Kol (lots 33 à 36) : le tableau de bord mettait 37 s en moyenne (jusqu'à 87 s) ; après correction, moins de 1 s.
Cette méthode s'applique à TOUTES les plateformes et à tout projet à venir, dès la première version.
- **Mesurer d'abord** : chaque appel au serveur note sa durée (journal des accès, route « Appels les plus lents » : moyenne,
  5 derniers, dernier, maximum). On corrige la route réellement lente, jamais au hasard. Tout nouveau projet prévoit cette mesure.
- **Jamais d'appel à un service externe lent ou limité DANS la requête d'une page** (géolocalisation d'IP, SMS, WhatsApp, API
  tierce, envoi d'e-mail…) : il part en ARRIÈRE-PLAN (`asyncio.create_task`, tâche planifiée), la page répond tout de suite avec
  la valeur connue ou « en cours d'identification », et le résultat est gardé en cache pour l'affichage suivant.
- **Jamais de boucle N+1** (une lecture de base PAR élève / client / ligne) : lire EN BLOC (une requête par collection, ou une
  agrégation) puis regrouper en mémoire.
- **Gros calculs** (statistiques, totaux, situations, tableaux de bord) : lectures indépendantes lancées EN PARALLÈLE
  (`asyncio.gather`) ; calcul lourd (> 1 s) = cache court (ex. 60 s) ou pré-calcul planifié, jamais refait à chaque clic.
- **Authentification et droits** : lire compte et droits en même temps, pas l'un après l'autre.
- **Index** sur tout filtre fréquent (école/site, type, date) : jamais de parcours complet d'une collection dans une requête de page.
- **Objectif** : toute route d'affichage répond en moins de 1 s côté serveur. Au-delà, on corrige AVANT de livrer ; un appel
  externe en arrière-plan reçoit un test qui prouve que la requête n'attend pas.
- **Écran** : afficher d'abord ce qui est prêt ; une section lente ne doit pas bloquer le reste de la page (chargement séparé).
