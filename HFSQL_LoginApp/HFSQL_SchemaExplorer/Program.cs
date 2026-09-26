using System;
using System.Collections.Generic;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Text.Json;
using HFSQL_Shared;
using HFSQL_Shared.Modeles;

namespace HFSQL_SchemaExplorer
{
    /// <summary>
    /// Petit outil console qui se connecte à un serveur HFSQL via OLE-DB (MÊME fournisseur
    /// "HFSQLOLEDB" et MÊME format de chaîne de connexion que Loois — voir
    /// ParametresApp.ChaineConnexionHFSQLPour dans le dépôt ShuyahBF/Loois) et permet
    /// d'explorer le catalogue : lister les tables, lister les colonnes d'une table, et
    /// prévisualiser quelques lignes.
    ///
    /// § demande utilisateur (24/09) : "crée la chaîne de connexion par rapport à ce que
    /// tu sais déjà de Loois pour une connexion OLEDB" — REMPLACE la version précédente
    /// (ODBC, System.Data.Odbc) — utilisé notamment pour découvrir la structure réelle
    /// d'un espace de travail encore non pris en charge par Loois (ex. Aizenta), avant
    /// d'écrire le moindre code dessus.
    ///
    /// Utile lorsqu'on n'a pas d'outil d'export (Centre de Contrôle HFSQL, etc.) sous la main
    /// mais qu'on a un accès réseau au serveur : ça permet de retrouver les vrais noms de
    /// table et de colonnes.
    ///
    /// Exemples :
    ///   HFSQL_SchemaExplorer.exe
    ///       -> liste toutes les tables de la base.
    ///   HFSQL_SchemaExplorer.exe --table UTILISATEURS
    ///       -> liste les colonnes de la table UTILISATEURS.
    ///   HFSQL_SchemaExplorer.exe --table UTILISATEURS --sample 5
    ///       -> liste les colonnes + affiche 5 lignes d'exemple (mots de passe masqués).
    ///   HFSQL_SchemaExplorer.exe --server 192.168.1.10 --port 4900 --database MaBase --table UTILISATEURS
    ///       -> surcharge les paramètres de connexion sans toucher à appsettings.json.
    ///   HFSQL_SchemaExplorer.exe --export hfsql_schema.json
    ///       -> parcourt toute la base et exporte le catalogue complet (tables + colonnes) en JSON.
    /// </summary>
    internal static class Program
    {
        private static int Main(string[] args)
        {
            Options options;
            try
            {
                options = Options.Analyser(args);
            }
            catch (ArgumentException ex)
            {
                Console.Error.WriteLine("Argument invalide : " + ex.Message);
                AfficherAide();
                return 1;
            }

            if (options.AfficherAide)
            {
                AfficherAide();
                return 0;
            }

            string chaineConnexion = options.ConstruireChaineConnexion();

            try
            {
                using var connexion = new OleDbConnection(chaineConnexion);

                Console.WriteLine($"Connexion à {options.Serveur}:{options.Port} (base \"{options.Base}\", fournisseur OLE-DB \"{options.ProviderOleDb}\")...");
                connexion.Open();
                Console.WriteLine("Connexion réussie.");
                Console.WriteLine();

                if (!string.IsNullOrWhiteSpace(options.CheminExport))
                {
                    ExporterCatalogueComplet(connexion, options.CheminExport);
                }
                else if (string.IsNullOrWhiteSpace(options.Table))
                {
                    ListerTables(connexion);
                    Console.WriteLine();
                    Console.WriteLine("Astuce : relancez avec --table <NomDeLaTable> pour voir ses colonnes, ou --export <fichier> pour tout exporter.");
                }
                else
                {
                    ListerColonnes(connexion, options.Table);

                    if (options.NombreLignesExemple > 0)
                    {
                        Console.WriteLine();
                        AfficherExemple(connexion, options.Table, options.NombreLignesExemple);
                    }
                }

                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Erreur : " + ex.Message);
                return 1;
            }
        }

