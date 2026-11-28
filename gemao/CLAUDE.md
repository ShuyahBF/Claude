# Règles permanentes du propriétaire (ShuyahBF) — GeMAO

Reconstituées le 28/11/2026 à partir des `CLAUDE.md` de ZandGo et d'ALBARKA (mêmes règles communes à tous les projets du propriétaire).
GeMAO = GMAO multi-clients (FastAPI + MongoDB + React) ; chaque client a son émetteur et sa clé HMAC SAWALI pour WhatsApp.

## Livraison
- Après chaque livraison : compte rendu par e-mail HTML à jfrancois.ouoba@gmail.com (outil Gmail, chargé avec ToolSearch), AUTOMATIQUE, sans exception de
  taille : date et heure, identification (dépôt, branche, commit, version, lot), périmètre, comment vérifier, à activer, points d'attention, reste à faire.
- Commits : auteur ET committer `ShuyahBF <jfrancois.ouoba@gmail.com>`, messages et commentaires en français, aucune mention d'IA ni de Co-Authored-By.
- Commentaires clairs sur chaque bloc de code (le propriétaire vient de WinDev). Jamais de secret dans le dépôt, un e-mail ou le chat : variables d'environnement.
- Outils de maintenance : INTERFACE GRAPHIQUE dans la plateforme (page Paramètres), jamais un script Python / PowerShell à manipuler (règle 9).

## Version et lot (règles 1 et 2) · Nouveautés (règle 5)
- `backend/lot.py` (LOT, VERSION `1.N`, LOT_LIBELLE) : à mettre à jour à CHAQUE déploiement ; exposé par `/api/version`.
- Affichage : connexion et portail « Version X · déployée le JJ/MM/AAAA HH:MM » ; Paramètres « Version X · Lot N · commit · déployée le … ».
- Chaque lot ajoute sa carte dans `backend/nouveautes.py` (même numéro que `lot.py`) qui ouvre la rubrique des Paramètres où se règle la nouveauté
  (test `tests/test_regles.py::test_regle_nouveautes_le_lot_courant_a_sa_carte`).

## Présence auprès de SAWALI (règle 4) · Performances (règle 7)
- `backend/presence_sawali.py` : POST `https://api.sawalismartsystems.com/api/presence-logiciel` au démarrage puis toutes les 5 min, en arrière-plan, sans secret.
- Chaque appel est mesuré (`backend/mesure.py`, rubrique « Performances » des Paramètres) ; objectif < 1 s par route.
- Jamais d'appel externe (WhatsApp, SMS, e-mail…) dans la requête d'une page : `whatsapp.en_arriere_plan` ; pas de boucle N+1 ; lectures en parallèle
  (`asyncio.gather`) ; index sur les filtres fréquents. Un test prouve que la requête n'attend pas SAWALI.

## WhatsApp via SAWALI (clés HMAC par client)
- Protocole « Transmission WA Universelle » (identique à ZandGo) : `POST LILUVINE_WA_URL`, corps `{"id","to","message","source"}`, en-têtes `X-Emetteur`,
  `X-Timestamp`, `X-Signature = HMAC-SHA256(clé, "<horodatage>.<corps brut>")` ; un nouvel essai (même id) sur erreur réseau ou 5xx, jamais sur 4xx.
- Une clé par client, montrée UNE seule fois, chiffrée en base (`CLE_MAITRE` à conserver). Webhook entrant vérifié (signature, horodatage, rejeu).

## Interface
- Tableaux (règles 3, 19, 24) : nombres à DROITE ; survol bleu clair `rgba(56,189,248,.16)` ; sélection `#f6a35b` + police `#0A1E3D` ; TOUTES les colonnes de
  données triables (▲ ▼ ⇅, vides en dernier) ; plus de 30 lignes = défilement avec en-tête fixe.
- Mots de passe, PIN, clés (règle 22) : pictogramme œil, un seul composant `ChampMotDePasse`. Captures d'écran découragées (`lib/securiteEcran.js`).
- Listes finies = listes déroulantes (règle 10) ; modales 28 rem / 36 rem, 85 % de hauteur (règle 11) ; menus « Majuscule À Chaque Mot » (règle 18, `titreMenu`).
- Pictogrammes sur toutes les actions (règle 15), enregistrement jamais deviné ; écrans colorés sobrement, jamais la couleur seule (règle 16).
- Bouton « Actualiser » avec toast « … en cours » puis résultat (règle 17) ; attente longue = « Patientez… » + jauge circulaire.
- Exemples d'identification locaux (règle 13) : « BADINI Awa », « awa.badini@gmail.com » (`lib/exemplesIdentite.js`).
- Page de connexion centrée avec logo, état du serveur et version.

## Dépôt
| Plateforme | Dépôt | Branche |
|---|---|---|
| GeMAO | `ShuyahBF/gemao` | `main` (Render y déploie) |
