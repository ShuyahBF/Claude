using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using HFSQL_LoginApp.Config;
using HFSQL_LoginApp.Data;
using HFSQL_LoginApp.Models;

namespace HFSQL_LoginApp.Forms
{
    /// <summary>
    /// Fenêtre de connexion : l'utilisateur choisit son nom dans une liste alimentée par la
    /// table HFSQL des utilisateurs, saisit son mot de passe puis clique sur "Se connecter".
    /// L'utilisateur dispose au maximum de 3 tentatives.
    /// </summary>
    public partial class LoginForm : Form
    {
        private const int NombreMaxTentatives = 3;
        private int tentativesRestantes = NombreMaxTentatives;

        /// <summary>Déclenché lorsque l'authentification a réussi.</summary>
        public event EventHandler<Utilisateur>? ConnexionReussie;

        public LoginForm()
        {
            InitializeComponent();
        }

        private void LoginForm_Load(object sender, EventArgs e)
        {
            ChargerListeUtilisateurs();
        }

        private void ChargerListeUtilisateurs()
        {
            try
            {
                cboUtilisateur.DataSource = HfsqlConnectionManager.ChargerUtilisateurs();

                if (cboUtilisateur.Items.Count == 0)
                {
                    AfficherMessage("Aucun utilisateur trouvé dans la table " + AppConfig.TableUtilisateurs + ".");
                }
            }
            catch (Exception ex)
            {
                AfficherMessage("Connexion au serveur HFSQL impossible : " + ex.Message);
            }
        }

        private void BtnConnexion_Click(object sender, EventArgs e)
        {
            if (cboUtilisateur.SelectedItem is not Utilisateur utilisateurSelectionne)
            {
                AfficherMessage("Veuillez sélectionner un utilisateur dans la liste.");
                return;
            }

            if (string.IsNullOrEmpty(txtMotDePasse.Text))
            {
                AfficherMessage("Veuillez saisir votre mot de passe.");
                return;
            }

            btnConnexion.Enabled = false;
            try
            {
                Utilisateur? utilisateurAuthentifie = HfsqlConnectionManager.Authentifier(
                    utilisateurSelectionne.Login, txtMotDePasse.Text);

                if (utilisateurAuthentifie != null)
                {
                    ConnexionReussie?.Invoke(this, utilisateurAuthentifie);
                    Close();
                    return;
                }

                TraiterEchecConnexion();
            }
            catch (Exception ex)
            {
                AfficherMessage("Erreur de connexion au serveur HFSQL : " + ex.Message);
            }
            finally
            {
                btnConnexion.Enabled = true;
            }
        }

        private void TraiterEchecConnexion()
        {
            tentativesRestantes--;

            if (tentativesRestantes <= 0)
            {
                MessageBox.Show(
                    "Identifiants incorrects. Nombre maximal de tentatives atteint (" + NombreMaxTentatives + ").",
                    "Accès refusé",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Close();
                return;
            }

            AfficherMessage($"Login ou mot de passe incorrect. Tentative(s) restante(s) : {tentativesRestantes}.");
            txtMotDePasse.Clear();
            txtMotDePasse.Focus();
        }

        private void AfficherMessage(string message) => lblMessage.Text = message;

        private void TxtMotDePasse_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                BtnConnexion_Click(sender, EventArgs.Empty);
            }
        }

        private void LblFermer_Click(object sender, EventArgs e) => Close();

        // ----- Déplacement de la fenêtre (FormBorderStyle = None) via la barre de titre personnalisée -----

        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HT_CAPTION = 0x2;

        [DllImport("user32.dll")]
        private static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        private void PanelBarreTitre_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left)
                return;

            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
        }
    }
}
