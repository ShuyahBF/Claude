# Paiement Mobile sur Android (lot 69)

Le site est une **application installable** : icône sur l'écran d'accueil, ouverture plein écran, notifications, page « Pas de connexion ».
Elle se met à jour toute seule (elle charge toujours la dernière version du site ; bandeau « Mettre à jour » si besoin).

## 1. Installer tout de suite (sans Play Store)
Sur le téléphone, avec Chrome : ouvrir le site → menu **Installer sur Android** → bouton **Installer l'application**
(ou menu ⋮ de Chrome → *Installer l'application*).

## 2. Publier sur le Play Store (sans Android Studio, sans ligne de commande)
Tout se fait avec des pages web, par clics :
1. Ouvrir **https://www.pwabuilder.com**, saisir l'adresse du site (https://paiement-mobile-site.onrender.com), cliquer **Start**.
2. Vérifier que « Manifest » et « Service Worker » sont verts, puis **Package for stores → Android**.
3. Identifiant du paquet suggéré : `com.sawali.paiementmobile` (à ne plus jamais changer). Télécharger le paquet (fichier .aab).
4. Dans la **Play Console**, créer l'application et déposer le .aab (fiche, politique de confidentialité : voir `mobile-payments-app/PLAYSTORE.md`).
5. Play Console → *Intégrité de l'application* → copier l'**empreinte SHA-256** du certificat de signature, et la **donner à Claude** :
   elle est ajoutée dans `frontend/public/.well-known/assetlinks.json` (sans elle, l'application affiche une barre d'adresse).

## Contenu technique (pour mémoire)
- `public/manifest.webmanifest` : nom, icônes (192, 512, 512 « maskable »), couleurs, plein écran.
- `public/sw.js` : notifications + page `public/offline.html` quand Internet manque (rien d'autre n'est mis en cache).
- `public/.well-known/assetlinks.json` : lien site ↔ application Play Store (vide tant que l'empreinte n'est pas fournie).
- `src/pages/Installer.jsx` : bouton d'installation et consignes.
