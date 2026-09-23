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
