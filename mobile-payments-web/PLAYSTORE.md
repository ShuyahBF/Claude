# Fiche Play Store — auRor (lot 80)

Textes et réponses à copier dans la **Play Console** pour l'application auRor (package `com.sawali.auror`, paquet `.aab` généré par PWABuilder).
Les points marqués **À confirmer** dépendent de choix du propriétaire ou de la version réelle de la Play Console.

- Site : https://paiement-mobile-site.onrender.com
- Politique de confidentialité : https://paiement-mobile-site.onrender.com/confidentialite
- Suppression de compte (URL demandée par la console) : https://paiement-mobile-site.onrender.com/suppression-compte
- Contact développeur : contact@sawalismartsystems.com · +226 25 65 81 65
- Éditeur : SAWALI SMART SYSTEMS (Burkina Faso)

---

## 1. Textes de la fiche

### Titre (30 caractères max.)
```
auRor
```

### Description courte (80 caractères max.)
```
Payer, se soigner, s'informer : Mobile Money, rappels, cartes et actualités.
```
(76 caractères)

### Description longue (4000 caractères max.)
```
auRor réunit dans une seule application ce qu'on fait chaque jour avec son téléphone au Burkina Faso : préparer ses paiements Mobile Money, ne rien oublier, trouver une pharmacie de garde, s'informer et souhaiter les fêtes à ses proches.

PAYER SANS ERREUR
Choisissez l'opérateur (Orange, Moov Africa, Telecel Faso), le service, le montant et le code marchand : auRor prépare le code USSD et ouvre le composeur de votre téléphone. Vous vérifiez, puis vous appelez vous-même. Les codes marchands sont reconnus grâce à l'annuaire et au scan des plaques et des QR codes.

NE RIEN OUBLIER
• Rappels de paiements récurrents et de prise de médicaments, avec alertes sonores et notifications, même application fermée.
• Anniversaires à souhaiter, avec le nombre de jours restants.
• Alerte renforcée pour les personnes malvoyantes.

SE SOIGNER
• Pharmacies de garde près de vous.
• Lecture des ordonnances par photo (abonnement).

S'INFORMER
• Actualités locales, technologie, mode, coaching, résumées et classées par catégorie, avec le lien pour tout lire.
• Météo.
• Carnet de codes USSD pratiques : solde, forfaits Internet, connaître son numéro…

CARTES VIRTUELLES
Choisissez une occasion, écrivez votre message : l'IA dessine jusqu'à trois cartes et vous envoyez celle que vous préférez à votre proche sur WhatsApp (abonnement).

VOS DOCUMENTS EN SÉCURITÉ
Archivez reçus, factures et pièces importantes : ils sont chiffrés sur votre téléphone avant tout envoi, avec une phrase secrète que personne d'autre ne connaît.

VOTRE ARGENT RESTE CHEZ VOTRE OPÉRATEUR
auRor ne réalise aucune transaction, ne détient et ne transfère aucun fonds. Il prépare seulement le code : le paiement est traité par le réseau de votre opérateur. Votre code secret Mobile Money n'est jamais demandé ni enregistré.

VOS DONNÉES
Vous pouvez supprimer votre compte et toutes vos données à tout moment depuis l'application (Profil). Détails dans la politique de confidentialité.

auRor n'est affilié ni à Orange, ni à Moov Africa, ni à Telecel Faso ; les marques citées appartiennent à leurs propriétaires.

Une question ? contact@sawalismartsystems.com
```

