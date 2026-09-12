# HFSQL_SchemaExplorer

Petit outil console qui se connecte à un serveur HFSQL via ODBC (le même pilote et la
même chaîne de connexion que `HFSQL_LoginApp`) et interroge le catalogue ODBC pour
lister les tables et colonnes disponibles.

Utile quand vous n'avez pas d'outil d'export à disposition (Centre de Contrôle HFSQL,
etc.) mais que vous avez un accès ODBC au serveur : ça permet de retrouver les vrais
noms de table et de colonnes à utiliser dans `appsettings.json` de `HFSQL_LoginApp`,
sans avoir besoin d'ouvrir ou de décoder de fichiers WinDev (`.wda`/`.wdd`).

## Configuration

Les paramètres de connexion sont lus dans `appsettings.json` (section `HFSQL`, même
format que `HFSQL_LoginApp`). Éditez-le avant de lancer l'outil, ou surchargez
ponctuellement via les options de la ligne de commande.

## Utilisation

```
HFSQL_SchemaExplorer.exe [--table <nom>] [--sample <n>] [--export <fichier>] [options de connexion]
```

- **Sans `--table` ni `--export`** : liste toutes les tables de la base.
- **Avec `--table <nom>`** : liste les colonnes de cette table (nom, type, taille,
  nullable).
- **Avec `--sample <n>`** (nécessite `--table`) : affiche en plus les `n` premières
  lignes de la table. Les colonnes dont le nom contient `PASS`, `PWD`, `MDP` ou
  `MOTDEPASSE` sont automatiquement masquées (`***`).
- **Avec `--export <fichier>`** : parcourt **toutes** les tables et colonnes de la base
  (ignore `--table`) et exporte le catalogue complet au format JSON — le même format que
  celui généré automatiquement par `HFSQL_LoginApp` au démarrage (voir sa documentation).
  Pratique pour obtenir la structure complète en une seule commande, sans lancer
  l'application WinForms.

Options de connexion (surchargent `appsettings.json` pour cette exécution) :

| Option | Description |
| --- | --- |
| `--server <serveur>` | Nom ou IP du serveur HFSQL |
| `--port <port>` | Port du serveur HFSQL (ex. 4900) |
| `--database <nom>` | Nom de la base HFSQL |
| `--driver <nom>` | Nom du pilote ODBC (voir `odbcad32.exe`) |
| `--user <utilisateur>` | Utilisateur de connexion |
| `--password <mot de passe>` | Mot de passe de connexion |
| `--timeout <secondes>` | Timeout de connexion |
| `--help` | Affiche l'aide |

## Exemples

```
# Lister toutes les tables de la base configurée dans appsettings.json
HFSQL_SchemaExplorer.exe

# Lister les colonnes de la table des utilisateurs
HFSQL_SchemaExplorer.exe --table UTILISATEURS

# Prévisualiser 5 lignes (mots de passe masqués) pour identifier les bonnes colonnes
HFSQL_SchemaExplorer.exe --table UTILISATEURS --sample 5

# Se connecter à un autre serveur sans modifier appsettings.json
HFSQL_SchemaExplorer.exe --server 192.168.1.10 --port 4900 --database MaBase --table UTILISATEURS

# Exporter la structure complète de la base (toutes les tables/colonnes) en JSON
HFSQL_SchemaExplorer.exe --export hfsql_schema.json
```

Une fois les vrais noms identifiés, reportez-les dans le `appsettings.json` de
`HFSQL_LoginApp` (section `TableUtilisateurs`).
