using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Odbc;
using System.IO;
using System.Text.Json;
using HFSQL_Shared.Modeles;

namespace HFSQL_Shared
{
    /// <summary>
    /// Parcourt le catalogue ODBC d'une connexion HFSQL déjà ouverte pour construire la liste
    /// des tables et de leurs colonnes, et permet de sauvegarder/recharger ce catalogue en JSON.
    /// Partagé entre HFSQL_LoginApp (mise en cache du schéma au démarrage) et
    /// HFSQL_SchemaExplorer (export en ligne de commande).
    /// </summary>
    public static class CatalogueHfsqlService
    {
        private static readonly JsonSerializerOptions OptionsJson = new()
        {
            WriteIndented = true
        };

        /// <summary>
        /// Parcourt toutes les tables de la base et charge leurs colonnes.
        /// </summary>
        public static List<InfoTable> ChargerCatalogueComplet(OdbcConnection connexionOuverte)
        {
            var catalogue = new List<InfoTable>();

            DataTable tables = connexionOuverte.GetSchema("Tables");
            foreach (DataRow ligneTable in tables.Rows)
            {
                string nomTable = ligneTable["TABLE_NAME"]?.ToString() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(nomTable))
                    continue;

                catalogue.Add(new InfoTable
                {
                    Nom = nomTable,
                    Colonnes = ChargerColonnes(connexionOuverte, nomTable)
                });
            }

            return catalogue;
        }

        /// <summary>
        /// Charge la description des colonnes d'une table, triées dans leur ordre réel.
        /// </summary>
        public static List<InfoColonne> ChargerColonnes(OdbcConnection connexionOuverte, string nomTable)
        {
            var colonnes = new List<InfoColonne>();

            DataTable schemaColonnes = connexionOuverte.GetSchema("Columns", new[] { null, null, nomTable, null });
            foreach (DataRow ligne in schemaColonnes.Select(string.Empty, "ORDINAL_POSITION ASC"))
            {
                colonnes.Add(new InfoColonne
                {
                    Nom = ligne["COLUMN_NAME"]?.ToString() ?? string.Empty,
                    Type = ligne["TYPE_NAME"]?.ToString() ?? string.Empty,
                    Taille = schemaColonnes.Columns.Contains("COLUMN_SIZE") && ligne["COLUMN_SIZE"] != DBNull.Value
                        ? Convert.ToInt32(ligne["COLUMN_SIZE"])
                        : null,
                    Nullable = schemaColonnes.Columns.Contains("IS_NULLABLE")
                        && string.Equals(ligne["IS_NULLABLE"]?.ToString(), "YES", StringComparison.OrdinalIgnoreCase)
                });
            }

            return colonnes;
        }

        public static void SauvegarderEnJson(List<InfoTable> catalogue, string cheminFichier) =>
            File.WriteAllText(cheminFichier, JsonSerializer.Serialize(catalogue, OptionsJson));

        public static List<InfoTable> ChargerDepuisJson(string cheminFichier)
        {
            if (!File.Exists(cheminFichier))
                return new List<InfoTable>();

            string json = File.ReadAllText(cheminFichier);
            return JsonSerializer.Deserialize<List<InfoTable>>(json, OptionsJson) ?? new List<InfoTable>();
        }
    }
}
