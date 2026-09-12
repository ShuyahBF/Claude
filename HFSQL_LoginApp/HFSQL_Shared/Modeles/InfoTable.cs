using System.Collections.Generic;

namespace HFSQL_Shared.Modeles
{
    /// <summary>
    /// Description d'une table HFSQL : son nom et la liste de ses colonnes.
    /// </summary>
    public class InfoTable
    {
        public string Nom { get; set; } = string.Empty;
        public List<InfoColonne> Colonnes { get; set; } = new();
    }
}
