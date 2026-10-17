import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

// État du serveur affiché sur la page de connexion :
//   « Serveur actif » (vert), « Serveur lent » (orange) ou « Serveur injoignable » (rouge).
// On interroge /api/health à l'ouverture puis toutes les 30 secondes et on mesure le temps de réponse.
const SEUIL_LENT_MS = 2000;   // au-delà : serveur lent
const DELAI_MAX_MS = 10000;   // au-delà : injoignable

const ETATS = {
  verification: { texte: "Vérification du serveur…", couleur: "bg-gray-400" },
  actif: { texte: "Serveur actif", couleur: "bg-green-500" },
  lent: { texte: "Serveur lent", couleur: "bg-amber-500" },
  injoignable: { texte: "Serveur injoignable", couleur: "bg-red-500" },
};

export default function EtatServeur() {
  const [etat, setEtat] = useState("verification");
  const [ip, setIp] = useState("");   // adresse IP du visiteur, renvoyée par /api/health

  useEffect(() => {
    let fini = false;
    const verifier = async () => {
      const debut = performance.now();
      const controle = new AbortController();
      const minuteur = setTimeout(() => controle.abort(), DELAI_MAX_MS);
      try {
        const r = await fetch(`${API_BASE_URL}/health`, { signal: controle.signal, cache: "no-store" });
        const duree = performance.now() - debut;
        // Adresse IP du visiteur (affichée en petit, en gris, au-dessus de l'état)
        try { const j = await r.clone().json(); if (!fini && j?.ip) setIp(j.ip); } catch { /* sans importance */ }
        if (!fini) setEtat(!r.ok ? "injoignable" : duree > SEUIL_LENT_MS ? "lent" : "actif");
      } catch {
        if (!fini) setEtat("injoignable");
      } finally {
        clearTimeout(minuteur);
      }
    };
    verifier();
    const intervalle = setInterval(verifier, 30000);
    return () => { fini = true; clearInterval(intervalle); };
  }, []);

  const { texte, couleur } = ETATS[etat];
  return (
    <div className="text-left">
      {ip && <p className="text-[10px] leading-tight text-gray-400">IP : {ip}</p>}
      <p className="flex items-center gap-2 text-xs text-gray-500">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${couleur}`} aria-hidden="true" />
        {texte}
      </p>
    </div>
  );
}
