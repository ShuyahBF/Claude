# Gmail PDF Reader

Script Python qui parcourt une boîte de réception Gmail et lit le contenu de chaque PDF en pièce jointe, directement en mémoire (aucun fichier n'est écrit sur disque).

## Installation

```bash
pip install -r requirements.txt
```

## Configuration des identifiants Google

1. Aller sur [Google Cloud Console](https://console.cloud.google.com/), créer/sélectionner un projet.
2. Activer l'API **Gmail API**.
3. Créer des identifiants OAuth 2.0 de type **Application de bureau** (écran de consentement OAuth requis).
4. Télécharger le fichier JSON et le placer dans le dossier du script sous le nom `credentials.json`.
5. Au premier lancement, une fenêtre de navigateur s'ouvre pour autoriser l'accès ; un fichier `token.json` est ensuite créé pour réutiliser la session (à ne pas partager, il contient le jeton d'accès).

`credentials.json` et `token.json` sont des secrets : ne pas les committer (déjà exclus via `.gitignore`).

## Configuration Supabase

Le script enregistre chaque email traité dans la table `factures_gmail` (colonne `PDF`, type `bytea`, contient le ou les PDF fusionnés en un seul fichier binaire). Définissez ces deux variables d'environnement :

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_KEY="<clé service_role ou anon selon les policies RLS>"
```

Pour désactiver l'écriture Supabase (affichage console uniquement), utilisez `--no-supabase`.

## Utilisation

```bash
python gmail_pdf_reader.py
```

Dans un environnement sans navigateur (session distante, serveur headless), utilisez le flux OAuth manuel : une URL d'autorisation est affichée, à ouvrir dans votre propre navigateur ; collez ensuite l'URL de redirection (ou juste le code) dans le terminal.

```bash
python gmail_pdf_reader.py --manual-auth
```

Ou en tant que module dans un autre script :

```python
from gmail_pdf_reader import GmailPDFReader

reader = GmailPDFReader()
for bundle in reader.iter_email_pdfs(query="has:attachment filename:pdf", max_results=50):
    print(bundle.subject, bundle.filenames)
    print(bundle.text)  # texte extrait de tous les PDF de l'email
    # bundle.pdf_bytes : PDF fusionné (toutes pièces jointes de l'email), disponible en mémoire
```

`iter_email_pdfs` est un générateur : à chaque itération, un seul email est traité, ses PDF sont téléchargés en mémoire (`bytes`) et fusionnés en un seul fichier si plusieurs, le texte en est extrait via `pypdf`, puis l'objet est renvoyé. Rien n'est conservé une fois l'itération suivante démarrée, sauf si vous stockez `bundle` vous-même.

Le paramètre `query` accepte la syntaxe de recherche Gmail habituelle (`from:`, `after:`, `is:unread`, etc.).

## 2026-09-24 — HFSQL_SchemaExplorer : passage à OLE-DB (même chaîne que Loois)

"Pour 'HFSQL_SchemaExplorer' crée la chaîne de connexion par rapport à
ce que tu sais déjà de Loois pour une connexion OLEDB" — REMPLACE la
connexion ODBC (System.Data.Odbc) par OLE-DB (System.Data.OleDb), MÊME
fournisseur (HFSQLOLEDB) et MÊME format de chaîne de connexion que
Loois (ParametresApp.ChaineConnexionHFSQLPour, dépôt ShuyahBF/Loois).

- HFSQL_SchemaExplorer.csproj : System.Data.Odbc -> System.Data.OleDb,
  TargetFramework net8.0 -> net8.0-windows (obligatoire, OleDb
  n'existe que sous Windows).
- Program.cs : réécrit intégralement — OleDbConnection/OleDbCommand/OleDbDataReader,
  connexion construite EXACTEMENT comme Loois, y compris le mot de
  passe de protection des fichiers optionnel (--file-password,
  joker "*" — "option A, mono-fichier par connexion" confirmée sur
  Loois). --timeout restauré via la chaîne de connexion elle-même
  (Connect Timeout=...) — OleDbConnection.ConnectionTimeout est en
  LECTURE SEULE, contrairement à OdbcConnection.ConnectionTimeout
  utilisé par l'ancienne version.
- HFSQL_Shared/CatalogueHfsqlService.cs : signatures GÉNÉRALISÉES de
  OdbcConnection vers System.Data.Common.DbConnection (classe de base
  commune aux deux types de connexion) — AUCUN changement de logique
  interne (n'utilise que GetSchema(...), disponible sur la classe de
  base) — donc AUCUN impact sur HFSQL_LoginApp, qui continue de passer
  un OdbcConnection sans modification (upcast implicite valide).

Usage inchangé (mêmes options --server/--port/--database/--table/--sample/--export),
sauf --driver qui représente désormais le fournisseur OLE-DB
(HFSQLOLEDB par défaut) plutôt que le pilote ODBC — nom de l'option
conservé pour compatibilité avec d'éventuels scripts existants, seul
son SENS change.

## 2026-09-24 — Correctif : le vrai fournisseur OLE-DB est "PCSoft.HFSQL", pas "HFSQLOLEDB"

"le driver n'est-il pas PCSOFT.HFSQL ?" — erreur repérée à raison :
"HFSQLOLEDB" était le repli PAR DÉFAUT du CODE de Loois
(ParametresApp.NomProviderOleDb, utilisé seulement si absent du
fichier de config), jamais vérifié contre la valeur RÉELLEMENT
configurée. Loois/App.config précise explicitement
`NomProviderOleDb = "PCSoft.HFSQL"` — la valeur confirmée fonctionnelle
tout au long de cette session (toutes les requêtes HFSQL réussies
aujourd'hui sont passées par cette valeur, pas par le repli par
défaut).

appsettings.json et le code par défaut de HFSQL_SchemaExplorer
corrigés en conséquence ("PCSoft.HFSQL" au lieu de "HFSQLOLEDB").

## 2026-09-24 — 🎯 Correctif RÉEL confirmé : "Connect Timeout" fait planter le fournisseur PCSoft.HFSQL

Suite au débogage avec l'utilisateur (test PowerShell isolé, chaîne de
connexion identique testée avec puis sans le paramètre) : le paramètre
"Connect Timeout=..." dans la chaîne de connexion fait ÉCHOUER le
fournisseur OLE-DB PCSoft.HFSQL ("Une opération OLE-DB en plusieurs
étapes a généré des erreurs" — parfois un crash NATIF 0xC0000409 dans
l'exécutable compilé, reproduit à l'identique en PowerShell comme une
exception .NET catchable).

RETIRÉ ENTIÈREMENT de `ConstruireChaineConnexion()` — ce fournisseur ne
le supporte manifestement pas. `--timeout` reste une option acceptée
(compatibilité), mais documentée comme actuellement SANS EFFET.

## 2026-09-24 — Correctif : joker "*" retiré (ne fonctionne pas), nom réel de table utilisé + affichage de la chaîne de connexion

Suite à l'erreur 70114 ("Aucune analyse n'est ouverte et le fichier de
données <Utilisateur> n'a pas été décrit") sur une base où CHAQUE
fichier est protégé — confirmé : le joker "*" pour le mot de passe de
protection des fichiers NE FONCTIONNE PAS avec ce fournisseur (déjà
établi par test PowerShell isolé plus tôt : seul le nom EXACT du
fichier ciblé déverrouille l'accès).

`ConstruireChaineConnexion()` utilise désormais le nom RÉEL de la
table demandée (`--table`) comme cible du mot de passe fichier, au
lieu du joker "*". Nouveau champ `MotDePasseFichiers` ajouté à
`appsettings.json` (vide par défaut, à renseigner).

"affiche-moi aussi la chaîne de connexion utilisée dans la fenêtre de
résultats" — affichée désormais au démarrage, mots de passe MASQUÉS
(`Password=***`, jamais en clair même dans cet outil de diagnostic).

## 2026-09-24 — Script explorer_aizenta.ps1 : tout automatiser en un seul lancement

"Fais moi un fichier de commande pour gérer tout ça. J'ai demandé de
me faciliter la tâche avec le moins de manipulations" — nouveau script
`HFSQL_LoginApp/HFSQL_SchemaExplorer/explorer_aizenta.ps1` :

- Tous les paramètres de connexion passés directement en ligne de
  commande (jamais besoin de toucher `appsettings.json`).
- Utilise `dotnet run --project .` — reconstruit TOUJOURS depuis les
  fichiers source avant d'exécuter (élimine le risque de lancer une
  vieille copie compilée périmée dans `bin\...`).
- Enchaîne AUTOMATIQUEMENT les 9 tables clés identifiées (Vente,
  AAcheté, Prestations, ProduitClinique, Pièces_Scannées,
  Pièces_Scannées2, Utilisateur, MédecinT, Clinique) en UN SEUL
  lancement.
- Regroupe TOUS les résultats dans UN SEUL fichier texte
  (`aizenta_resultats.txt`) — un seul fichier à transmettre, plutôt que
  neuf captures d'écran séparées.

Usage : `.\explorer_aizenta.ps1` depuis le dossier `HFSQL_SchemaExplorer`.

## 2026-09-28 — Nouveau projet : plateforme TelecomPro (`telecom-platform/`)

Site de gestion d'une entreprise télécom en Python/Django : vente de
téléphones et accessoires, stock (entrées/sorties), maintenance avec
numéro de dossier automatique, clients/fournisseurs, factures et
proformas multi-lignes, centre de messagerie paramétrable par l'admin,
portail public (catalogue, panier, suivi commande/réparation, conseils).
Voir `telecom-platform/README.md`.
