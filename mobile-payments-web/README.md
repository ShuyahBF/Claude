# auRor — version web

Version web de l'app Android **auRor** (`../mobile-payments-app`), avec la même
architecture qu'adLyn (`ShuyahBF/telecom-boutique`) :

| Partie | Technologie | Hébergement |
|---|---|---|
| API | Python 3.11, FastAPI, Motor (MongoDB) | Render (service web) |
| Site | React 19, Vite, Tailwind CSS | Render (site statique) |
| Base de données | MongoDB Atlas (collections préfixées `mpw_`) | Atlas |

**Une seule API pour tout le projet (lot 13)** : cette API FastAPI sert à la fois le site web et
l'**application Android** (`../mobile-payments-app/android`, routes publiques `/api/android/…`).
L'ancien serveur Node (`../mobile-payments-app/backend`) n'est plus déployé.

## Principe

L'utilisateur choisit un opérateur, un service (paiement marchand, facture, transfert, crédit…) et
saisit les valeurs demandées. Le serveur construit le **code USSD** à partir du gabarit du service
(ex. `*144*10*{code}*{amount}#` → `*144*10*445566*2500#`) après avoir vérifié chaque valeur.

Le site affiche alors :
- un **QR code** contenant le lien `tel:*144*10*445566*2500%23`. Scanné avec l'appareil photo du
  téléphone, il ouvre le composeur avec le code pré-rempli : il reste à appuyer sur **Appeler** et à
  valider avec le code secret Mobile Money, directement auprès de l'opérateur ;
- un bouton **Composer sur ce téléphone** (même lien, quand le site est ouvert sur le téléphone) ;
- le code en clair, avec un bouton pour le copier.

Le site ne connaît pas le résultat de l'opération : c'est le téléphone qui dialogue avec l'opérateur.
L'utilisateur indique « payé » ou « abandonné », et le paiement est rangé dans son **historique**.
Aucun code secret n'est jamais demandé ni transmis.

## Fonctions

- **Compte** : inscription avec nom, prénom, téléphone (obligatoire) et e-mail (facultatif).
  **Connexion par numéro de téléphone OU e-mail** + mot de passe.
  - Les numéros sont ramenés au format international. `70 00 00 00` devient `+22670000000` ;
    l'indicatif par défaut se règle avec `INDICATIF_DEFAUT`.
  - La session dure 30 jours, dans un cookie HttpOnly.
  - Le compte est bloqué 15 minutes après 10 échecs de connexion.
  - Un changement de mot de passe déconnecte les autres appareils.
- **Payer** : parcours opérateur → service → formulaire → code + QR, comme l'app Android.
  - Un code marchand inconnu reçoit un nom, enregistré dans l'**annuaire partagé**.
  - Les codes déjà connus sont proposés pendant la saisie.
- **Historique** : chaque paiement préparé, avec son statut. Le QR peut être réaffiché pour refaire le
  même paiement.
- **Marchands** : annuaire consultable et **QR marchand imprimable**.
  - Le QR marchand contient l'adresse du site avec l'opérateur, le service et le code marchand.
  - Le client le scanne avec son téléphone, se connecte, saisit le montant et compose.
  - Le site peut aussi lire ce QR avec la caméra (bouton « Scanner un QR marchand »).
- **Administration** (compte `ADMIN_EMAIL`) : catalogue des services USSD, avec aperçu du code et
  désactivation.
  - Le serveur refuse un gabarit mal formé et des champs qui ne correspondent pas à ses `{placeholders}`.
  - Au premier démarrage, le catalogue de l'app Android (Orange, Moov Africa, Telecel Faso) est inséré.
    ⚠️ Vérifier les codes auprès de chaque opérateur.

## Application Android (routes `/api/android/…`)

Routes **publiques** (sans compte), au format JSON exact de l'app (`Models.kt`, champs en camelCase),
limitées par adresse IP (`LIMITE_PUBLIQUE_PAR_MINUTE`, 60 écritures / 300 lectures par minute par défaut) :

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/api/android/operators` | `["Moov Africa", "Orange", …]` (opérateurs ayant un service actif) |
| GET | `/api/android/services?operator=Orange` | `[{_id, operator, country, name, category, ussdTemplate, fields[{key,label,type,isMerchantCode}], description}]` |
| GET | `/api/android/merchants/{operator}/{code}` | `{_id, code, operator, label}` ou 404 |
| POST | `/api/android/merchants` | `{code, operator, label}` → 201 `{_id, code, operator, label}` |
| POST | `/api/android/users` | `{nom, prenom, email?, telephone}` → 201 (profil créé ou mis à jour par téléphone) |

- Mêmes données que le site : le **catalogue** géré dans la page Administration et l'**annuaire partagé**
  des marchands. Un code créé dans l'app est visible sur le site, et inversement.
- Code marchand numérique (20 chiffres max.), opérateur du catalogue obligatoire ; un intitulé déjà
  enregistré n'est jamais écrasé ; les caractères non admis de l'intitulé sont retirés.
- Les profils de l'app sont rangés à part (`mpw_profils_android`) : ils ne créent pas de compte sur le site.

## Version, présence et alertes SAWALI

- **Version et lot** : source unique `frontend/src/version.js` (`VERSION` +1 à chaque déploiement,
  `LOT` = numéro de la PR fusionnée). Le commit et la date de compilation sont ajoutés par `vite.config.js`.
  - Page de connexion et pied de page des pages connectées : « Version X · déployée le JJ/MM/AAAA HH:MM ».
  - Page Administration : « Version X · Lot N · commit · déployée le … » (site et API).
  - `GET /api/version` → `{version, lot, commit, demarrage, libelle, libelle_detaille}` (l'API relit `version.js`).
- **Présence** : l'API envoie `POST https://api.sawalismartsystems.com/api/presence-logiciel`
  (application `paiement-mobile`) 10 s après le démarrage puis toutes les 5 minutes, en arrière-plan.
  `PRESENCE_SAWALI=0` la désactive. L'app Android envoie aussi sa présence (`paiement-mobile-android`)
  au lancement et au retour au premier plan (au plus toutes les 5 minutes).