        private static void ListerTables(OleDbConnection connexion)
        {
            DataTable tables = connexion.GetSchema("Tables");

            Console.WriteLine($"{tables.Rows.Count} table(s) trouvée(s) :");
            Console.WriteLine();
            Console.WriteLine($"{"NOM",-32} TYPE");
            Console.WriteLine(new string('-', 50));

            foreach (DataRow ligne in tables.Rows)
            {
                string nom = ligne["TABLE_NAME"]?.ToString() ?? string.Empty;
                string type = tables.Columns.Contains("TABLE_TYPE") ? ligne["TABLE_TYPE"]?.ToString() ?? string.Empty : string.Empty;
                Console.WriteLine($"{nom,-32} {type}");
            }
        }

        private static void ListerColonnes(OleDbConnection connexion, string table)
        {
            List<InfoColonne> colonnes = CatalogueHfsqlService.ChargerColonnes(connexion, table);

            if (colonnes.Count == 0)
            {
                Console.WriteLine($"Aucune colonne trouvée pour la table \"{table}\". Vérifiez son nom (voir la liste sans --table).");
                return;
            }

            Console.WriteLine($"Colonnes de la table \"{table}\" :");
            Console.WriteLine();
            Console.WriteLine($"{"COLONNE",-30}{"TYPE",-18}{"TAILLE",-10}NULLABLE");
            Console.WriteLine(new string('-', 70));

            foreach (InfoColonne colonne in colonnes)
            {
                string taille = colonne.Taille?.ToString() ?? string.Empty;
                Console.WriteLine($"{colonne.Nom,-30}{colonne.Type,-18}{taille,-10}{(colonne.Nullable ? "YES" : "NO")}");
            }
        }

        private static void ExporterCatalogueComplet(OleDbConnection connexion, string chemin)
        {
            Console.WriteLine("Parcours de toutes les tables de la base...");
            List<InfoTable> catalogue = CatalogueHfsqlService.ChargerCatalogueComplet(connexion);
            CatalogueHfsqlService.SauvegarderEnJson(catalogue, chemin);
            Console.WriteLine($"{catalogue.Count} table(s) exportée(s) vers \"{chemin}\".");
        }

        private static void AfficherExemple(OleDbConnection connexion, string table, int nombreLignes)
        {
            Console.WriteLine($"Exemple ({nombreLignes} ligne(s) max, colonnes sensibles masquées) :");
            Console.WriteLine();

            // § noms de colonnes potentiellement avec espace/accents (voir les pièges HFSQL
            // déjà rencontrés sur Loois) — crochets pour rester sûr, MÊME table entre crochets.
            using var commande = new OleDbCommand($"SELECT * FROM [{table}]", connexion);
            using OleDbDataReader lecteur = commande.ExecuteReader();

            var nomsColonnes = new string[lecteur.FieldCount];
            var colonneSensible = new bool[lecteur.FieldCount];
            for (int i = 0; i < lecteur.FieldCount; i++)
            {
                nomsColonnes[i] = lecteur.GetName(i);
                colonneSensible[i] = EstColonneSensible(nomsColonnes[i]);
            }

            Console.WriteLine(string.Join(" | ", nomsColonnes));

            int compteur = 0;
            while (compteur < nombreLignes && lecteur.Read())
            {
                var valeurs = new string[lecteur.FieldCount];
                for (int i = 0; i < lecteur.FieldCount; i++)
                {
                    valeurs[i] = colonneSensible[i]
                        ? "***"
                        : (lecteur.IsDBNull(i) ? "" : lecteur.GetValue(i).ToString() ?? string.Empty);
                }

                Console.WriteLine(string.Join(" | ", valeurs));
                compteur++;
            }

            if (compteur == 0)
            {
                Console.WriteLine("(table vide)");
            }
        }

        private static readonly string[] MotsClesSensibles = { "PASS", "PWD", "MDP", "MOTDEPASSE" };

        private static bool EstColonneSensible(string nomColonne)
        {
            string nomNormalise = nomColonne.Replace("_", "").Replace(" ", "").ToUpperInvariant();
            foreach (string motCle in MotsClesSensibles)
            {
                if (nomNormalise.Contains(motCle))
                    return true;
            }
            return false;
        }

