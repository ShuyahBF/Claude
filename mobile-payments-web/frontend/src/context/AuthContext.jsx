import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";

// Utilisateur connecté, partagé par toutes les pages.
// user = undefined pendant la vérification de la session, null si déconnecté.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  // À l'ouverture du site : le cookie de session est-il encore valable ?
  useEffect(() => {
    apiClient.get("/auth/moi").then(({ data }) => setUser(data)).catch(() => setUser(null));
  }, []);

  // Connexion par numéro de téléphone OU adresse e-mail
  const connexion = useCallback(async (identifiant, motDePasse) => {
    const { data } = await apiClient.post("/auth/connexion", { identifiant, mot_de_passe: motDePasse });
    setUser(data.user);
    return data.user;
  }, []);

  const inscription = useCallback(async (champs) => {
    const { data } = await apiClient.post("/auth/inscription", champs);
    setUser(data.user);
    return data.user;
  }, []);

  const deconnexion = useCallback(async () => {
    try { await apiClient.post("/auth/deconnexion"); } finally { setUser(null); }
  }, []);

  const valeur = useMemo(() => ({ user, setUser, connexion, inscription, deconnexion }),
    [user, connexion, inscription, deconnexion]);
  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
