using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Odbc;
using System.IO;
using System.Text.Json;
using HFSQL_Shared;
using HFSQL_Shared.Modeles;

namespace HFSQL_SchemaExplorer
{
    /// <summary>
    /// Petit outil console qui se connecte à un serveur HFSQL via ODBC (le même pilote et
    /// la même chaîne de connexion que HFSQL_LoginApp) et permet d'explorer le catalogue :
    /// lister les tables, lister les colonnes d'une table, et prévisualiser quelques lignes.
    ///
    /// Utile lorsqu'on n'a pas d'outil d'export (Centre de Contrôle HFSQL, etc.) sous la main
    /// mais qu'on a un accès ODBC au serveur : ça permet de retrouver les vrais noms de table
    /// et de colonnes à mettre dans appsettings.json de HFSQL_LoginApp.
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
                using var connexion = new OdbcConnection(chaineConnexion);
                connexion.ConnectionTimeout = options.TimeoutSecondes;

                Console.WriteLine($"Connexion à {options.Serveur}:{options.Port} (base \"{options.Base}\", pilote \"{options.Pilote}\")...");
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

        private static void ListerTables(OdbcConnection connexion)
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

        private static void ListerColonnes(OdbcConnection connexion, string table)
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

        private static void ExporterCatalogueComplet(OdbcConnection connexion, string chemin)
        {
            Console.WriteLine("Parcours de toutes les tables de la base...");
            List<InfoTable> catalogue = CatalogueHfsqlService.ChargerCatalogueComplet(connexion);
            CatalogueHfsqlService.SauvegarderEnJson(catalogue, chemin);
            Console.WriteLine($"{catalogue.Count} table(s) exportée(s) vers \"{chemin}\".");
        }

        private static void AfficherExemple(OdbcConnection connexion, string table, int nombreLignes)
        {
            Console.WriteLine($"Exemple ({nombreLignes} ligne(s) max, colonnes sensibles masquées) :");
            Console.WriteLine();

            using var commande = new OdbcCommand($"SELECT * FROM {table}", connexion);
            using OdbcDataReader lecteur = commande.ExecuteReader();

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
                HFSQL_SchemaExplorer - explore le catalogue d'un serveur HFSQL via ODBC.

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
                  --driver <nom>          Nom du pilote ODBC (tel qu'il apparaît dans odbcad32.exe)
                  --user <utilisateur>    Utilisateur de connexion
                  --password <mot de passe>
                  --timeout <secondes>
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
        public string Pilote { get; set; } = "HFSQL";
        public string Utilisateur { get; set; } = "admin";
        public string MotDePasse { get; set; } = "";
        public int TimeoutSecondes { get; set; } = 10;

        public string? Table { get; set; }
        public int NombreLignesExemple { get; set; }
        public string? CheminExport { get; set; }
        public bool AfficherAide { get; set; }

        public string ConstruireChaineConnexion() =>
            $"Driver={{{Pilote}}};" +
            $"Server Name={Serveur};" +
            $"Server Port={Port};" +
            $"Database Name={Base};" +
            $"UID={Utilisateur};" +
            $"PWD={MotDePasse};";

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
                        options.Pilote = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--user":
                        options.Utilisateur = ValeurSuivante(args, ref i, argument);
                        break;

                    case "--password":
                        options.MotDePasse = ValeurSuivante(args, ref i, argument);
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
                options.Pilote = LireTexte(hfsql, "NomPiloteODBC", options.Pilote);
                options.Utilisateur = LireTexte(hfsql, "UtilisateurConnexion", options.Utilisateur);
                options.MotDePasse = LireTexte(hfsql, "MotDePasseConnexion", options.MotDePasse);
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