        private static void AfficherAide()
        {
            Console.WriteLine("""
                HFSQL_SchemaExplorer - explore le catalogue d'un serveur HFSQL via OLE-DB
                (même fournisseur et même format de chaîne de connexion que Loois).

                Usage :
                  HFSQL_SchemaExplorer [--table <nom>] [--sample <n>] [--export <fichier>] [options de connexion]

                Sans --table ni --export : liste toutes les tables de la base.
                Avec --table : liste les colonnes de la table indiquée.
                Avec --sample <n> (nécessite --table) : affiche en plus les n premières lignes
                                                          (colonnes contenant PASS/PWD/MDP masquées).
                Avec --export <fichier> : parcourt TOUTES les tables et colonnes de la base et
                                           exporte le catalogue complet en JSON (ignore --table).

                Options de connexion (surchargent appsettings.json) :
                  --server <serveur>      Nom ou IP du serveur HFSQL
                  --port <port>           Port du serveur HFSQL (ex: 4900)
                  --database <nom>        Nom de la base HFSQL
                  --driver <nom>          Nom du fournisseur OLE-DB (ex: HFSQLOLEDB — le même que Loois)
                  --user <utilisateur>    Utilisateur de connexion
                  --password <mot de passe>
                  --file-password <mot de passe>
                                          Mot de passe de PROTECTION DES FICHIERS (si vos fichiers
                                          HFSQL sont protégés individuellement — optionnel, laissez
                                          vide si vos fichiers n'ont pas de mot de passe séparé).
                  --timeout <secondes>    Délai d'attente de connexion (par défaut 10s)
                  --help                  Affiche cette aide

                Par défaut, les paramètres de connexion sont lus dans appsettings.json
                (section "HFSQL"), situé à côté de l'exécutable.
                """);
        }
    }

    /// <summary>
    /// Options de connexion et de commande, lues depuis appsettings.json puis
    /// éventuellement surchargées par les arguments de la ligne de commande.
    /// </summary>
    internal sealed class Options
    {
        public string Serveur { get; set; } = "localhost";
        public int Port { get; set; } = 4900;
        public string Base { get; set; } = "MaBase";

        // § demande utilisateur (24/09) : "connexion OLEDB" — ce champ représentait le nom
        // du PILOTE ODBC ; il représente désormais le nom du FOURNISSEUR OLE-DB, MÊME
        // valeur par défaut que Loois (voir ParametresApp.NomProviderOleDb, "HFSQLOLEDB").
        // Le nom de propriété et le nom de l'option "--driver" sont conservés tels quels
        // (compatibilité avec des scripts existants), seul leur SENS change.
        public string ProviderOleDb { get; set; } = "HFSQLOLEDB";
        public string Utilisateur { get; set; } = "admin";
        public string MotDePasse { get; set; } = "";

        // § mot de passe de PROTECTION DES FICHIERS HFSQL (distinct du mot de passe de
        // connexion ci-dessus) — MÊME "Extended Properties" que Loois
        // (ChaineConnexionHFSQLPour), optionnel : laissé vide si non utilisé.
        public string MotDePasseFichiers { get; set; } = "";

        // § CORRECTIF : `OleDbConnection.ConnectionTimeout` est en LECTURE SEULE
        // (contrairement à `OdbcConnection.ConnectionTimeout`, modifiable après
        // construction dans la version précédente de cet outil) — le délai se règle
        // désormais via la chaîne de connexion elle-même ("Connect Timeout=...").
        public int TimeoutSecondes { get; set; } = 10;

        public string? Table { get; set; }
        public int NombreLignesExemple { get; set; }
        public string? CheminExport { get; set; }
        public bool AfficherAide { get; set; }

