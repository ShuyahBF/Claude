namespace HFSQL_Shared.Modeles
{
    /// <summary>
    /// Description d'une colonne d'une table HFSQL, telle que renvoyée par le catalogue ODBC.
    /// </summary>
    public class InfoColonne
    {
        public string Nom { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public int? Taille { get; set; }
        public bool Nullable { get; set; }
    }
}