- **Alerte WhatsApp de connexion** : à chaque connexion (ou inscription) réussie sur le site et à chaque
  enregistrement du profil par l'app Android, l'API envoie à SAWALI
  `POST /api/webhook/plateforme-connexion`, signé (`X-Emetteur`, `X-Timestamp`,
  `X-Signature` = HMAC-SHA256(`LILUVINE_WA_HMAC`, "<horodatage>.<corps brut>")).
  Les visiteurs non connectés sont signalés (type « visite ») au plus une fois toutes les 30 minutes par
  navigateur (`POST /api/presence/visite`). Sans `LILUVINE_WA_HMAC`, rien n'est envoyé ; un échec n'empêche
  jamais la connexion.

## Démarrer en local

```bash
# 1) API
cd backend
python -m venv .venv
.venv\Scripts\activate            # Linux/Mac : source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env            # Linux/Mac : cp .env.example .env
uvicorn server:app --reload       # http://localhost:8000/docs

# 2) Site (second terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

`MONGO_URL=mongomock://` (valeur de `.env.example`) utilise une base **en mémoire**, vidée à chaque arrêt.
Mettre l'adresse du cluster Atlas pour garder les données.

**Tests** : `cd backend && python -m pytest tests -q`. Ils couvrent :
- la construction des codes USSD et la normalisation des téléphones ;
- la connexion par téléphone et par e-mail, le blocage et la protection CSRF ;
- le parcours de paiement et le cloisonnement de l'historique entre utilisateurs ;
- l'annuaire des marchands et l'administration du catalogue ;
- les routes de l'app Android (format JSON, validation, limitation), `/api/version`, la présence et
  les alertes SAWALI (faux serveur SAWALI, contrôle de la signature).

## Déployer sur Render

Deux services seulement : l'API `paiement-mobile-api` (plan **starter**, ne s'endort pas) et le site
statique gratuit `paiement-mobile-site`. **Aucun serveur Node à déployer.**

1. Sur Render : **New > Blueprint**, choisir ce dépôt et le fichier `mobile-payments-web/render.yaml`.
2. Saisir les **secrets** (« sync: false ») dans le tableau de bord Render :
   - `MONGO_URL` (chaîne Atlas `mongodb+srv://…`) ;
   - `ADMIN_EMAIL` et `ADMIN_PASSWORD` (compte administrateur, créé au démarrage) ;
   - `LILUVINE_WA_HMAC` (clé de l'émetteur `paiementmobile` dans SAWALI, pour les alertes WhatsApp).
   `JWT_SECRET` est généré par Render. Les autres valeurs sont déjà dans `render.yaml` :
   `FRONTEND_ORIGIN` / `PUBLIC_SITE_URL` = `https://paiement-mobile-site.onrender.com`,
   `VITE_API_BASE_URL` = `https://paiement-mobile-api-jo11.onrender.com/api`, `LILUVINE_WA_EMETTEUR` = `paiementmobile`.
3. Le **catalogue USSD de départ** est chargé automatiquement au premier démarrage si la base est vide :
   aucune commande à lancer.
4. **Noms de domaine** : avec les adresses `*.onrender.com`, Safari (iPhone, Mac) refuse en général le
   cookie de session du site (deux sites différents pour lui). Pour un usage durable, donnez au site et à
   l'API deux sous-domaines du **même** domaine (ex. `pay.exemple.com` et `api.exemple.com`), puis mettez à
   jour `FRONTEND_ORIGIN`, `PUBLIC_SITE_URL` et `VITE_API_BASE_URL`. L'app Android n'est pas concernée
   (pas de cookie).
5. **APK Android** : compilé par GitHub Actions (`Build APK - auRor`) à chaque
   modification de `mobile-payments-app/**` sur la branche par défaut ; il appelle
   `https://paiement-mobile-api-jo11.onrender.com/` par défaut.

## Contact

SAWALI SMART SYSTEMS — contact@sawalismartsystems.com — +226 25 65 81 65 (affiché sur l'écran de connexion).

## Limites à connaître

- Le lien `tel:` avec un code USSD ouvre le composeur sur **Android**. Sur **iPhone**, iOS refuse en
  général de pré-remplir un code contenant `*` ou `#`. L'utilisateur copie alors le code affiché et le
  compose lui-même.
- Les codes USSD du catalogue de départ viennent de l'app Android et sont **indicatifs**.
