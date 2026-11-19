import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { signalerVisite } from "@/lib/visite";
import { effacerVerrou } from "@/lib/verrouEtat";

// Utilisateur connecté, partagé par toutes les pages.
// user = undefined pendant la vérification de la session, null si déconnecté.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  // Plus de session (expirée, déconnexion, jamais ouverte) : aucun verrou d'écran ne doit rester pour la connexion suivante
  useEffect(() => { if (user === null) effacerVerrou(); }, [user]);

  // À l'ouverture du site : le cookie de session est-il encore valable ?
  // Sinon (visiteur non connecté), la visite est signalée au propriétaire (au plus 1 fois / 30 min).
  useEffect(() => {
    apiClient.get("/auth/moi").then(({ data }) => setUser(data)).catch(() => {
      setUser(null);
      signalerVisite();
    });
  }, []);

  // Connexion par numéro de téléphone OU adresse e-mail
  const connexion = useCallback(async (identifiant, motDePasse) => {
    const { data } = await apiClient.post("/auth/connexion", { identifiant, mot_de_passe: motDePasse });
    effacerVerrou();                         // la personne vient de s'identifier : écran déverrouillé (AVANT l'affichage des pages connectées)
    setUser(data.user);
    return data.user;
  }, []);

  // Connexion par l'empreinte du téléphone (application Android) : le secret du coffre remplace le mot de passe
  const connexionEmpreinte = useCallback(async (id, secret) => {
    const { data } = await apiClient.post("/auth/empreinte", { id, secret });
    effacerVerrou();                         // la personne vient de s'identifier : écran déverrouillé (AVANT l'affichage des pages connectées)
    setUser(data.user);
    return data.user;
  }, []);

  const inscription = useCallback(async (champs) => {
    const { data } = await apiClient.post("/auth/inscription", champs);
    effacerVerrou();                         // la personne vient de s'identifier : écran déverrouillé (AVANT l'affichage des pages connectées)
    setUser(data.user);
    return data.user;
  }, []);

  const deconnexion = useCallback(async () => {
    try { await apiClient.post("/auth/deconnexion"); } finally { setUser(null); }
  }, []);

  const valeur = useMemo(() => ({ user, setUser, connexion, connexionEmpreinte, inscription, deconnexion }),
    [user, connexion, connexionEmpreinte, inscription, deconnexion]);
  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
