using System;
using System.Windows.Forms;
using HFSQL_LoginApp.Config;

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

            // L'enchaînement des fenêtres (Connexion -> Menu principal) est piloté par
            // LoginApplicationContext, ce qui évite d'avoir une fenêtre de connexion "fantôme"
            // ouverte en tâche de fond une fois l'utilisateur authentifié.
            Application.Run(new LoginApplicationContext());
        }
    }
}
