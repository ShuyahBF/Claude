import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { lireAvecAttente } from "@/lib/attente";

// Widget « Aujourd'hui » affiché à l'ouverture de la plateforme (lot 41) : météo de la ville, prochaine prise de médicament,
// prochains paiements, anniversaire proche. Chaque ligne ouvre la page concernée. Repliable (choix gardé dans le navigateur).
// Lectures séparées : la météo (lente) n'empêche jamais le reste de s'afficher, et aucune erreur ne gêne l'écran Payer.
const CLE_REPLI = "mpw_widget_replie";
const CLE_VILLE = "mpw_meteo_ville";
const OUAGA = { nom: "Ouagadougou", lat: 12.3714, lon: -1.5197 };
const emoji = (icone = "") => {
  const i = icone.toLowerCase();
  return i.includes("moon") ? "🌙" : i.includes("storm") ? "⛈️" : i.includes("rain") || i.includes("drizzle") ? "🌧️" : i.includes("snow") ? "❄️"
    : i.includes("fog") ? "🌫️" : i.includes("cloud") ? (i.includes("sun") ? "⛅" : "☁️") : i.includes("sun") ? "☀️" : "🌤️";
};
const quand = (n) => (n < 0 ? `en retard de ${-n} j` : n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`);

export default function WidgetAujourdhui() {
  const { user } = useAuth();
  const [replie, setReplie] = useState(() => { try { return localStorage.getItem(CLE_REPLI) === "1"; } catch { return false; } });
  const [jour, setJour] = useState(null);      // données du jour (null = chargement)
  const [meteo, setMeteo] = useState(null);
  const [ville] = useState(() => { try { return JSON.parse(localStorage.getItem(CLE_VILLE)) || OUAGA; } catch { return OUAGA; } });

  useEffect(() => {
    let actif = true;
    apiClient.get("/rappels/aujourdhui").then(({ data }) => actif && setJour(data)).catch(() => actif && setJour(false));
    lireAvecAttente("/meteo", { lat: ville.lat, lon: ville.lon }).then((r) => actif && r.meteo && setMeteo(r.meteo)).catch(() => {});
    return () => { actif = false; };
  }, [ville]);

  const basculer = () => setReplie((v) => { try { localStorage.setItem(CLE_REPLI, v ? "0" : "1"); } catch { /* sans importance */ } return !v; });
  if (jour === false) return null;           // serveur injoignable : pas de widget
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const rien = jour && !jour.prises_total && !jour.paiements.length && !jour.anniversaires.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-white shadow-sm" aria-label="Aujourd'hui" data-testid="widget-aujourdhui">
      <button type="button" onClick={basculer} aria-expanded={!replie} className="flex w-full items-center justify-between gap-3 bg-primary px-4 py-2.5 text-left text-white">
        <span className="min-w-0 truncate font-semibold">Bonjour {user?.prenom || ""} <span className="font-normal capitalize text-white/80">· {date}</span></span>
        <span className="flex shrink-0 items-center gap-2 text-sm">
          {meteo && <span>{emoji(meteo.icone)} {Math.round(meteo.temperature)}°C</span>}
          <span aria-hidden="true">{replie ? "▾" : "▴"}</span>
        </span>
      </button>
      {!replie && (
        <div className="space-y-1 p-3 text-sm">
          {meteo && <Link to="/meteo" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><span>{emoji(meteo.icone)}</span><span>{ville.nom} : {Math.round(meteo.temperature)}°C, {meteo.libelle}</span></Link>}
          {jour === null && <p className="px-2 py-1.5 text-gray-400">Chargement…</p>}
          {jour && jour.prises_total > 0 && (
            <Link to="/medicaments" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span>💊</span>
              <span>{jour.prochaine_prise ? <>Prochaine prise <b className="tabular-nums">{jour.prochaine_prise.heure}</b> · {jour.prochaine_prise.medicament}</> : "Toutes les prises du jour sont faites ✅"}
                <span className="text-gray-400"> ({jour.prises_faites}/{jour.prises_total})</span></span>
            </Link>
          )}
          {jour && jour.paiements.map((p) => (
            <Link key={p.libelle} to="/rappels-paiements" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span>🔁</span><span><b>{p.libelle}</b> <span className={p.dans_jours <= 0 ? "font-semibold text-primary" : "text-gray-600"}>{quand(p.dans_jours)}</span></span>
            </Link>
          ))}
          {jour && jour.anniversaires.map((a) => (
            <Link key={a.nom} to="/anniversaires" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span>🎂</span><span><b>{a.nom}</b> <span className={a.dans_jours === 0 ? "font-semibold text-primary" : "text-gray-600"}>{quand(a.dans_jours)}</span></span>
            </Link>
          ))}
          {rien && <p className="px-2 py-1.5 text-gray-500">Rien de prévu aujourd'hui. Ajoutez des rappels depuis le menu ☰.</p>}
        </div>
      )}
    </section>
  );
}
