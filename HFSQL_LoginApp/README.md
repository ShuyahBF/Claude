# HFSQL_LoginApp

Application Windows (WinForms / .NET) qui se connecte à un serveur **HFSQL**
(base de données PC SOFT / WinDev), affiche une fenêtre de connexion moderne
alimentée par la table des utilisateurs, puis ouvre la fenêtre principale
`MENU_PRINCIPAL` une fois l'utilisateur authentifié.

## Ouvrir le projet

1. Ouvrir `HFSQL_LoginApp.sln` avec Visual Studio Community 2026 (ou toute
   version récente de Visual Studio avec le workload ".NET desktop
   development").
2. Si Visual Studio propose de retargeter le projet vers le SDK .NET
   installé (net9.0-windows, net10.0-windows, ...), c'est normal : le
   projet cible `net8.0-windows` par défaut, modifiez la propriété
   `TargetFramework` dans `HFSQL_LoginApp.csproj` si besoin.
3. Restaurer les paquets NuGet (fait automatiquement à l'ouverture / au
   premier build). Le seul paquet utilisé est `System.Data.Odbc`.

## Prérequis côté serveur HFSQL

- Le **pilote ODBC HFSQL** doit être installé sur le poste (fourni avec
  HFSQL Client/Serveur ou le runtime WinDev/WebDev/WinDev Mobile). Vérifiez
  son nom exact dans l'administrateur de sources de données ODBC
  (`odbcad32.exe`, onglet Pilotes) : il apparaît généralement sous le nom
  `HFSQL` ou `PC SOFT - HFSQL`.
- Le serveur HFSQL doit être démarré et accessible (nom/IP + port, par
  défaut `4900`).

## Configuration (appsettings.json)

Toute la configuration se trouve dans `HFSQL_LoginApp/appsettings.json`,
copié automatiquement à côté de l'exécutable :

```json
{
  "HFSQL": {
    "ServeurHFSQL": "localhost",
    "PortHFSQL": 4900,
    "NomBaseDeDonnees": "MaBase",
    "NomPiloteODBC": "HFSQL",
    "UtilisateurConnexion": "admin",
    "MotDePasseConnexion": "",
    "TimeoutConnexionSecondes": 10
  },
  "TableUtilisateurs": {
    "Nom": "UTILISATEURS",
    "ColonneLogin": "LOGIN",
    "ColonneMotDePasse": "MOT_DE_PASSE",
    "ColonneNom": "NOM",
    "ColonnePrenom": "PRENOM"
  }
}
```

- `HFSQL.*` : paramètres de connexion au serveur HFSQL et au pilote ODBC.
- `TableUtilisateurs.*` : nom de la table des utilisateurs et de ses
  colonnes. **Adaptez ces valeurs à votre propre structure de table.**

Si `appsettings.json` est absent, les valeurs par défaut codées dans
`Config/AppConfig.cs` sont utilisées.

## Fonctionnement

1. **`Program.cs`** initialise l'application : chargement de la
   configuration globale (`AppConfig.Charger()`), puis **connexion au
   serveur HFSQL et mise en cache de la structure de toute la base**
   (`CatalogueInitialisation.Initialiser()` — voir ci-dessous), puis
   démarrage sur `LoginApplicationContext`, qui gère l'enchaînement des
   fenêtres.
2. **`Forms/LoginForm`** : fenêtre de connexion au style moderne
   (bandeau latéral, formulaire épuré, sans bordure système). Au chargement,
   elle interroge la table des utilisateurs via
   `Data/HfsqlConnectionManager.ChargerUtilisateurs()` pour peupler la liste
   déroulante. L'utilisateur choisit son nom, saisit son mot de passe et
   clique sur "Se connecter" (ou appuie sur Entrée). La vérification se fait
   via `HfsqlConnectionManager.Authentifier(login, motDePasse)`.
   - **3 tentatives maximum** : à la 3ᵉ erreur, un message s'affiche et
     l'application se ferme.
3. **`Forms/MenuPrincipalForm`** (`MENU_PRINCIPAL`) : fenêtre principale
   affichée après authentification réussie. Pour l'instant, elle est
   volontairement simple (agrandir / restaurer / fermer uniquement) ; elle
   sera enrichie au fil du projet.

## Catalogue de la base, mis en cache au démarrage

Juste après le chargement de la configuration, `Program.cs` appelle
`CatalogueInitialisation.Initialiser()` (`Data/CatalogueInitialisation.cs`) qui :

1. ouvre une connexion au serveur HFSQL ;
2. parcourt **toutes** les tables de la base et charge leurs colonnes
   (nom, type, taille, nullable) via `HFSQL_Shared.CatalogueHfsqlService` ;
3. garde ce catalogue en mémoire dans `AppConfig.Catalogue` (utilisable par
   n'importe quelle fenêtre via `AppConfig.ObtenirTable("NOM_TABLE")`) ;
4. l'écrit aussi sur disque dans **`hfsql_schema.json`**, à côté de
   l'exécutable.

Si le serveur est injoignable au démarrage, cette étape échoue silencieusement
(le catalogue reste vide) : la fenêtre de connexion affichera de toute façon
l'erreur au moment de charger la liste des utilisateurs.

**Pour l'implémentation de nouvelles fenêtres** : lancez l'application une
fois (ou utilisez `HFSQL_SchemaExplorer.exe --export hfsql_schema.json`, plus
rapide, sans passer par l'UI), puis indiquez-moi les tables concernées — leur
structure exacte (colonnes, types) est déjà dans `hfsql_schema.json` et n'a
pas besoin d'être redécouverte à chaque fois. Le code partagé vit dans le
projet `HFSQL_Shared` (`Modeles/InfoTable.cs`, `Modeles/InfoColonne.cs`,
`CatalogueHfsqlService.cs`), référencé par `HFSQL_LoginApp` et
`HFSQL_SchemaExplorer`.

## Découvrir la structure réelle de votre base (HFSQL_SchemaExplorer)

Si vous n'avez pas d'outil d'export sous la main (Centre de Contrôle HFSQL, etc.) mais
que vous avez un accès ODBC au serveur, le projet console `HFSQL_SchemaExplorer` (inclus
dans la même solution) permet de lister les tables et colonnes disponibles :

```
HFSQL_SchemaExplorer.exe                              # liste toutes les tables
HFSQL_SchemaExplorer.exe --table UTILISATEURS          # liste les colonnes de la table
HFSQL_SchemaExplorer.exe --table UTILISATEURS --sample 5   # + 5 lignes d'exemple (mots de passe masqués)
```

Il lit sa configuration de connexion dans son propre `appsettings.json` (section `HFSQL`,
même format que celui de `HFSQL_LoginApp`), surchargeable via `--server`, `--port`,
`--database`, `--driver`, `--user`, `--password`. Voir `HFSQL_SchemaExplorer/README.md`
pour le détail.

Une fois les vrais noms de table/colonnes identifiés, reportez-les dans le
`appsettings.json` de `HFSQL_LoginApp` (section `TableUtilisateurs`).

## Adapter le projet à votre base

- Renommez/ajustez la table et les colonnes utilisées dans
  `appsettings.json` (`TableUtilisateurs`) pour correspondre à votre table
  HFSQL réelle.
- Si les mots de passe sont stockés hachés dans votre table (recommandé),
  adaptez `HfsqlConnectionManager.Authentifier` pour hacher le mot de passe
  saisi (ex. SHA-256) avant de le comparer, plutôt que de comparer le texte
  en clair.
