using System.Windows.Forms;
using HFSQL_LoginApp.Models;

namespace HFSQL_LoginApp.Forms
{
    /// <summary>
    /// Fenêtre principale de l'application (MENU_PRINCIPAL).
    /// Pour le moment volontairement simple : seules les actions agrandir, restaurer et
    /// fermer sont disponibles. Le design et les fonctionnalités seront enrichis par la suite.
    /// </summary>
    public partial class MenuPrincipalForm : Form
    {
        public MenuPrincipalForm(Utilisateur utilisateurConnecte)
        {
            InitializeComponent();
            toolStripUtilisateurConnecte.Text = "Connecté : " + utilisateurConnecte.NomComplet;
        }
    }
}
