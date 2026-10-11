# Fiche Play Store — Raccourcis Paiement Mobile (lot 16)

Textes et réponses préparés pour la **Play Console** (application `com.ouoba.mobilepay`,
version 1.2.0 / versionCode 3). À copier-coller tels quels, en vérifiant les points
marqués « À confirmer ».

- Politique de confidentialité (URL à saisir) : https://paiement-mobile-site.onrender.com/confidentialite
- Contact développeur : contact@sawalismartsystems.com · +226 25 65 81 65
- Éditeur : SAWALI SMART SYSTEMS (Burkina Faso)

---

## 1. Textes de la fiche

### Titre de l'application (30 caractères max.)

```
Raccourcis Paiement Mobile
```
(26 caractères)

### Description courte (80 caractères max.)

```
Préparez vos codes USSD Mobile Money sans erreur, ouvrez-les dans le composeur.
```
(79 caractères)

### Description longue (4000 caractères max.)

```
Raccourcis Paiement Mobile vous évite de retenir et de taper à la main les longs codes USSD des paiements Mobile Money au Burkina Faso.

COMMENT ÇA MARCHE
1. Choisissez votre opérateur.
2. Choisissez le service : paiement marchand, transfert, achat de crédit ou de forfait…
3. Saisissez le montant, le numéro ou le code marchand.
4. Appuyez sur « Composer le code » : le clavier de votre téléphone s'ouvre avec le code déjà rempli. Vous vérifiez, puis vous appuyez vous-même sur « Appeler ».

Le menu de votre opérateur s'affiche ensuite comme d'habitude : c'est là, et seulement là, que vous saisissez votre code secret.

POINTS FORTS
• Moins d'erreurs : plus de chiffres oubliés ni de « * » mal placés.
• Codes marchands reconnus : l'application affiche le nom du marchand associé à un code et vous permet d'en enregistrer de nouveaux.
• Fonctionne sans réseau Internet : le catalogue des services et vos marchands sont gardés sur le téléphone ; la synchronisation reprend toute seule quand la connexion revient.
• Aucune autorisation sensible : l'application n'appelle jamais à votre place et ne lit ni vos contacts, ni vos SMS, ni votre position.

VOTRE ARGENT RESTE CHEZ VOTRE OPÉRATEUR
Raccourcis Paiement Mobile ne réalise aucune transaction, ne détient et ne transfère aucun fonds. Il prépare seulement le code USSD : le paiement est traité par le réseau de votre opérateur. Votre code secret Mobile Money n'est jamais demandé, enregistré ni transmis.

VOS DONNÉES
À la première ouverture, vous indiquez votre nom, votre prénom, votre numéro de téléphone et, si vous le souhaitez, votre e-mail. Ces informations servent uniquement à votre compte et sont transmises de façon chiffrée (HTTPS). Détails dans notre politique de confidentialité.

Paiement Mobile n'est affilié ni à Orange, ni à Moov Africa, ni à Telecel Faso ; les marques citées appartiennent à leurs propriétaires.

Une question ? contact@sawalismartsystems.com
```

### Catégorie conseillée

