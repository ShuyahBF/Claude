# Raccourcis Paiement Mobile

Application Android qui simplifie le lancement des paiements mobiles (USSD) : l'utilisateur choisit un opérateur, un service (paiement marchand, facture, transfert, achat de crédit, forfait Internet...), saisit les informations demandées (dont le code marchand), et l'app compose automatiquement la syntaxe USSD correspondante (ex. `*144*10*1234*5000#`).

Le catalogue des services par opérateur et l'annuaire des codes marchands sont stockés dans **MongoDB**, exposés à l'app via une **API REST** (l'app ne se connecte jamais directement à MongoDB, par sécurité).

## Architecture

```
mobile-payments-app/
├── backend/     API Node.js/Express + Mongoose (MongoDB)
└── android/     App Android Kotlin + Jetpack Compose
```

```
[App Android] --HTTPS/JSON--> [API Express] --Mongoose--> [MongoDB (Atlas ou self-hosted)]
```

### Modèle de données

**Service** (un enregistrement par service et par opérateur) :
| Champ | Description |
|---|---|
| `operator` | Ex: "Orange", "Moov Africa", "Telecel Faso" |
| `country` | Code pays ISO (ex: "BF") |
| `name` | Nom affiché du service |
| `category` | `merchant_payment`, `bill_payment`, `money_transfer`, `airtime_topup`, `internet_bundle`, `other` |
| `ussdTemplate` | Gabarit avec placeholders, ex: `*144*10*{code}*{amount}#` |
| `fields` | Liste des champs à saisir (`key`, `label`, `type`, `isMerchantCode`) |

**Merchant** (annuaire des codes marchands déjà rencontrés) :
| Champ | Description |
|---|---|
| `operator` | Opérateur associé |
| `code` | Code marchand, entièrement numérique |
| `label` | Nom choisi par l'utilisateur (alphanumérique) |

Le champ marqué `isMerchantCode: true` dans un service déclenche, côté app, une recherche dans `Merchant` (`GET /api/merchants/:operator/:code`). Si le code n'existe pas (`404`), l'app demande un intitulé à l'utilisateur puis crée l'enregistrement (`POST /api/merchants`).

## Backend

```bash
cd backend
cp .env.example .env   # renseigner MONGODB_URI (Atlas ou local)
npm install
npm run seed            # insère des exemples de services (Orange, Moov Africa, Telecel Faso - Burkina Faso)
npm run dev              # démarre l'API sur http://localhost:3000
```

### Endpoints principaux

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/operators` | Liste des opérateurs disponibles |
| GET | `/api/services?operator=Orange` | Services d'un opérateur |
| POST | `/api/services` | Créer un service (protégé par `API_KEY` si définie) |
| GET | `/api/merchants/:operator/:code` | Recherche d'un code marchand (`404` si inconnu) |
| POST | `/api/merchants` | Enregistrer un nouveau code marchand avec son intitulé |
| POST | `/api/users` | Enregistrer/mettre à jour le profil utilisateur (upsert par `telephone`), route publique (voir mode hors-ligne ci-dessous) |

Déploiement : n'importe quel hébergeur Node (Render, Railway, Fly.io, un VPS...) + un cluster MongoDB Atlas (un tier gratuit M0 suffit largement pour démarrer).

## Application Android

- Kotlin + Jetpack Compose + Material 3, Retrofit/OkHttp/Gson pour l'accès réseau.
- `minSdk 24`, `compileSdk`/`targetSdk 34`.
- Parcours : Opérateur → Service → Formulaire (avec résolution du code marchand) → Confirmation → lancement.
- Deux modes de lancement du code USSD :
  - **Ouvrir dans le composeur** (`ACTION_DIAL`) : pré-remplit le clavier d'appel, l'utilisateur appuie lui-même sur "Appeler". Ne nécessite aucune permission sensible — recommandé par défaut pour la publication sur le Play Store.
  - **Appeler directement** (`ACTION_CALL`) : compose immédiatement le code, nécessite la permission `CALL_PHONE` demandée à l'exécution.

### Configuration et build

1. Ouvrir le dossier `android/` dans Android Studio (Koala ou plus récent). Android Studio proposera de régénérer le Gradle Wrapper automatiquement si besoin (les binaires du wrapper ne sont pas inclus dans ce dépôt, la sandbox de génération n'ayant pas d'accès réseau vers `dl.google.com`) — sinon lancez `gradle wrapper` une fois en local.
2. Renseigner l'URL de l'API dans `app/build.gradle.kts` (`buildConfigField "API_BASE_URL"`), ou passer `-PapiBaseUrl=https://votre-api.example.com/` en ligne de commande. Par défaut, `http://10.0.2.2:3000/` cible un backend lancé en local depuis l'émulateur Android.
3. `./gradlew assembleDebug` pour un APK de debug, `./gradlew bundleRelease` pour un App Bundle signé destiné au Play Store (configurer la signature dans Android Studio : *Build > Generate Signed Bundle*).

### Avant publication sur le Play Store

- Remplacer l'icône placeholder (`app/src/main/res/drawable/ic_launcher.xml`) par une vraie identité visuelle (icône adaptative recommandée).
- Configurer une URL d'API en HTTPS de production (pas `10.0.2.2`).
- Déclarer dans la fiche Play Console l'usage de la permission `CALL_PHONE` (fonctionnalité "appel direct") et la politique de confidentialité (l'app transmet code marchand/montant à votre backend, ainsi que le profil saisi à l'accueil).
- Envisager d'ajouter : un historique des paiements récents (côté app, en local), une recherche/filtrage des services.

## Mode hors-ligne

L'app est **hors-ligne d'abord** : l'interface lit toujours une base locale (Room/SQLite embarquée sur l'appareil), jamais le réseau directement. Objectif : rester utilisable en zone rurale ou en cas de faible couverture, où une connexion n'est pas garantie au premier lancement.

- **Catalogue opérateurs/services** : un catalogue de secours (Orange, Moov Africa, Telecel Faso — miroir de `seed.js`) est embarqué dans l'app et charge la base locale dès le tout premier lancement, sans réseau. Dès qu'une connexion existe, il est rafraîchi silencieusement depuis le backend.
- **Codes marchands** : la recherche/création d'un code marchand se fait d'abord en local ; hors-ligne, un nouveau marchand est enregistré immédiatement sur l'appareil (l'utilisateur peut continuer sans attendre) et marqué "à synchroniser".
- **Rattrapage** : une tâche de fond (WorkManager), contrainte à une connexion active, pousse vers le backend tout ce qui a été créé hors-ligne (profil, marchands) dès que le réseau revient, puis toutes les 6h.
- **Accueil en 3 étapes** (au tout premier lancement) : 1) saisie nom/prénom/téléphone (email facultatif) ; 2) tentative de synchronisation du profil, plafonnée à quelques secondes ; 3) écran de bienvenue, affiché dans tous les cas — la synchro non aboutie est simplement reprogrammée en tâche de fond, elle ne bloque jamais l'accès à l'app.

## Sécurité et limites à connaître

- L'app ne fait que **composer le code USSD** ; elle ne peut pas garantir que la transaction aboutit (cela dépend entièrement du réseau de l'opérateur). Aucune donnée de paiement (montant, code) ne transite ailleurs que vers votre propre backend.
- Protégez les routes d'écriture de l'API (`POST/PUT/DELETE`) avec `API_KEY` en production, et mettez l'API derrière HTTPS.
- Les codes USSD d'exemple dans `seed.js` sont fournis à titre indicatif : vérifiez et mettez à jour les syntaxes réelles auprès de chaque opérateur avant mise en production.
