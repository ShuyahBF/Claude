import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { lireAvecAttente } from "@/lib/attente";

// Widget « Aujourd'hui » affiché à l'ouverture de la plateforme (lot 41) : météo de la ville, prochaine prise de médicament,
// prochains paiements, anniversaire proche. Chaque ligne ouvre la page concernée. Repliable (choix gardé dans le navigateur) :
// la carte entière, et chaque rubrique qui compte plusieurs lignes (paiements, anniversaires) — repliée d'office au-delà de 3 lignes.
// Lectures séparées : la météo (lente) n'empêche jamais le reste de s'afficher, et aucune erreur ne gêne l'écran Payer.
const CLE_REPLI = "mpw_widget_replie";
const CLE_SECTIONS = "mpw_widget_sections";      // rubriques dépliées / repliées par l'utilisateur : {paiements: true|false, …}
const CLE_VILLE = "mpw_meteo_ville";
const OUAGA = { nom: "Ouagadougou", lat: 12.3714, lon: -1.5197 };
const emoji = (icone = "") => {
  const i = icone.toLowerCase();
  return i.includes("moon") ? "🌙" : i.includes("storm") ? "⛈️" : i.includes("rain") || i.includes("drizzle") ? "🌧️" : i.includes("snow") ? "❄️"
    : i.includes("fog") ? "🌫️" : i.includes("cloud") ? (i.includes("sun") ? "⛅" : "☁️") : i.includes("sun") ? "☀️" : "🌤️";
};
// Prénom abrégé dans l'en-tête de la carte : au-delà de 8 caractères, on garde les 6 premiers et les 2 derniers (« Jean-Francois » → « Jean-F…is »)
const prenomCourt = (p = "") => { const t = String(p).trim(); return t.length > 8 ? `${t.slice(0, 6)}…${t.slice(-2)}` : t; };
const quand = (n) => (n < 0 ? `en retard de ${-n} j` : n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`);

// Rubrique repliable : une seule ligne se montre telle quelle ; à partir de 2 lignes, un en-tête « titre (n) » les replie / déplie
function Rubrique({ cle, icone, titre, n, ouverte, basculer, children }) {
  if (n < 2) return children;
  return (
    <div>
      <button type="button" onClick={() => basculer(cle, n)} aria-expanded={ouverte}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-semibold text-gray-700 hover:bg-gray-50">
        <span>{icone} {titre} <span className="font-normal text-gray-500">({n})</span></span>
        <span aria-hidden="true" className="text-gray-400">{ouverte ? "▴" : "▾"}</span>
      </button>
      {ouverte && <div className="space-y-1 pl-3">{children}</div>}
    </div>
  );
}

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

  const [sections, setSections] = useState(() => { try { return JSON.parse(localStorage.getItem(CLE_SECTIONS)) || {}; } catch { return {}; } });
  // Rubrique dépliée ? Choix de l'utilisateur, sinon dépliée si elle compte 3 lignes au plus
  const ouverte = (cle, n) => (sections[cle] === undefined ? n <= 3 : sections[cle]);
  const basculerSection = (cle, n) => setSections((v) => {
    const suivant = { ...v, [cle]: !(v[cle] === undefined ? n <= 3 : v[cle]) };
    try { localStorage.setItem(CLE_SECTIONS, JSON.stringify(suivant)); } catch { /* sans importance */ }
    return suivant;
  });
  const basculer = () => setReplie((v) => { try { localStorage.setItem(CLE_REPLI, v ? "0" : "1"); } catch { /* sans importance */ } return !v; });
  if (jour === false) return null;           // serveur injoignable : pas de widget
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  // Nombre total de rappels du jour (affiché sur la carte repliée)
  const total = jour ? (jour.prises_total ? 1 : 0) + jour.paiements.length + jour.anniversaires.length : 0;
  const rien = jour && !jour.prises_total && !jour.paiements.length && !jour.anniversaires.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-white shadow-sm" aria-label="Aujourd'hui" data-testid="widget-aujourdhui">
      <button type="button" onClick={basculer} aria-expanded={!replie} className="flex w-full items-center justify-between gap-3 bg-primary px-4 py-2.5 text-left text-white">
        <span className="min-w-0 truncate font-semibold">Bonjour {prenomCourt(user?.prenom)} <span className="font-normal capitalize text-white/80">· {date}</span></span>
        <span className="flex shrink-0 items-center gap-2 text-sm">
          {replie && total > 0 && <span className="rounded-full bg-white/25 px-2 text-xs font-semibold" aria-label={`${total} rappel(s)`}>{total}</span>}
          {meteo && <span>{emoji(meteo.icone)} {Math.round(meteo.temperature)}°C</span>}
          <span aria-hidden="true">{replie ? "▾" : "▴"}</span>
        </span>
      </button>
      {!replie && (
        <div className="space-y-1 p-3 text-sm">
          {meteo && <Link to="/meteo" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><span>{emoji(meteo.icone)}</span><span>{ville.nom} : {Math.round(meteo.temperature)}°C, {meteo.libelle}</span></Link>}
          {jour === null && <p className="px-2 py-1.5 text-gray-400">Chargement…</p>}
          {jour && jour.prises_total > 0 && (
            <Link to="/rappels?onglet=medicaments" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span>💊</span>
              <span>{jour.prochaine_prise ? <>Prochaine prise <b className="tabular-nums">{jour.prochaine_prise.heure}</b> · {jour.prochaine_prise.medicament}</> : "Toutes les prises du jour sont faites ✅"}
                <span className="text-gray-400"> ({jour.prises_faites}/{jour.prises_total})</span></span>
            </Link>
          )}
          {jour && jour.paiements.length > 0 && (
            <Rubrique cle="paiements" icone="🔁" titre="Paiements à venir" n={jour.paiements.length} ouverte={ouverte("paiements", jour.paiements.length)} basculer={basculerSection}>
              {jour.paiements.map((p) => (
                <Link key={p.libelle} to="/rappels?onglet=paiements" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <span>🔁</span><span><b>{p.libelle}</b> <span className={p.dans_jours <= 0 ? "font-semibold text-primary" : "text-gray-600"}>{quand(p.dans_jours)}</span></span>
                </Link>
              ))}
            </Rubrique>
          )}
          {jour && jour.anniversaires.length > 0 && (
            <Rubrique cle="anniversaires" icone="🎂" titre="Anniversaires" n={jour.anniversaires.length} ouverte={ouverte("anniversaires", jour.anniversaires.length)} basculer={basculerSection}>
              {jour.anniversaires.map((a) => (
                <Link key={a.nom} to="/rappels?onglet=anniversaires" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <span>🎂</span><span><b>{a.nom}</b> <span className={a.dans_jours === 0 ? "font-semibold text-primary" : "text-gray-600"}>{quand(a.dans_jours)}</span></span>
                </Link>
              ))}
            </Rubrique>
          )}
          {rien && <p className="px-2 py-1.5 text-gray-500">Rien de prévu aujourd'hui. Ajoutez des rappels depuis le menu ☰.</p>}
        </div>
      )}
    </section>
  );
}
