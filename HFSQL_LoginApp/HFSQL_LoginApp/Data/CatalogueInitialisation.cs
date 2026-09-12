using System;
using System.Data.Odbc;
using System.IO;
using HFSQL_LoginApp.Config;
using HFSQL_Shared;

namespace HFSQL_LoginApp.Data
{
    /// <summary>
    /// Construit le catalogue complet de la base HFSQL (tables + colonnes) une fois au
    /// démarrage de l'application, juste après avoir établi la connexion au serveur, et le
    /// met en cache dans AppConfig.Catalogue.
    ///
    /// Le catalogue est aussi sauvegardé en JSON (hfsql_schema.json, à côté de l'exécutable)
    /// afin de pouvoir être consulté ou transmis facilement lors de l'implémentation de
    /// nouvelles fenêtres : il suffit alors d'indiquer les tables concernées, leur structure
    /// exacte (colonnes, types) est déjà connue.
    /// </summary>
    public static class CatalogueInitialisation
    {
        public const string NomFichierCatalogue = "hfsql_schema.json";

        public static void Initialiser()
        {
            try
            {
                using OdbcConnection connexion = HfsqlConnectionManager.CreerConnexion();
                connexion.ConnectionTimeout = AppConfig.TimeoutConnexionSecondes;
                connexion.Open();

                AppConfig.Catalogue = CatalogueHfsqlService.ChargerCatalogueComplet(connexion);

                string chemin = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, NomFichierCatalogue);
                CatalogueHfsqlService.SauvegarderEnJson(AppConfig.Catalogue, chemin);
            }
            catch (Exception ex)
            {
                // Le catalogue reste vide : ce n'est pas bloquant, la fenêtre de connexion
                // affichera de toute façon l'erreur de connexion au moment de charger la
                // liste des utilisateurs.
                Console.Error.WriteLine("Impossible de charger le catalogue HFSQL au démarrage : " + ex.Message);
            }
        }
    }
}
