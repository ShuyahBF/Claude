import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiClient, MOTIF_DECONNEXION_KEY } from "@/lib/api";
import { CLE_DECONNEXION, useInactivite } from "@/lib/inactivite";

const MESSAGE = "Session expirée après inactivité. Reconnectez-vous.";

// Fermeture de la session après inactivité (lot 46), montée une seule fois dans App : active dès qu'un utilisateur est connecté.
// La durée est réglée par l'administrateur (Admin → Comptes) ; un compte à rebours de 30 s propose « Rester connecté » avant la fermeture.
// Le serveur fait le même contrôle : même si ce site est figé, la session est refusée après la durée + 1 minute.
// Pensé pour les téléphones laissés dans les mains des enfants : sans toucher l'écran, la session se ferme.
export default function DeconnexionInactivite() {
  const { user, deconnexion } = useAuth();
  const [reglage, setReglage] = useState({ secondes: 0, avertissement_secondes: 0 });

  // Durée qui s'applique, relue à chaque connexion
  const idUtilisateur = user?.id;
  useEffect(() => {
    if (!idUtilisateur) { setReglage({ secondes: 0, avertissement_secondes: 0 }); return undefined; }
    let annule = false;
    apiClient.get("/auth/inactivite")
      .then(({ data }) => { if (!annule) setReglage(data); })
      .catch(() => { /* réglage illisible : le serveur contrôle de toute façon */ });
    return () => { annule = true; };
  }, [idUtilisateur]);

  const deconnecter = useCallback(async (prevenirAutresOnglets) => {
    try {
      sessionStorage.setItem(MOTIF_DECONNEXION_KEY, MESSAGE);
      if (prevenirAutresOnglets) localStorage.setItem(CLE_DECONNEXION, String(Date.now()));
    } catch { /* stockage indisponible */ }
    try { await deconnexion(); } catch { /* session déjà fermée */ }
    // Navigation « dure » : aucune donnée de la page précédente ne reste affichée
    window.location.assign("/connexion");
  }, [deconnexion]);

  const { restant, resterConnecte } = useInactivite({
    secondes: user ? Number(reglage.secondes) || 0 : 0,
    avertissement: Number(reglage.avertissement_secondes) || 0,
    onDeconnexion: deconnecter,
  });

  if (restant === null) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="inactivite-titre">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="inactivite-titre" className="text-lg font-bold">⏳ Session bientôt fermée</h2>
        <p className="mt-2 text-sm text-gray-700">
          Sans activité, vous serez déconnecté(e) dans <b className="tabular-nums text-red-700">{restant}</b> seconde{restant > 1 ? "s" : ""}.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-outline" onClick={() => deconnecter(true)}>Se déconnecter</button>
          <button type="button" className="btn-primary" onClick={resterConnecte}>Rester connecté</button>
        </div>
      </div>
    </div>
  );
}
