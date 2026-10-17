import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { VERSION } from "@/version";

// Nouvelle version du site disponible (lot 49) : une page restée ouverte (ou une application ajoutée à l'écran d'accueil) garde
// l'ancien code après un déploiement et ne reçoit pas les nouveautés (ex. compte à rebours de déconnexion forcée). Toutes les 3 minutes
// et au retour sur l'écran, le site compare sa version à celle du serveur ; plus ancienne → bandeau « Mettre à jour » qui recharge la page.
const INTERVALLE_MS = 3 * 60 * 1000;

export default function MiseAJourSite() {
  const [nouvelle, setNouvelle] = useState(false);

  useEffect(() => {
    let actif = true;
    const verifier = () => apiClient.get("/version").then(({ data }) => {
      if (actif && Number(data.version) > Number(VERSION)) setNouvelle(true);
    }).catch(() => { /* serveur injoignable : on réessaiera */ });
    verifier();
    const t = setInterval(verifier, INTERVALLE_MS);
    const surVisibilite = () => { if (document.visibilityState === "visible") verifier(); };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => { actif = false; clearInterval(t); document.removeEventListener("visibilitychange", surVisibilite); };
  }, []);

  if (!nouvelle) return null;
  return (
    <div className="no-print fixed inset-x-0 top-0 z-[9990] flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-white shadow-lg" role="status">
      <span>🔄 Une nouvelle version est disponible.</span>
      <button type="button" className="rounded-full bg-white px-3 py-1 font-semibold text-primary" onClick={() => window.location.reload()}>Mettre à jour</button>
    </div>
  );
}