### Catégorie et étiquettes
- Catégorie conseillée : **Finance** (alternative : *Outils*). Étiquettes : Paiement, Mobile Money, Rappels, Actualités.
- Pays : Burkina Faso (puis pays voisins si le catalogue s'étend).

---

## 2. Éléments graphiques à fournir
| Élément | Taille | État |
|---|---|---|
| Icône de l'application | 512×512 PNG | prête (`frontend/public/icone-512.png`) |
| Image de présentation (feature graphic) | 1024×500 | **à créer** (logo auRor sur fond blanc ou bleu nuit) |
| Captures d'écran de téléphone | 2 à 8, 16:9 ou 9:16 | **à faire** sur un téléphone avec le nouveau logo : connexion, Payer, Rappels, Actualités, Cartes |

---

## 3. Formulaire « Sécurité des données » (Data safety)

- **Collecte ou partage de données ?** Oui.
- **Données chiffrées en transit ?** Oui (HTTPS uniquement).
- **Moyen de demander la suppression des données ?** Oui : dans l'application (Profil → « Supprimer mon compte ») et page web https://paiement-mobile-site.onrender.com/suppression-compte.

| Type de données (libellé console) | Collectée | Facultative | Finalité |
|---|---|---|---|
| Nom | Oui | Non | Gestion du compte, personnalisation |
| Adresse e-mail | Oui | **Oui** | Gestion du compte, connexion |
| Numéro de téléphone | Oui | Non | Gestion du compte, connexion, sécurité |
| Identifiants utilisateur | Oui | Non | Gestion du compte |
| Position approximative / précise | Oui | **Oui** (désactivée par défaut) | Fonctionnalités : météo, pharmacies de garde |
| Historique d'achats / infos financières | Oui | Non | Fonctionnalités : historique des paiements préparés (opérateur, montant, code marchand — jamais le code secret) |
| Photos | Traitées sans être gardées | **Oui** | Fonctionnalités : lecture des plaques et ordonnances (abonnement) |
| Enregistrements audio | Traités sans être gardés | **Oui** | Fonctionnalités : transcription vocale (abonnement) |
| Fichiers et documents | Oui (chiffrés par l'utilisateur) | **Oui** | Fonctionnalités : archives en ligne (abonnement) |
| Messages / contenu envoyé | Oui | **Oui** | Fonctionnalités : cartes virtuelles envoyées par WhatsApp (abonnement) |
| Adresse IP et journal de connexions | Oui | Non | Sécurité, prévention de la fraude, supervision |
| Appareil (abonnement de notification) | Oui | **Oui** | Fonctionnalités : notifications push |

- **Partage avec des tiers** : aucune vente. Les données sont traitées par des prestataires agissant pour le compte de l'éditeur : SAWALI (hébergement de l'abonnement, des archives chiffrées, de l'IA et de l'envoi WhatsApp), PawaPay (paiement des abonnements, sur sa propre page), le fournisseur d'IA de SAWALI (images des cartes, transcription, lecture OCR). **À confirmer** : si la console demande de les déclarer comme « partage », répondre Oui pour ces trois prestataires, finalité « Fonctionnalités de l'application ».
- Les archives sont chiffrées sur l'appareil : l'éditeur ne peut pas les lire.

---

## 4. Autres déclarations de la console

| Rubrique | Réponse |
|---|---|
| Accès à l'application | Connexion nécessaire : fournir à Google un **compte de test** (téléphone + mot de passe) dans la rubrique « Accès à l'application ». À créer par le propriétaire, **ne jamais l'écrire dans le dépôt**. |
| Annonces | **Oui**, l'application affiche des annonces de la régie SAWALI. |
| Public cible | **18 ans et plus** (fonctions financières et abonnements). Pas d'attrait pour les enfants. |
| Classification du contenu | Catégorie « Utilitaire / Référence ». Violence : non. Contenu sexuel : non. Langage grossier : non. Substances contrôlées : non (les rappels de médicaments sont une aide, pas un contenu). Jeux d'argent : non. Interaction entre utilisateurs / partage de contenu : **oui** (cartes envoyées par WhatsApp, messages au support). Partage de localisation : oui, facultatif. Achats : oui (abonnements payés hors Google Play, voir ci-dessous). |
| Fonctions financières | Application d'**aide au paiement** : ne détient, ne transfère et ne prête aucun fonds, n'est pas une application bancaire ni de prêt. Elle prépare des codes USSD que l'opérateur traite. Cocher « aucune » pour prêts, investissement, cryptomonnaies, services bancaires ; indiquer « paiements » comme fonction d'aide uniquement. **À confirmer** selon les choix proposés par la console. |
| Application gouvernementale | Non. |
| Santé | Aucune fonction médicale : rappels de prise et recherche de pharmacies de garde. Pas d'avis médical (déclaration « application de santé » : **à confirmer**, cocher l'option la plus proche de « suivi de rappels »). |
| Publicité sur identifiant publicitaire | Non (aucun SDK publicitaire, pas d'identifiant publicitaire). |
| Autorisations sensibles | Aucune. Notifications et micro/appareil photo/localisation demandés par le navigateur uniquement à l'usage, avec accord de l'utilisateur. |

### Abonnements payés hors Google Play
Les formules d'auRor (OCR, voix, archives, cartes, annonceur) sont payées par **Mobile Money / virement sur le site de l'éditeur** (PawaPay, PI-SPI). Google Play impose en principe son système de facturation pour les biens numériques vendus dans l'application : **À confirmer** avant la publication (risque de refus). Options : (a) ne pas proposer le paiement des formules dans la version Play Store, (b) obtenir l'exception pour les paiements locaux, (c) migrer ces achats vers Google Play Billing.

---

## 5. Avant la publication : liste de contrôle
1. Compte développeur Google Play ouvert (personnel : test fermé de 12 testeurs pendant 14 jours en général ; organisation : D-U-N-S) — **à vérifier dans la console**.
2. Création de l'application, dépôt du `.aab` (test interne d'abord).
3. Play Console → *Intégrité de l'application* → copier l'**empreinte SHA-256 du certificat de signature de l'application** (clé de Google) et la donner à Claude : elle s'ajoute à `public/.well-known/assetlinks.json`, à côté de l'empreinte de la clé de téléversement.
4. Remplir les rubriques ci-dessus, joindre le compte de test, publier en test interne puis fermé puis production.
