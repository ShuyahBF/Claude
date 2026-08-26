using System;
using System.Windows.Forms;
using HFSQL_LoginApp.Config;
using HFSQL_LoginApp.Data;

namespace HFSQL_LoginApp
{
    internal static class Program
    {
        /// <summary>
        /// Point d'entrée de l'application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();

            // ----- Initialisation du projet -----
            // Chargement des variables globales et des paramètres de connexion au serveur HFSQL
            // (lus depuis appsettings.json si présent, sinon valeurs par défaut de AppConfig).
            AppConfig.Charger();

            // Juste après le chargement de la configuration, on se connecte une première fois
            // au serveur HFSQL pour parcourir toute la base et mettre en cache la structure de
            // chaque table (AppConfig.Catalogue + fichier hfsql_schema.json). Chaque nouvelle
            // fenêtre pourra ainsi s'appuyer sur cette structure connue plutôt que de la
            // redécouvrir. Si le serveur est injoignable, l'erreur sera de toute façon signalée
            // à l'utilisateur par la fenêtre de connexion.
            CatalogueInitialisation.Initialiser();

            // L'enchaînement des fenêtres (Connexion -> Menu principal) est piloté par
            // LoginApplicationContext, ce qui évite d'avoir une fenêtre de connexion "fantôme"
            // ouverte en tâche de fond une fois l'utilisateur authentifié.
            Application.Run(new LoginApplicationContext());
        }
    }
}