        /// <summary>
        /// § MÊME format EXACT que Loois (ParametresApp.ChaineConnexionHFSQLPour) — voir
        /// ShuyahBF/Loois, Loois/Configuration/ParametresApp.cs. Le mot de passe de
        /// protection des fichiers utilise le joker "*" (s'applique à TOUS les fichiers de
        /// la connexion — "option A, mono-fichier par connexion", confirmée par test réel
        /// sur Loois) plutôt qu'un nom de fichier précis, puisque cet outil explore des
        /// tables variées d'un appel à l'autre.
        /// </summary>
        public string ConstruireChaineConnexion()
        {
            var chaine =
                $"Provider={ProviderOleDb};" +
                $"Data Source={Serveur}:{Port};" +
                $"Initial Catalog={Base};" +
                $"User ID={Utilisateur};" +
                $"Password={MotDePasse};" +
                $"Connect Timeout={TimeoutSecondes};";

            if (!string.IsNullOrEmpty(MotDePasseFichiers))
            {
                chaine += $"Extended Properties=\"Language=ISO-8859-1;Password=*:{MotDePasseFichiers}\";";
            }

            return chaine;
        }

        public static Options Analyser(string[] args)
        {
            var options = new Options();
            ChargerAppSettings(options);

            for (int i = 0; i < args.Length; i++)
            {
                string argument = args[i];

                switch (argument)
                {
                    case "--help":
                    case "-h":
                    case "-?":
                        options.AfficherAide = true;
                        break;

                    case "--table":
                        options.Table = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--sample":
                        options.NombreLignesExemple = int.Parse(ValeurSuivante(args, ref i, argument));
                        break;

                    case "--export":
                        options.CheminExport = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--server":
                        options.Serveur = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--port":
                        options.Port = int.Parse(ValeurSuivante(args, ref i, argument));
                        break;

                    case "--database":
                        options.Base = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--driver":
                        options.ProviderOleDb = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--user":
                        options.Utilisateur = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--password":
                        options.MotDePasse = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--file-password":
                        options.MotDePasseFichiers = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--timeout":
                        options.TimeoutSecondes = int.Parse(ValeurSuivante(args, ref i, argument));
                        break;

                    default:
                        throw new ArgumentException($"option inconnue \"{argument}\"");
                }
            }

            return options;
        }

        private static string ValeurSuivante(string[] args, ref int index, string nomOption)
        {
            if (index + 1 >= args.Length)
                throw new ArgumentException($"\"{nomOption}\" attend une valeur.");

            index++;
            return args[index];
        }

        private static void ChargerAppSettings(Options options)
        {
            try
            {
                string chemin = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (!File.Exists(chemin))
                    return;

                string json = File.ReadAllText(chemin);
                using JsonDocument document = JsonDocument.Parse(json);

                if (!document.RootElement.TryGetProperty("HFSQL", out JsonElement hfsql))
                    return;

                options.Serveur = LireTexte(hfsql, "ServeurHFSQL", options.Serveur);
                options.Port = LireEntier(hfsql, "PortHFSQL", options.Port);
                options.Base = LireTexte(hfsql, "NomBaseDeDonnees", options.Base);
                // § "NomPiloteODBC" conservé tel quel dans le fichier de config (compatibilité)
                // mais représente désormais le fournisseur OLE-DB — voir le commentaire sur
                // la propriété ProviderOleDb ci-dessus.
                options.ProviderOleDb = LireTexte(hfsql, "NomPiloteODBC", options.ProviderOleDb);
                options.Utilisateur = LireTexte(hfsql, "UtilisateurConnexion", options.Utilisateur);
                options.MotDePasse = LireTexte(hfsql, "MotDePasseConnexion", options.MotDePasse);
                options.MotDePasseFichiers = LireTexte(hfsql, "MotDePasseFichiers", options.MotDePasseFichiers);
                options.TimeoutSecondes = LireEntier(hfsql, "TimeoutConnexionSecondes", options.TimeoutSecondes);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Impossible de lire appsettings.json : " + ex.Message);
            }
        }

        private static string LireTexte(JsonElement element, string propriete, string valeurParDefaut) =>
            element.TryGetProperty(propriete, out JsonElement valeur) ? (valeur.GetString() ?? valeurParDefaut) : valeurParDefaut;

        private static int LireEntier(JsonElement element, string propriete, int valeurParDefaut) =>
            element.TryGetProperty(propriete, out JsonElement valeur) && valeur.TryGetInt32(out int resultat) ? resultat : valeurParDefaut;
    }
}
