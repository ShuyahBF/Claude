import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiClient, MOTIF_DECONNEXION_KEY } from "@/lib/api";

const MESSAGE = "Votre session a été fermée par l'administrateur. Reconnectez-vous.";
const INTERVALLE_MS = 5000;      // lecture de fond : l'administrateur a-t-il annoncé une déconnexion ?

// Déconnexion FORCÉE par l'administrateur (lot 46) : un message d'attente avec compte à rebours (30 s) apparaît sur l'écran de
// l'utilisateur, puis sa session est fermée et il revient à la page de connexion. Montée une seule fois dans App.
// La lecture de fond (/auth/session) ne compte jamais comme une activité (elle ne retarde pas la fermeture après inactivité).
export default function DeconnexionAdmin() {
  const { user, deconnexion } = useAuth();
  const [reste, setReste] = useState(null);       // secondes avant la fermeture, null = rien d'annoncé

  // 1. Lecture de fond tant qu'on est connecté
  const identifiant = user?.id;
  useEffect(() => {
    if (!identifiant) { setReste(null); return undefined; }
    let actif = true;
    const lire = () => apiClient.get("/auth/session").then(({ data }) => { if (actif) setReste(data.deconnexion_dans); }).catch(() => {});
    lire();
    const t = setInterval(lire, INTERVALLE_MS);
    // Retour sur l'écran (téléphone qu'on rallume, autre application quittée) : lecture immédiate, les minuteries ayant été ralenties
    const surVisibilite = () => { if (document.visibilityState === "visible") lire(); };
    document.addEventListener("visibilitychange", surVisibilite);
    window.addEventListener("focus", lire);
    return () => { actif = false; clearInterval(t); document.removeEventListener("visibilitychange", surVisibilite); window.removeEventListener("focus", lire); };
  }, [identifiant]);

  // 2. Compte à rebours local (une seconde par une seconde), puis fermeture et retour à la connexion
  useEffect(() => {
    if (reste === null) return undefined;
    if (reste <= 0) {
      try { sessionStorage.setItem(MOTIF_DECONNEXION_KEY, MESSAGE); } catch { /* stockage indisponible */ }
      Promise.resolve(deconnexion()).catch(() => {}).finally(() => window.location.assign("/connexion"));
      return undefined;
    }
    const t = setTimeout(() => setReste((r) => (r === null ? r : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [reste, deconnexion]);

  if (reste === null) return null;
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="deco-admin-titre">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <h2 id="deco-admin-titre" className="text-lg font-bold">🔒 Fermeture de votre session</h2>
        <p className="mt-2 text-sm text-gray-700">L'administrateur va fermer votre session. Terminez ce que vous faisiez.</p>
        <p className="mt-3 text-4xl font-bold tabular-nums text-red-700">{Math.max(0, reste)}</p>
        <p className="text-xs text-gray-500">seconde{reste > 1 ? "s" : ""} avant la déconnexion</p>
      </div>
    </div>
  );
}
