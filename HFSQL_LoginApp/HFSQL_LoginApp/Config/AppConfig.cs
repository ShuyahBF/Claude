using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using HFSQL_LoginApp.Models;
using HFSQL_Shared.Modeles;

namespace HFSQL_LoginApp.Config
{
    /// <summary>
    /// Variables globales de l'application : paramètres de connexion au serveur HFSQL,
    /// description de la table des utilisateurs et session en cours.
    /// Ces valeurs sont initialisées au démarrage (voir Program.cs -> AppConfig.Charger())
    /// et peuvent être surchargées via le fichier appsettings.json.
    /// </summary>
    public static class AppConfig
    {
        // ----- Paramètres de connexion au serveur HFSQL -----
        public static string ServeurHFSQL { get; set; } = "localhost";
        public static int PortHFSQL { get; set; } = 4900;
        public static string NomBaseDeDonnees { get; set; } = "MaBase";

        // Nom exact du pilote ODBC HFSQL tel qu'il apparaît dans l'administrateur de
        // sources de données ODBC (odbcad32.exe), par ex. "HFSQL" ou "PC SOFT - HFSQL".
        public static string NomPiloteODBC { get; set; } = "HFSQL";

        public static string UtilisateurConnexion { get; set; } = "admin";
        public static string MotDePasseConnexion { get; set; } = "";
        public static int TimeoutConnexionSecondes { get; set; } = 10;

        // ----- Description de la table des utilisateurs (à adapter à votre structure) -----
        public static string TableUtilisateurs { get; set; } = "UTILISATEURS";
        public static string ColonneLogin { get; set; } = "LOGIN";
        public static string ColonneMotDePasse { get; set; } = "MOT_DE_PASSE";
        public static string ColonneNom { get; set; } = "NOM";
        public static string ColonnePrenom { get; set; } = "PRENOM";

        // ----- Session en cours -----
        public static Utilisateur? UtilisateurConnecte { get; set; }

        // ----- Catalogue de la base (tables + colonnes), chargé au démarrage -----
        // Voir Data/CatalogueInitialisation.cs. Permet de connaître la structure des tables
        // HFSQL sans repasser par le serveur à chaque nouvelle fenêtre.
        public static List<InfoTable> Catalogue { get; set; } = new();

        /// <summary>
        /// Retrouve la description d'une table dans le catalogue en cache, ou null si elle
        /// n'y figure pas (catalogue non chargé, ou nom de table incorrect).
        /// </summary>
        public static InfoTable? ObtenirTable(string nomTable) =>
            Catalogue.FirstOrDefault(table => string.Equals(table.Nom, nomTable, StringComparison.OrdinalIgnoreCase));

        /// <summary>
        /// Chaîne de connexion ODBC construite à partir des paramètres ci-dessus.
        /// </summary>
        public static string ChaineConnexion =>
            $"Driver={{{NomPiloteODBC}}};" +
            $"Server Name={ServeurHFSQL};" +
            $"Server Port={PortHFSQL};" +
            $"Database Name={NomBaseDeDonnees};" +
            $"UID={UtilisateurConnexion};" +
            $"PWD={MotDePasseConnexion};";

        /// <summary>
        /// Charge la configuration depuis appsettings.json (s'il existe) et met à jour
        /// les valeurs par défaut. A appeler une seule fois, au démarrage de l'application.
        /// </summary>
        public static void Charger()
        {
            try
            {
                string chemin = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (!File.Exists(chemin))
                    return;

                string json = File.ReadAllText(chemin);
                using JsonDocument document = JsonDocument.Parse(json);
                JsonElement racine = document.RootElement;

                if (racine.TryGetProperty("HFSQL", out JsonElement hfsql))
                {
                    ServeurHFSQL = LireTexte(hfsql, "ServeurHFSQL", ServeurHFSQL);
                    PortHFSQL = LireEntier(hfsql, "PortHFSQL", PortHFSQL);
                    NomBaseDeDonnees = LireTexte(hfsql, "NomBaseDeDonnees", NomBaseDeDonnees);
                    NomPiloteODBC = LireTexte(hfsql, "NomPiloteODBC", NomPiloteODBC);
                    UtilisateurConnexion = LireTexte(hfsql, "UtilisateurConnexion", UtilisateurConnexion);
                    MotDePasseConnexion = LireTexte(hfsql, "MotDePasseConnexion", MotDePasseConnexion);
                    TimeoutConnexionSecondes = LireEntier(hfsql, "TimeoutConnexionSecondes", TimeoutConnexionSecondes);
                }

                if (racine.TryGetProperty("TableUtilisateurs", out JsonElement table))
                {
                    TableUtilisateurs = LireTexte(table, "Nom", TableUtilisateurs);
                    ColonneLogin = LireTexte(table, "ColonneLogin", ColonneLogin);
                    ColonneMotDePasse = LireTexte(table, "ColonneMotDePasse", ColonneMotDePasse);
                    ColonneNom = LireTexte(table, "ColonneNom", ColonneNom);
                    ColonnePrenom = LireTexte(table, "ColonnePrenom", ColonnePrenom);
                }
            }
            catch (Exception ex)
            {
                // En cas d'erreur de lecture, on conserve les valeurs par défaut ci-dessus.
                Console.Error.WriteLine("AppConfig: impossible de lire appsettings.json - " + ex.Message);
            }
        }

        private static string LireTexte(JsonElement element, string propriete, string valeurParDefaut) =>
            element.TryGetProperty(propriete, out JsonElement valeur) ? (valeur.GetString() ?? valeurParDefaut) : valeurParDefaut;

        private static int LireEntier(JsonElement element, string propriete, int valeurParDefaut) =>
            element.TryGetProperty(propriete, out JsonElement valeur) && valeur.TryGetInt32(out int resultat) ? resultat : valeurParDefaut;
    }
}
