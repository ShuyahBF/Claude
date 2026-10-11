# Raccourcis Paiement Mobile

Application Android qui simplifie le lancement des paiements mobiles (USSD) : l'utilisateur choisit un opérateur, un service (paiement marchand, facture, transfert, achat de crédit, forfait Internet...), saisit les informations demandées (dont le code marchand), et l'app compose automatiquement la syntaxe USSD correspondante (ex. `*144*10*1234*5000#`).

Le catalogue des services par opérateur et l'annuaire des codes marchands sont stockés dans **MongoDB**, exposés à l'app via une **API REST** (l'app ne se connecte jamais directement à MongoDB, par sécurité).

> **Lot 13 — une seule API.** L'app utilise désormais l'API FastAPI de la version web
> (`../mobile-payments-web/backend`, déployée sur Render : `https://paiement-mobile-api-jo11.onrender.com`).
> Elle partage avec le site le même catalogue de services et le même annuaire de marchands.
> Le dossier `backend/` (ancien serveur Node/Express) est conservé **pour archive uniquement** :
> il n'est plus utilisé ni déployé (son `render.yaml` a été retiré).

## Architecture

```
mobile-payments-app/
├── android/     App Android Kotlin + Jetpack Compose
└── backend/     ARCHIVE — ancien serveur Node/Express (plus utilisé)

mobile-payments-web/
├── backend/     API FastAPI unique (site web + app Android)
└── frontend/    Site React
```

```
[App Android] --HTTPS/JSON--> [API FastAPI paiement-mobile-api] --Motor--> [MongoDB Atlas]
[Site web]    --HTTPS/JSON-->            (même API)
```

### Modèle de données (format JSON vu par l'app)

**Service** (un enregistrement par service et par opérateur) :
| Champ | Description |
|---|---|
| `operator` | Ex: "Orange", "Moov Africa", "Telecel Faso" |
| `country` | Code pays ISO (ex: "BF") |
| `name` | Nom affiché du service |
| `category` | `merchant_payment`, `bill_payment`, `money_transfer`, `airtime_topup`, `internet_bundle`, `other` |
| `ussdTemplate` | Gabarit avec placeholders, ex: `*144*10*{code}*{amount}#` |
| `fields` | Liste des champs à saisir (`key`, `label`, `type`, `isMerchantCode`) |

**Merchant** (annuaire des codes marchands déjà rencontrés, partagé avec le site) :
| Champ | Description |
|---|---|
| `operator` | Opérateur associé |
| `code` | Code marchand, entièrement numérique |
| `label` | Nom choisi par l'utilisateur |

Le champ marqué `isMerchantCode: true` dans un service déclenche, côté app, une recherche
(`GET /api/android/merchants/:operator/:code`). Si le code n'existe pas (`404`), l'app demande un intitulé
à l'utilisateur puis crée l'enregistrement (`POST /api/android/merchants`).

## API utilisée par l'app

Routes publiques de l'API FastAPI (détails dans `../mobile-payments-web/README.md`) :

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/android/operators` | Liste des opérateurs disponibles |
| GET | `/api/android/services?operator=Orange` | Services actifs d'un opérateur |
| GET | `/api/android/merchants/:operator/:code` | Recherche d'un code marchand (`404` si inconnu) |
| POST | `/api/android/merchants` | Enregistrer un nouveau code marchand avec son intitulé |
| POST | `/api/android/users` | Enregistrer/mettre à jour le profil saisi à l'accueil (upsert par téléphone) |

Le catalogue se gère depuis la page **Administration** du site web (plus de `npm run seed` : le catalogue
de départ est chargé automatiquement au premier démarrage de l'API).

### Déploiement

Rien à déployer pour l'app elle-même : l'API est déployée avec le site (`../mobile-payments-web/render.yaml`).
L'APK est compilé par GitHub Actions (*Build APK - Raccourcis Paiement Mobile*) à chaque modification de
`mobile-payments-app/**` sur la branche par défaut, et pointe par défaut sur l'API de production
`https://paiement-mobile-api-jo11.onrender.com/`. Lancement manuel possible (*Run workflow*) avec une autre adresse.

## Application Android

- Kotlin + Jetpack Compose + Material 3, Retrofit/OkHttp/Gson pour l'accès réseau.
- `minSdk 24`, `compileSdk`/`targetSdk 35` (Android 15, lot 16). Outils : Android Gradle Plugin 8.7.3, Gradle 8.9, Kotlin 1.9.24 / KSP 1.9.24-1.0.20 / compilateur Compose 1.5.14, Java 17.
- Affichage « bord à bord » (imposé par Android 15) : `enableEdgeToEdge()` dans `MainActivity` ; les `Scaffold` transmettent les marges des barres système au contenu, le clavier virtuel est géré par `imePadding()`.
- Parcours : Opérateur → Service → Formulaire (avec résolution du code marchand) → Confirmation → lancement.
- Lancement du code USSD : un seul bouton **« Composer le code »** (`ACTION_DIAL`) qui pré-remplit le clavier d'appel (le `#` est encodé en `%23`) ; l'utilisateur appuie lui-même sur « Appeler ». Depuis le lot 16, plus d'appel direct ni de permission `CALL_PHONE` : l'app n'utilise que des permissions « normales » (`INTERNET`, `ACCESS_NETWORK_STATE`, plus celles de WorkManager pour la synchro en arrière-plan).
- Écran « À propos » (bouton en haut à droite) et bas de l'accueil : mention de non-affiliation aux opérateurs et lien vers la politique de confidentialité `https://paiement-mobile-site.onrender.com/confidentialite`.

### Configuration et build

1. Ouvrir le dossier `android/` dans Android Studio (Koala ou plus récent). Android Studio proposera de régénérer le Gradle Wrapper automatiquement si besoin (les binaires du wrapper ne sont pas inclus dans ce dépôt, la sandbox de génération n'ayant pas d'accès réseau vers `dl.google.com`) — sinon lancez `gradle wrapper` une fois en local.
2. L'URL de l'API est définie dans `app/build.gradle.kts` (`buildConfigField "API_BASE_URL"`) : par défaut l'API de production `https://paiement-mobile-api-jo11.onrender.com/`. Pour tester contre une API lancée en local depuis l'émulateur : `-PapiBaseUrl=http://10.0.2.2:8000/`.
3. `gradle assembleDebug` pour un APK de debug, `gradle bundleRelease` pour l'App Bundle (.aab) destiné au Play Store. Le plus simple : laisser GitHub le faire (workflow `.github/workflows/mobile-payments-apk.yml`, onglet **Actions** → « Build APK - Raccourcis Paiement Mobile » → **Run workflow**). Les fichiers produits sont dans le résumé de l'exécution, rubrique **Artifacts** : `mobile-payments-debug-apk` (APK à installer directement) et `mobile-payments-release-aab` (App Bundle pour la Play Console).

### Publication sur le Play Store (lot 16)

**1. Créer la clé de publication (une seule fois, sur votre PC).** Il faut Java (le JDK fourni avec Android Studio convient) :

```
keytool -genkeypair -v -keystore paiement-mobile.jks -keyalg RSA -keysize 2048 -validity 10000 -alias paiementmobile
```

`keytool` demande un mot de passe pour le fichier, puis vos nom / organisation / ville / pays (BF), puis le mot de passe de la clé (vous pouvez reprendre le même). Notez-les dans votre coffre de mots de passe.

**2. Convertir le fichier en base64** (texte à coller dans GitHub) :

- Windows (PowerShell) : `[Convert]::ToBase64String([IO.File]::ReadAllBytes("paiement-mobile.jks")) | Set-Clipboard` (le texte est copié dans le presse-papiers) ;
- Linux / macOS : `base64 -w0 paiement-mobile.jks > paiement-mobile.jks.b64` (macOS : `base64 -i paiement-mobile.jks -o paiement-mobile.jks.b64`).

**3. Saisir les 4 secrets dans GitHub** : dépôt → **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | le texte base64 de l'étape 2 |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe du fichier `.jks` |
| `ANDROID_KEY_ALIAS` | `paiementmobile` |
| `ANDROID_KEY_PASSWORD` | le mot de passe de la clé |

Relancez ensuite le workflow : l'annotation « App Bundle signé avec la clé de publication » confirme la signature. Sans ces secrets, l'AAB est produit **non signé** (annotation « Secrets de signature absents ») et la Play Console le refusera. Le fichier de clés n'est jamais versionné : le workflow le reconstitue dans un dossier temporaire et l'efface en fin de tâche ; `app/build.gradle.kts` n'applique la signature que si les 4 valeurs sont présentes.

**4. Conserver la clé en lieu sûr** (deux copies hors ligne + le coffre de mots de passe), et supprimer le fichier `.b64`. Activez **Play App Signing** dans la Play Console (recommandé, proposé par défaut) : Google garde la clé de signature définitive et votre `.jks` devient une simple « clé d'importation », remplaçable en cas de perte.

**5. Play Console** (compte développeur Google, frais uniques de 25 $) : créer l'application, renseigner la fiche à partir de [`PLAYSTORE.md`](PLAYSTORE.md) (textes, formulaire « Sécurité des données », classification, déclaration « services financiers »), l'URL de confidentialité `https://paiement-mobile-site.onrender.com/confidentialite`, puis envoyer l'AAB en **test interne** avant la production. À chaque nouvel envoi, `versionCode` (dans `app/build.gradle.kts`) doit augmenter.

Autres points : la version de publication est réduite par R8 (`isMinifyEnabled = true`) ; les règles de `app/proguard-rules.pro` protègent les modèles Gson, l'interface Retrofit et les entités Room. Icône : icône adaptative vectorielle (`res/drawable/ic_launcher_foreground.xml` + `ic_launcher_background.xml`, `res/mipmap-anydpi-v26/`), sans marque d'opérateur.

## Mode hors-ligne

L'app est **hors-ligne d'abord** : l'interface lit toujours une base locale (Room/SQLite embarquée sur l'appareil), jamais le réseau directement. Objectif : rester utilisable en zone rurale ou en cas de faible couverture, où une connexion n'est pas garantie au premier lancement.

- **Catalogue opérateurs/services** : un catalogue de secours (Orange, Moov Africa, Telecel Faso — miroir de `catalogue_defaut.py` de l'API) est embarqué dans l'app et charge la base locale dès le tout premier lancement, sans réseau. Dès qu'une connexion existe, il est **remplacé** silencieusement par le catalogue du serveur (services désactivés retirés, pas de doublons).
- **Codes marchands** : la recherche/création d'un code marchand se fait d'abord en local ; hors-ligne, un nouveau marchand est enregistré immédiatement sur l'appareil (l'utilisateur peut continuer sans attendre) et marqué "à synchroniser".
- **Rattrapage** : une tâche de fond (WorkManager), contrainte à une connexion active, pousse vers le backend tout ce qui a été créé hors-ligne (profil, marchands) dès que le réseau revient, puis toutes les 6h.
- **Accueil en 3 étapes** (au tout premier lancement) : 1) saisie nom/prénom/téléphone (email facultatif) ; 2) tentative de synchronisation du profil, plafonnée à quelques secondes ; 3) écran de bienvenue, affiché dans tous les cas — la synchro non aboutie est simplement reprogrammée en tâche de fond, elle ne bloque jamais l'accès à l'app.

## Sécurité et limites à connaître

- L'app ne fait que **composer le code USSD** ; elle ne peut pas garantir que la transaction aboutit (cela dépend entièrement du réseau de l'opérateur). Aucune donnée de paiement (montant, code) ne transite ailleurs que vers votre propre backend.
- Les routes `/api/android/…` sont publiques mais limitées (nombre d'appels par minute et par adresse IP, codes marchands numériques, opérateur du catalogue obligatoire) ; l'API est servie en HTTPS par Render.
- **Présence SAWALI** : au lancement et au retour au premier plan (au plus toutes les 5 minutes), l'app envoie en arrière-plan `POST https://api.sawalismartsystems.com/api/presence-logiciel` (application `paiement-mobile-android`, version, modèle de l'appareil, version d'Android) — aucune donnée personnelle.
- **Alerte WhatsApp** : l'enregistrement du profil (`POST /api/android/users`) est signalé au propriétaire par l'API (type « connexion »).
- Les codes USSD du catalogue de départ sont fournis à titre indicatif : vérifiez-les auprès de chaque opérateur (page Administration du site).
