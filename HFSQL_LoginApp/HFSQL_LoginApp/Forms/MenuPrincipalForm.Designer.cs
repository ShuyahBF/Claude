namespace HFSQL_LoginApp.Forms
{
    partial class MenuPrincipalForm
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

        private System.Windows.Forms.Label lblBienvenue;
        private System.Windows.Forms.StatusStrip statusStrip;
        private System.Windows.Forms.ToolStripStatusLabel toolStripUtilisateurConnecte;

        private void InitializeComponent()
        {
            this.lblBienvenue = new System.Windows.Forms.Label();
            this.statusStrip = new System.Windows.Forms.StatusStrip();
            this.toolStripUtilisateurConnecte = new System.Windows.Forms.ToolStripStatusLabel();
            this.statusStrip.SuspendLayout();
            this.SuspendLayout();
            //
            // lblBienvenue
            //
            this.lblBienvenue.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom)
            | System.Windows.Forms.AnchorStyles.Left)
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblBienvenue.Font = new System.Drawing.Font("Segoe UI", 18F);
            this.lblBienvenue.ForeColor = System.Drawing.Color.FromArgb(31, 42, 68);
            this.lblBienvenue.Location = new System.Drawing.Point(0, 0);
            this.lblBienvenue.Name = "lblBienvenue";
            this.lblBienvenue.Size = new System.Drawing.Size(984, 539);
            this.lblBienvenue.TabIndex = 0;
            this.lblBienvenue.Text = "MENU_PRINCIPAL";
            this.lblBienvenue.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            //
            // statusStrip
            //
            this.statusStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.toolStripUtilisateurConnecte});
            this.statusStrip.Location = new System.Drawing.Point(0, 539);
            this.statusStrip.Name = "statusStrip";
            this.statusStrip.Size = new System.Drawing.Size(984, 22);
            this.statusStrip.TabIndex = 1;
            //
            // toolStripUtilisateurConnecte
            //
            this.toolStripUtilisateurConnecte.Name = "toolStripUtilisateurConnecte";
            this.toolStripUtilisateurConnecte.Size = new System.Drawing.Size(0, 17);
            //
            // MenuPrincipalForm
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(984, 561);
            this.Controls.Add(this.lblBienvenue);
            this.Controls.Add(this.statusStrip);
            this.MinimizeBox = false;
            this.MinimumSize = new System.Drawing.Size(640, 400);
            this.Name = "MenuPrincipalForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "Menu Principal";
            this.statusStrip.ResumeLayout(false);
            this.statusStrip.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion
    }
}
