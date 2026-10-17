import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { messageErreur } from "@/lib/api";
import { lireAvecAttente } from "@/lib/attente";

// Météo (lot 36), lue chez SAWALI (Open-Meteo). Ville mémorisée dans le navigateur (Ouagadougou par défaut).
const OUAGA = { nom: "Ouagadougou", lat: 12.3714, lon: -1.5197, pays: "Burkina Faso" };
const CLE = "mpw_meteo_ville";

// Pictogramme selon le nom d'icône renvoyé par SAWALI
const emoji = (icone = "") => {
  const i = icone.toLowerCase();
  return i.includes("moon") ? "🌙" : i.includes("storm") || i.includes("thunder") ? "⛈️" : i.includes("rain") || i.includes("drizzle") ? "🌧️"
    : i.includes("snow") ? "❄️" : i.includes("fog") ? "🌫️" : i.includes("cloud") ? (i.includes("sun") ? "⛅" : "☁️") : i.includes("sun") ? "☀️" : "🌤️";
};

export default function Meteo() {
  const toast = useToast();
  const [ville, setVille] = useState(() => { try { return JSON.parse(localStorage.getItem(CLE)) || OUAGA; } catch { return OUAGA; } });
  const [meteo, setMeteo] = useState(null);          // null = chargement
  const [indispo, setIndispo] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [cherche, setCherche] = useState(false);

  const charger = useCallback(async (v) => {
    setMeteo(null); setIndispo(false);
    try {
      const r = await lireAvecAttente("/meteo", { lat: v.lat, lon: v.lon });
      if (r.meteo) setMeteo(r.meteo); else setIndispo(true);
    } catch (err) { toast.erreur(messageErreur(err, "Météo indisponible")); setIndispo(true); }
  }, [toast]);
  useEffect(() => { charger(ville); }, [ville, charger]);

  // Recherche d'une ville (une seule : la plus probable) puis mémorisation
  const chercher = async (e) => {
    e.preventDefault();
    if (recherche.trim().length < 2) return;
    setCherche(true);
    try {
      const r = await lireAvecAttente("/meteo/ville", { q: recherche.trim() });
      if (!r.ville) { toast.erreur("Ville non trouvée pour l'instant, réessayez."); return; }
      const v = { nom: r.ville.nom, lat: r.ville.lat, lon: r.ville.lon, pays: r.ville.pays };
      try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* sans importance */ }
      setVille(v); setRecherche("");
    } catch (err) { toast.erreur(messageErreur(err, "Ville introuvable")); }
    finally { setCherche(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">☀️ Météo</h1>
      <form onSubmit={chercher} className="flex gap-2">
        <input className="input min-w-0 flex-1" placeholder="Autre ville : Bobo-Dioulasso, Abidjan…" value={recherche}
          onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une ville" maxLength={80} />
        <button type="submit" className="btn-primary" disabled={cherche || recherche.trim().length < 2}>{cherche ? "Patientez…" : "Chercher"}</button>
      </form>
      <section className="card space-y-3 p-5" data-testid="meteo">
        <p className="text-lg font-semibold">{ville.nom}{ville.pays ? <span className="font-normal text-gray-500"> · {ville.pays}</span> : null}</p>
        {meteo === null && !indispo && <p className="text-gray-500">Chargement de la météo…</p>}
        {indispo && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Météo momentanément indisponible. Réessayez dans quelques minutes.</p>}
        {meteo && (
          <>
            <div className="flex items-center gap-4">
              <span className="text-6xl leading-none" aria-hidden="true">{emoji(meteo.icone)}</span>
              <div>
                <p className="text-5xl font-bold tabular-nums">{Math.round(meteo.temperature)}°C</p>
                <p className="text-gray-600">{meteo.libelle}</p>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-creme p-2"><dt className="text-xs text-gray-500">Ressenti</dt><dd className="font-semibold">{Math.round(meteo.ressenti)}°C</dd></div>
              <div className="rounded-xl bg-creme p-2"><dt className="text-xs text-gray-500">Humidité</dt><dd className="font-semibold">{meteo.humidite} %</dd></div>
              <div className="rounded-xl bg-creme p-2"><dt className="text-xs text-gray-500">Vent</dt><dd className="font-semibold">{Math.round(meteo.vent_kmh)} km/h</dd></div>
            </dl>
          </>
        )}
        <button type="button" className="btn-outline btn-sm" onClick={() => charger(ville)}>↻ Actualiser</button>
      </section>
    </div>
  );
}
