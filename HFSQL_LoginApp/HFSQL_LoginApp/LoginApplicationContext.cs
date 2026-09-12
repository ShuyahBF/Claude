using System.Windows.Forms;
using HFSQL_LoginApp.Config;
using HFSQL_LoginApp.Forms;
using HFSQL_LoginApp.Models;

namespace HFSQL_LoginApp
{
    /// <summary>
    /// Pilote l'enchaînement des fenêtres de l'application : la fenêtre de connexion
    /// s'affiche en premier, puis cède la place à MENU_PRINCIPAL une fois l'utilisateur
    /// authentifié. L'application se termine si l'une ou l'autre fenêtre se ferme
    /// sans avoir mené à l'étape suivante.
    /// </summary>
    public class LoginApplicationContext : ApplicationContext
    {
        public LoginApplicationContext()
        {
            AfficherFenetreConnexion();
        }

        private void AfficherFenetreConnexion()
        {
            var fenetreConnexion = new LoginForm();
            fenetreConnexion.ConnexionReussie += (_, utilisateur) => AfficherMenuPrincipal(utilisateur);
            fenetreConnexion.FormClosed += (_, _) =>
            {
                // Fermeture de la fenêtre de connexion sans authentification réussie
                // (croix, échec après 3 tentatives, etc.) : on quitte l'application.
                if (AppConfig.UtilisateurConnecte == null)
                    ExitThread();
            };
            fenetreConnexion.Show();
        }

        private void AfficherMenuPrincipal(Utilisateur utilisateur)
        {
            AppConfig.UtilisateurConnecte = utilisateur;

            var menuPrincipal = new MenuPrincipalForm(utilisateur);
            menuPrincipal.FormClosed += (_, _) => ExitThread();
            menuPrincipal.Show();
        }
    }
}
