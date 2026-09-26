# Sawali — Lot 26 : le serveur ne se fige plus (erreurs Cloudflare aléatoires) + valeurs des modèles WhatsApp

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `sawali-portal-corrections_26_6bf4403.patch` sur la branche
`conflict_230926_1008`. Base attendue : ton commit `793ef31` (« Auto-generated
changes », juste après `bcb1032`, le lot 25 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit : applique-le en UN SEUL `git am`, puis redéploie (backend et frontend,
bouton Deploy compris) et enregistre sur GitHub (« Save to GitHub »).

## Le problème corrigé

Les utilisateurs reçoivent au hasard, sur n'importe quelle page (connexion
comprise), le message « The origin web server sent a response that Cloudflare
could not parse… », et doivent recharger la page.

Mesure faite en production : SAWALI a cessé de répondre à tout le monde
pendant environ 35 secondes, puis il est reparti.

La cause principale est `backend/storage.py`. Les appels au stockage
Emergent y sont **synchrones** (jusqu'à 30 s pour obtenir la clé, 120 s pour
un envoi, 60 s pour une lecture) et sont appelés directement dans des routes
`async`. Pendant ce temps, tout le serveur est bloqué pour tous les
utilisateurs. Il suffit par exemple :
- d'une image à relire depuis le stockage (après chaque redéploiement) ;
- d'une photo WhatsApp reçue d'un client ;
- d'un fichier envoyé par un collègue.

## Fichiers touchés

**Nouveau fichier backend** (test autonome, aucun réseau — tu ne le lances pas)
- `backend/tests/test_nonblocking_lot26.py`

**Backend modifié**
- `backend/storage.py` :
  - `storage_available()` ne fait plus d'appel réseau : l'initialisation
    part en arrière-plan ;
  - nouvelles versions asynchrones `astorage_available`, `aupload_bytes`,
    `afetch_bytes`, `asave_upload_and_cache`, `arehydrate_from_storage`, qui
    travaillent dans un thread ;
  - un objet absent n'est pas redemandé pendant 10 minutes.
- `backend/server.py` :
  - toutes les routes d'envoi et de lecture de fichiers utilisent les
    versions asynchrones ;
  - l'empreinte du code de `/api/version` est calculée une seule fois
    (avant : lecture d'environ 1,5 Mo de fichiers et commande `git` à chaque
    ouverture de page) ;
  - l'en-tête `Content-Disposition` est sûr pour tous les noms de fichiers.
- `backend/routes/internal_chat.py` :
  - la boucle du canal temps réel (`/api/ws/chat`) s'arrête quand la
    connexion est fermée ; avant, elle pouvait tourner sans fin et figer
    tout le serveur ;
  - l'envoi et la lecture des photos du chat utilisent aussi les versions
    asynchrones.
- `backend/routes/whatsapp_helpers.py` :
  - les médias WhatsApp reçus sont enregistrés sans bloquer le serveur ;
  - les **valeurs des modèles WhatsApp sont nettoyées** avant l'envoi à Meta.
- `backend/google_calendar.py`, `backend/routes/google_calendar_watch.py` :
  appels Google Agenda dans un thread (page publique de rendez-vous, synchro).
- `backend/routes/qdrant_rag.py`, `backend/routes/vidal_rag.py` : calcul des
  vecteurs et appels Qdrant dans un thread (Liluvine, réponse automatique
  WhatsApp, recherche VIDAL).
- `backend/routes/auth.py` : vérification du mot de passe (bcrypt) dans un thread.
- `backend/routes/weather.py` : Open-Meteo injoignable, la réponse est
  « indisponible » (200) au lieu d'une erreur 502, mémorisée 5 minutes.
- `backend/routes/tenant_kyc.py`, `ai_media.py`, `story_studio.py`,
  `wa_notification_sound.py` : envois de fichiers dans un thread.

**Frontend modifié**
- `frontend/src/components/WeatherWidget.jsx` : widget masqué quand la météo est indisponible
- `frontend/src/pages/admin/sections/WeatherWidgetSection.jsx` : message clair dans l'aperçu

Aucune dépendance nouvelle, aucune variable d'environnement nouvelle, aucune
donnée modifiée.

## Ce que ça apporte

1. **Plus de coupures aléatoires.** Le serveur continue de répondre à tout le
   monde pendant qu'un fichier est envoyé ou relu, qu'une photo WhatsApp
   arrive, que Liluvine cherche dans sa base de connaissances ou qu'un
   rendez-vous est vérifié dans Google Agenda.
2. **Relais de messages WhatsApp fiables** (erreur Meta #132018 « Param text
   cannot have new-line/tab characters or more than 4 consecutive spaces ») :
   - les valeurs des modèles sont nettoyées avant l'envoi ;
   - un retour à la ligne devient « · » ; par exemple « …Deli GROCERY ·
     Notre machine nous a lâché hier… » ;
   - tabulations et suites d'espaces sont réduites ;
   - une valeur vide devient « — » (sinon erreur #131008) ;
   - cela vaut pour tous les modèles envoyés par le portail : relais,
     automations, notes, reçus.
3. **Météo** : quand le service météo gratuit ne répond pas, le widget se
   masque au lieu de provoquer une erreur 502.
4. **Téléchargement** des fichiers dont le nom contient ’, œ, €, un emoji ou
   de l'arabe : plus d'erreur 500.

## Si tu peux, en plus (réglage du serveur, pas dans le patch)

Si le backend est lancé par `uvicorn` avec la durée de connexion par défaut
(`--timeout-keep-alive 5`), passe-la à **75** secondes, par exemple
`uvicorn server:app --host 0.0.0.0 --port 8001 --timeout-keep-alive 75`.
Cela évite qu'une connexion réutilisée par le relais soit fermée juste avant
une requête. Si tu ne peux pas modifier la commande de démarrage, ignore ce
point.

## À tester une fois déployé

1. Utilise le portail normalement pendant une heure (Centre de messagerie,
   Contacts, images, envoi d'une photo dans le chat interne) : le message
   Cloudflare « could not parse » ne doit plus apparaître.
2. Déconnecte-toi et reste sur la page de connexion quelques minutes, puis
   connecte-toi : aucune erreur.
3. Fais écrire à un client, sur WhatsApp, un message **sur deux lignes** qui
   déclenche le relais « Relai NOUVEAU message WhatsApp reçu par Liluvine » :
   l'admin reçoit le relais, avec « · » à la place du retour à la ligne, et
   il n'y a plus d'alerte « n'a pas pu envoyer le WhatsApp attendu ».
4. Télécharge un fichier dont le nom contient une apostrophe typographique
   (’) : le téléchargement fonctionne.
5. Paramètres → Widget météo → Aperçu : si Open-Meteo est injoignable, le
   message l'indique clairement, sinon la météo s'affiche.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **AUCUN test, build, lint, Testing Agent ou
analyse automatique**. Applique le patch en UN SEUL `git am` et déploie,
c'est tout.
