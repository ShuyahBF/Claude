# Paiement Mobile — version web

Version web de l'app Android **Raccourcis Paiement Mobile** (`../mobile-payments-app`), avec la même
architecture qu'adLyn (`ShuyahBF/telecom-boutique`) :

| Partie | Technologie | Hébergement |
|---|---|---|
| API | Python 3.11, FastAPI, Motor (MongoDB) | Render (service web) |
| Site | React 19, Vite, Tailwind CSS | Render (site statique) |
| Base de données | MongoDB Atlas (collections préfixées `mpw_`) | Atlas |

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
- l'annuaire des marchands et l'administration du catalogue.

## Déployer sur Render

1. Sur Render : **New > Blueprint**, choisir ce dépôt et le fichier `mobile-payments-web/render.yaml`.
2. Renseigner les variables « sync: false » dans le tableau de bord Render :
   - `MONGO_URL` (Atlas) ;
   - `FRONTEND_ORIGIN` et `PUBLIC_SITE_URL` (adresse du site) ;
   - `ADMIN_EMAIL` et `ADMIN_PASSWORD` ;
   - `VITE_API_BASE_URL` (adresse de l'API + `/api`).
   `JWT_SECRET` est généré par Render.
3. **Noms de domaine** : donnez au site et à l'API deux sous-domaines du **même** domaine
   (ex. `pay.exemple.com` et `api.exemple.com`). Sinon Safari (iPhone, Mac) refuse le cookie de session.
   C'est la même consigne que pour adLyn.

## Limites à connaître

- Le lien `tel:` avec un code USSD ouvre le composeur sur **Android**. Sur **iPhone**, iOS refuse en
  général de pré-remplir un code contenant `*` ou `#`. L'utilisateur copie alors le code affiché et le
  compose lui-même.
- Les codes USSD du catalogue de départ viennent de l'app Android et sont **indicatifs**.