- **Catégorie : Finance** (outil d'aide au paiement). Alternative possible : *Outils*.
- Tags suggérés : Paiement, Mobile Money, Portefeuille.
- Pays de distribution : Burkina Faso (puis pays voisins si le catalogue est étendu).

---

## 2. Formulaire « Sécurité des données » (Data safety)

**Collecte ou partage de données utilisateur requises ?** → **Oui**

**Toutes les données sont-elles chiffrées en transit ?** → **Oui** (HTTPS uniquement ; le HTTP en clair n'est autorisé que vers les adresses de test local, voir `network_security_config.xml`).

**Proposez-vous un moyen de demander la suppression des données ?** → **Oui** : sur demande à contact@sawalismartsystems.com (section « Vos droits » de la politique de confidentialité). La désinstallation efface les données conservées sur le téléphone.

> La Play Console demande aussi une **URL de suppression de compte** pour les applications qui créent un profil : indiquer `https://paiement-mobile-site.onrender.com/confidentialite` (section 8 « Vos droits » : procédure de demande par e-mail). À confirmer : si Google exige un formulaire dédié, prévoir une page `/suppression-compte` dans un prochain lot.

### Données collectées

| Type (libellé Play Console) | Collectée | Partagée | Facultative | Finalités |
|---|---|---|---|---|
| Informations personnelles → **Nom** | Oui | Non | Non | Fonctionnalité de l'appli, Gestion du compte |
| Informations personnelles → **Numéro de téléphone** | Oui | Non | Non | Fonctionnalité de l'appli, Gestion du compte |
| Informations personnelles → **Adresse e-mail** | Oui | Non | **Oui** | Gestion du compte |
| Informations financières → **Autres informations financières** (codes marchands et leur nom, enregistrés dans l'annuaire partagé) | Oui | Non | Oui | Fonctionnalité de l'appli |
| Infos et performances de l'appli → **Autres données sur les performances** (version de l'appli, modèle de l'appareil, version d'Android : signal de présence) | Oui | Non | Non | Analyse (supervision du bon fonctionnement) |

**Non collecté** : position, contacts, SMS, journal d'appels, photos, fichiers, identifiants publicitaires, historique de navigation, informations de paiement (numéro de carte, code secret), données de santé.

**« Partagée » = Non** : les données ne vont qu'aux serveurs de l'éditeur (API sur Render, base MongoDB Atlas, supervision SAWALI Smart Systems), qui agissent pour son compte ; selon les définitions de Google, un prestataire qui traite les données pour le compte du développeur n'est pas un « partage ».

**Traitement éphémère** : non (les données du profil sont conservées).

---

## 3. Classification du contenu (questionnaire IARC)

- Catégorie du questionnaire : **Utilitaire, productivité, communication ou autre**.
- Violence, sexualité, langage grossier, drogues : **Non** à tout.
- Jeux d'argent / paris : **Non**.
- Interactions entre utilisateurs, contenu généré par les utilisateurs : **Non** (les noms de marchands saisis ne sont pas un espace d'échange). À confirmer si un modérateur relit l'annuaire.
- Partage de la position : **Non**. Achats numériques dans l'appli : **Non**.
- Résultat attendu : **Tout public / PEGI 3**.

Public cible (rubrique « Public cible et contenu ») : **18 ans et plus** (paiements Mobile Money) ; l'application ne s'adresse pas aux enfants.

Annonces : **l'application ne contient pas d'annonces**.

---

## 4. Déclaration « Fonctionnalités financières »

Dans *Contenu de l'application → Fonctionnalités financières* :

- Cocher **« Mon application ne fournit aucune fonctionnalité financière »** n'est pas exact car elle aide à des paiements ; cocher plutôt la rubrique la plus proche, **« Paiements et virements → Autre »**, avec l'explication ci-dessous.
- Texte d'explication à fournir :

```
Raccourcis Paiement Mobile est un assistant de saisie : il construit le code USSD d'un service Mobile Money (paiement marchand, transfert, crédit) à partir des informations saisies par l'utilisateur, puis ouvre le composeur du téléphone avec ce code pré-rempli (ACTION_DIAL). L'utilisateur lance lui-même l'appel. L'application ne réalise aucune transaction, ne détient ni ne transfère de fonds, ne demande ni ne stocke aucun code secret, et n'a aucun accès aux comptes Mobile Money : la transaction est entièrement traitée par le réseau de l'opérateur. Elle n'est affiliée à aucun opérateur.
```

- Aucune licence financière n'est requise pour ce fonctionnement (pas de détention ni de transfert de fonds). À confirmer par le propriétaire selon la réglementation BCEAO si la fonction évolue.

Autres déclarations :
- **Autorisations** : aucune autorisation sensible (plus de `CALL_PHONE` depuis le lot 16) → aucune déclaration particulière.
- **Accès à l'application** : toutes les fonctions sont accessibles sans identifiants particuliers (le profil se crée à la première ouverture) → « Toutes les fonctionnalités sont disponibles sans accès spécial ».
- **Application gouvernementale / actualités / santé / COVID** : Non.

---

## 5. Éléments graphiques et captures d'écran à préparer

- **Icône 512 × 512 px** (PNG 32 bits) : exporter l'icône adaptative (fond bleu pétrole, téléphone et pièce cochée) — Android Studio : *File → New → Image Asset* sur `ic_launcher_foreground.xml`, ou capture agrandie.
- **Image de présentation 1024 × 500 px** : fond bleu pétrole `#0F4C5C`, icône à gauche, texte « Vos codes Mobile Money, sans erreur ». **Aucun logo d'opérateur.**
- **Captures téléphone** (au moins 2, format portrait 1080 × 1920 ou plus, 16:9 ou 9:16) — dans cet ordre :
  1. Accueil — étape 1/3 « Bienvenue » (saisie du profil, lien vers la politique de confidentialité).
  2. Choix de l'opérateur (avec la mention de non-affiliation en bas).
  3. Choix du service (liste des services d'un opérateur).
  4. Formulaire : montant + code marchand vérifié (« Marchand : … »).
  5. Écran de confirmation : code USSD affiché et bouton « Composer le code ».
  6. Composeur du téléphone ouvert avec le code pré-rempli.
  7. Fenêtre « À propos ».
- Conseils : utiliser un téléphone de test avec un profil fictif (ex. « Awa TEST », 70 00 00 00) ; ne montrer aucun vrai numéro, aucun vrai code marchand, aucun solde ni code secret ; barre d'état propre (batterie pleine, pas de notifications).
- Facultatif : captures tablette 7" et 10" (la Play Console les demande seulement pour mettre l'application en avant sur tablette).
