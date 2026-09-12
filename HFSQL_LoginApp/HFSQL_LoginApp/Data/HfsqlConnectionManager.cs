using System;
using System.Collections.Generic;
using System.Data.Odbc;
using HFSQL_LoginApp.Config;
using HFSQL_LoginApp.Models;

namespace HFSQL_LoginApp.Data
{
    /// <summary>
    /// Centralise l'accès au serveur HFSQL : création de connexion (via le pilote ODBC HFSQL),
    /// chargement de la table des utilisateurs et authentification.
    /// </summary>
    public static class HfsqlConnectionManager
    {
        /// <summary>
        /// Crée une nouvelle connexion ODBC vers le serveur HFSQL configuré dans AppConfig.
        /// L'appelant est responsable de l'ouvrir et de la libérer (using).
        /// </summary>
        public static OdbcConnection CreerConnexion() => new OdbcConnection(AppConfig.ChaineConnexion);

        /// <summary>
        /// Teste la connexion au serveur HFSQL sans rien lire ni écrire.
        /// </summary>
        public static bool TesterConnexion(out string messageErreur)
        {
            messageErreur = string.Empty;
            try
            {
                using OdbcConnection connexion = CreerConnexion();
                connexion.ConnectionTimeout = AppConfig.TimeoutConnexionSecondes;
                connexion.Open();
                return true;
            }
            catch (Exception ex)
            {
                messageErreur = ex.Message;
                return false;
            }
        }

        /// <summary>
        /// Ouvre la table des utilisateurs et renvoie la liste (login, nom, prénom) utilisée
        /// pour alimenter la ComboBox de la fenêtre de connexion.
        /// Le mot de passe n'est volontairement pas chargé à cette étape.
        /// </summary>
        public static List<Utilisateur> ChargerUtilisateurs()
        {
            var utilisateurs = new List<Utilisateur>();

            string requete =
                $"SELECT {AppConfig.ColonneLogin}, {AppConfig.ColonneNom}, {AppConfig.ColonnePrenom} " +
                $"FROM {AppConfig.TableUtilisateurs} " +
                $"ORDER BY {AppConfig.ColonneNom}";

            using OdbcConnection connexion = CreerConnexion();
            connexion.ConnectionTimeout = AppConfig.TimeoutConnexionSecondes;
            connexion.Open();

            using var commande = new OdbcCommand(requete, connexion);
            using OdbcDataReader lecteur = commande.ExecuteReader();
            while (lecteur.Read())
            {
                utilisateurs.Add(new Utilisateur
                {
                    Login = LireColonne(lecteur, AppConfig.ColonneLogin),
                    Nom = LireColonne(lecteur, AppConfig.ColonneNom),
                    Prenom = LireColonne(lecteur, AppConfig.ColonnePrenom)
                });
            }

            return utilisateurs;
        }

        /// <summary>
        /// Vérifie le couple login / mot de passe saisi par rapport à la table HFSQL des utilisateurs.
        /// Renvoie l'utilisateur authentifié, ou null si le login ou le mot de passe est incorrect.
        /// </summary>
        /// <remarks>
        /// Si les mots de passe sont stockés hachés dans votre table (recommandé), remplacez
        /// la comparaison SQL ci-dessous par un hachage du mot de passe saisi avant comparaison.
        /// </remarks>
        public static Utilisateur? Authentifier(string login, string motDePasse)
        {
            string requete =
                $"SELECT {AppConfig.ColonneLogin}, {AppConfig.ColonneNom}, {AppConfig.ColonnePrenom} " +
                $"FROM {AppConfig.TableUtilisateurs} " +
                $"WHERE {AppConfig.ColonneLogin} = ? AND {AppConfig.ColonneMotDePasse} = ?";

            using OdbcConnection connexion = CreerConnexion();
            connexion.ConnectionTimeout = AppConfig.TimeoutConnexionSecondes;
            connexion.Open();

            using var commande = new OdbcCommand(requete, connexion);
            // Les paramètres ODBC sont positionnels : l'ordre ci-dessous doit correspondre
            // à l'ordre des "?" dans la requête (login puis mot de passe).
            commande.Parameters.AddWithValue("@Login", login);
            commande.Parameters.AddWithValue("@MotDePasse", motDePasse);

            using OdbcDataReader lecteur = commande.ExecuteReader();
            if (lecteur.Read())
            {
                return new Utilisateur
                {
                    Login = LireColonne(lecteur, AppConfig.ColonneLogin),
                    Nom = LireColonne(lecteur, AppConfig.ColonneNom),
                    Prenom = LireColonne(lecteur, AppConfig.ColonnePrenom)
                };
            }

            return null;
        }

        private static string LireColonne(OdbcDataReader lecteur, string nomColonne)
        {
            int index = lecteur.GetOrdinal(nomColonne);
            return lecteur.IsDBNull(index) ? string.Empty : lecteur.GetValue(index).ToString() ?? string.Empty;
        }
    }
}
