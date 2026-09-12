namespace HFSQL_LoginApp.Models
{
    /// <summary>
    /// Représente un enregistrement de la table HFSQL des utilisateurs.
    /// </summary>
    public class Utilisateur
    {
        public string Login { get; set; } = string.Empty;
        public string Nom { get; set; } = string.Empty;
        public string Prenom { get; set; } = string.Empty;

        public string NomComplet => string.IsNullOrWhiteSpace(Prenom) ? Nom : $"{Prenom} {Nom}";

        /// <summary>
        /// Texte affiché dans la ComboBox de sélection de la fenêtre de connexion.
        /// </summary>
        public override string ToString() =>
            string.IsNullOrWhiteSpace(NomComplet) ? Login : $"{NomComplet} ({Login})";
    }
}
