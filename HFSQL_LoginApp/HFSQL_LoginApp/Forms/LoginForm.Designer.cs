namespace HFSQL_LoginApp.Forms
{
    partial class LoginForm
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Code généré par le Concepteur Windows Form

        private System.Windows.Forms.Panel panelBarreTitre;
        private System.Windows.Forms.Label lblFermer;
        private System.Windows.Forms.Label lblTitreBarre;
        private System.Windows.Forms.Panel panelCote;
        private System.Windows.Forms.Label lblBienvenue;
        private System.Windows.Forms.Label lblBienvenueSousTitre;
        private System.Windows.Forms.Panel panelFormulaire;
        private System.Windows.Forms.Label lblEnTeteFormulaire;
        private System.Windows.Forms.Label lblUtilisateur;
        private System.Windows.Forms.ComboBox cboUtilisateur;
        private System.Windows.Forms.Label lblMotDePasse;
        private System.Windows.Forms.TextBox txtMotDePasse;
        private System.Windows.Forms.Label lblMessage;
        private System.Windows.Forms.Button btnConnexion;

        private void InitializeComponent()
        {
            this.panelBarreTitre = new System.Windows.Forms.Panel();
            this.lblFermer = new System.Windows.Forms.Label();
            this.lblTitreBarre = new System.Windows.Forms.Label();
            this.panelCote = new System.Windows.Forms.Panel();
            this.lblBienvenueSousTitre = new System.Windows.Forms.Label();
            this.lblBienvenue = new System.Windows.Forms.Label();
            this.panelFormulaire = new System.Windows.Forms.Panel();
            this.lblMessage = new System.Windows.Forms.Label();
            this.btnConnexion = new System.Windows.Forms.Button();
            this.txtMotDePasse = new System.Windows.Forms.TextBox();
            this.lblMotDePasse = new System.Windows.Forms.Label();
            this.cboUtilisateur = new System.Windows.Forms.ComboBox();
            this.lblUtilisateur = new System.Windows.Forms.Label();
            this.lblEnTeteFormulaire = new System.Windows.Forms.Label();
            this.panelBarreTitre.SuspendLayout();
            this.panelCote.SuspendLayout();
            this.panelFormulaire.SuspendLayout();
            this.SuspendLayout();
            //
            // panelBarreTitre
            //
            this.panelBarreTitre.BackColor = System.Drawing.Color.FromArgb(31, 42, 68);
            this.panelBarreTitre.Controls.Add(this.lblFermer);
            this.panelBarreTitre.Controls.Add(this.lblTitreBarre);
            this.panelBarreTitre.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelBarreTitre.Location = new System.Drawing.Point(0, 0);
            this.panelBarreTitre.Name = "panelBarreTitre";
            this.panelBarreTitre.Size = new System.Drawing.Size(900, 36);
            this.panelBarreTitre.TabIndex = 0;
            this.panelBarreTitre.MouseDown += new System.Windows.Forms.MouseEventHandler(this.PanelBarreTitre_MouseDown);
            //
            // lblFermer
            //
            this.lblFermer.Cursor = System.Windows.Forms.Cursors.Hand;
            this.lblFermer.Font = new System.Drawing.Font("Segoe UI", 11F, System.Drawing.FontStyle.Bold);
            this.lblFermer.ForeColor = System.Drawing.Color.White;
            this.lblFermer.Location = new System.Drawing.Point(860, 0);
            this.lblFermer.Name = "lblFermer";
            this.lblFermer.Size = new System.Drawing.Size(40, 36);
            this.lblFermer.TabIndex = 1;
            this.lblFermer.Text = "✕";
            this.lblFermer.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.lblFermer.Click += new System.EventHandler(this.LblFermer_Click);
            //
            // lblTitreBarre
            //
            this.lblTitreBarre.AutoSize = true;
            this.lblTitreBarre.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.lblTitreBarre.ForeColor = System.Drawing.Color.White;
            this.lblTitreBarre.Location = new System.Drawing.Point(16, 9);
            this.lblTitreBarre.Name = "lblTitreBarre";
            this.lblTitreBarre.Size = new System.Drawing.Size(65, 19);
            this.lblTitreBarre.TabIndex = 0;
            this.lblTitreBarre.Text = "Connexion";
            //
            // panelCote
            //
            this.panelCote.BackColor = System.Drawing.Color.FromArgb(31, 42, 68);
            this.panelCote.Controls.Add(this.lblBienvenueSousTitre);
            this.panelCote.Controls.Add(this.lblBienvenue);
            this.panelCote.Dock = System.Windows.Forms.DockStyle.Left;
            this.panelCote.Location = new System.Drawing.Point(0, 36);
            this.panelCote.Name = "panelCote";
            this.panelCote.Size = new System.Drawing.Size(340, 484);
            this.panelCote.TabIndex = 1;
            //
            // lblBienvenueSousTitre
            //
            this.lblBienvenueSousTitre.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.lblBienvenueSousTitre.ForeColor = System.Drawing.Color.FromArgb(190, 200, 216);
            this.lblBienvenueSousTitre.Location = new System.Drawing.Point(40, 230);
            this.lblBienvenueSousTitre.Name = "lblBienvenueSousTitre";
            this.lblBienvenueSousTitre.Size = new System.Drawing.Size(260, 80);
            this.lblBienvenueSousTitre.TabIndex = 1;
            this.lblBienvenueSousTitre.Text = "Sélectionnez votre nom dans la liste et saisissez votre mot de passe pour accéd" +
    "er à l\'application.";
            //
            // lblBienvenue
            //
            this.lblBienvenue.AutoSize = true;
            this.lblBienvenue.Font = new System.Drawing.Font("Segoe UI", 26F, System.Drawing.FontStyle.Bold);
            this.lblBienvenue.ForeColor = System.Drawing.Color.White;
            this.lblBienvenue.Location = new System.Drawing.Point(37, 165);
            this.lblBienvenue.Name = "lblBienvenue";
            this.lblBienvenue.Size = new System.Drawing.Size(216, 60);
            this.lblBienvenue.TabIndex = 0;
            this.lblBienvenue.Text = "Bienvenue";
            //
            // panelFormulaire
            //
            this.panelFormulaire.BackColor = System.Drawing.Color.White;
            this.panelFormulaire.Controls.Add(this.lblMessage);
            this.panelFormulaire.Controls.Add(this.btnConnexion);
            this.panelFormulaire.Controls.Add(this.txtMotDePasse);
            this.panelFormulaire.Controls.Add(this.lblMotDePasse);
            this.panelFormulaire.Controls.Add(this.cboUtilisateur);
            this.panelFormulaire.Controls.Add(this.lblUtilisateur);
            this.panelFormulaire.Controls.Add(this.lblEnTeteFormulaire);
            this.panelFormulaire.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelFormulaire.Location = new System.Drawing.Point(340, 36);
            this.panelFormulaire.Name = "panelFormulaire";
            this.panelFormulaire.Size = new System.Drawing.Size(560, 484);
            this.panelFormulaire.TabIndex = 2;
            //
            // lblEnTeteFormulaire
            //
            this.lblEnTeteFormulaire.AutoSize = true;
            this.lblEnTeteFormulaire.Font = new System.Drawing.Font("Segoe UI", 16F, System.Drawing.FontStyle.Bold);
            this.lblEnTeteFormulaire.ForeColor = System.Drawing.Color.FromArgb(31, 42, 68);
            this.lblEnTeteFormulaire.Location = new System.Drawing.Point(60, 50);
            this.lblEnTeteFormulaire.Name = "lblEnTeteFormulaire";
            this.lblEnTeteFormulaire.Size = new System.Drawing.Size(260, 30);
            this.lblEnTeteFormulaire.TabIndex = 0;
            this.lblEnTeteFormulaire.Text = "Connexion à votre compte";
            //
            // lblUtilisateur
            //
            this.lblUtilisateur.AutoSize = true;
            this.lblUtilisateur.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblUtilisateur.ForeColor = System.Drawing.Color.FromArgb(90, 98, 115);
            this.lblUtilisateur.Location = new System.Drawing.Point(61, 112);
            this.lblUtilisateur.Name = "lblUtilisateur";
            this.lblUtilisateur.Size = new System.Drawing.Size(63, 15);
            this.lblUtilisateur.TabIndex = 1;
            this.lblUtilisateur.Text = "Utilisateur";
            //
            // cboUtilisateur
            //
            this.cboUtilisateur.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboUtilisateur.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.cboUtilisateur.FormattingEnabled = true;
            this.cboUtilisateur.Location = new System.Drawing.Point(60, 132);
            this.cboUtilisateur.Name = "cboUtilisateur";
            this.cboUtilisateur.Size = new System.Drawing.Size(440, 28);
            this.cboUtilisateur.TabIndex = 2;
            //
            // lblMotDePasse
            //
            this.lblMotDePasse.AutoSize = true;
            this.lblMotDePasse.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblMotDePasse.ForeColor = System.Drawing.Color.FromArgb(90, 98, 115);
            this.lblMotDePasse.Location = new System.Drawing.Point(61, 182);
            this.lblMotDePasse.Name = "lblMotDePasse";
            this.lblMotDePasse.Size = new System.Drawing.Size(88, 15);
            this.lblMotDePasse.TabIndex = 3;
            this.lblMotDePasse.Text = "Mot de passe";
            //
            // txtMotDePasse
            //
            this.txtMotDePasse.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.txtMotDePasse.Location = new System.Drawing.Point(60, 202);
            this.txtMotDePasse.Name = "txtMotDePasse";
            this.txtMotDePasse.Size = new System.Drawing.Size(440, 27);
            this.txtMotDePasse.TabIndex = 4;
            this.txtMotDePasse.UseSystemPasswordChar = true;
            this.txtMotDePasse.KeyDown += new System.Windows.Forms.KeyEventHandler(this.TxtMotDePasse_KeyDown);
            //
            // btnConnexion
            //
            this.btnConnexion.BackColor = System.Drawing.Color.FromArgb(45, 108, 223);
            this.btnConnexion.Cursor = System.Windows.Forms.Cursors.Hand;
            this.btnConnexion.FlatAppearance.BorderSize = 0;
            this.btnConnexion.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnConnexion.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.btnConnexion.ForeColor = System.Drawing.Color.White;
            this.btnConnexion.Location = new System.Drawing.Point(60, 300);
            this.btnConnexion.Name = "btnConnexion";
            this.btnConnexion.Size = new System.Drawing.Size(440, 42);
            this.btnConnexion.TabIndex = 6;
            this.btnConnexion.Text = "Se connecter";
            this.btnConnexion.UseVisualStyleBackColor = false;
            this.btnConnexion.Click += new System.EventHandler(this.BtnConnexion_Click);
            //
            // lblMessage
            //
            this.lblMessage.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblMessage.ForeColor = System.Drawing.Color.FromArgb(199, 44, 44);
            this.lblMessage.Location = new System.Drawing.Point(60, 250);
            this.lblMessage.Name = "lblMessage";
            this.lblMessage.Size = new System.Drawing.Size(440, 42);
            this.lblMessage.TabIndex = 5;
            this.lblMessage.Text = "";
            //
            // LoginForm
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(900, 520);
            this.Controls.Add(this.panelFormulaire);
            this.Controls.Add(this.panelCote);
            this.Controls.Add(this.panelBarreTitre);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "LoginForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "Connexion";
            this.Load += new System.EventHandler(this.LoginForm_Load);
            this.panelBarreTitre.ResumeLayout(false);
            this.panelBarreTitre.PerformLayout();
            this.panelCote.ResumeLayout(false);
            this.panelCote.PerformLayout();
            this.panelFormulaire.ResumeLayout(false);
            this.panelFormulaire.PerformLayout();
            this.ResumeLayout(false);
        }

        #endregion
    }
}
