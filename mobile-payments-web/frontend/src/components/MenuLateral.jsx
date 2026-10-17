// ============================================================================
// MenuLateral.jsx — menu glissant (tiroir) à gauche des écrans connectés (lot 33).
//
// Deux largeurs au choix de l'utilisateur (bouton « ‹ / › » du menu, choix mémorisé dans le navigateur) :
//   - déployé : icônes + texte ; - réduit : icônes seules (le nom de l'entrée reste lu au toucher prolongé / survol).
// Ouvert par le bouton ☰ de l'en-tête ; se ferme au toucher du fond, à la touche Échap, au choix d'une
// entrée ou au changement de page. Il regroupe les services « du quotidien » ; en bas, seule information
// du site : « Ver X · date » (les détails lot / commit / API ne sont plus affichés une fois connecté).
// ============================================================================
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LIBELLE_VER, VERSION } from "@/version";

// Entrées du menu (même liste que les pages de /pages/Bientot.jsx)
export const ENTREES_MENU = [
  { to: "/pharmacies-de-garde", icone: "🏥", libelle: "Pharmacies de garde" },
  { to: "/anniversaires", icone: "🎂", libelle: "Anniversaires à souhaiter" },
  { to: "/rappels-paiements", icone: "🔁", libelle: "Rappels de paiements récurrents" },
  { to: "/medicaments", icone: "💊", libelle: "Rappels de prise de médicaments" },
  { to: "/ordonnances", icone: "📄", libelle: "OCR sur ordonnances" },
  { to: "/breves", icone: "📰", libelle: "Brèves actualités" },
  { to: "/presse", icone: "🗞️", libelle: "Résumés de la presse locale" },
];

const CLE_REDUIT = "mpw_menu_reduit";

export default function MenuLateral({ ouvert, fermer }) {
  const { pathname } = useLocation();
  // Choix de l'utilisateur : menu réduit (icônes seules) ou déployé (icônes + texte), relu au chargement
  const [reduit, setReduit] = useState(() => { try { return localStorage.getItem(CLE_REDUIT) === "1"; } catch { return false; } });
  const basculer = () => setReduit((v) => {
    try { localStorage.setItem(CLE_REDUIT, v ? "0" : "1"); } catch { /* sans importance */ }
    return !v;
  });

  // Fermeture au changement de page et à la touche Échap
  useEffect(() => { fermer(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ouvert) return undefined;
    const touche = (e) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert, fermer]);

  return (
    <div className={`no-print fixed inset-0 z-[70] ${ouvert ? "" : "pointer-events-none"}`} aria-hidden={!ouvert}>
      {/* Fond assombri : un toucher referme le menu */}
      <button type="button" tabIndex={-1} aria-label="Fermer le menu" onClick={fermer}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${ouvert ? "opacity-100" : "opacity-0"}`} />
      {/* Tiroir : glisse depuis la gauche ; 18 rem déployé, 4 rem réduit */}
      <nav aria-label="Menu latéral"
        className={`absolute inset-y-0 left-0 flex max-w-[85vw] flex-col border-r border-primary bg-white transition-all duration-200 ${reduit ? "w-16" : "w-72"} ${ouvert ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className={`flex items-center border-b border-gray-200 py-3 ${reduit ? "flex-col gap-2 px-1" : "justify-between px-4"}`}>
          {reduit ? <img src="/icone.svg" alt="Paiement Mobile" className="h-8 w-8" /> : <p className="logo-ecrit text-3xl text-accent">Paiement Mobile</p>}
          <div className={`flex items-center ${reduit ? "flex-col" : ""}`}>
            {/* Réduire / déployer le menu (choix mémorisé) */}
            <button type="button" onClick={basculer} aria-label={reduit ? "Déployer le menu" : "Réduire le menu (icônes seules)"}
              title={reduit ? "Déployer le menu" : "Réduire le menu"}
              className="rounded-lg px-2 py-1 text-xl leading-none text-gray-600 hover:bg-gray-100">{reduit ? "›" : "‹"}</button>
            <button type="button" onClick={fermer} aria-label="Fermer" className="rounded-lg px-2 py-1 text-xl leading-none text-gray-600 hover:bg-gray-100">×</button>
          </div>
        </div>
        <ul className={`flex-1 space-y-1 overflow-y-auto ${reduit ? "p-1.5" : "p-3"}`}>
          {ENTREES_MENU.map((e) => (
            <li key={e.to}>
              <NavLink to={e.to} title={e.libelle} aria-label={e.libelle}
                className={({ isActive }) => `flex items-center rounded-xl text-sm font-semibold transition ${reduit ? "justify-center px-0 py-3" : "gap-3 px-3 py-3"} ${isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                <span className="text-xl leading-none">{e.icone}</span>
                {!reduit && e.libelle}
              </NavLink>
            </li>
          ))}
        </ul>
        {/* Seule information du site : « Ver X · date » (réduit : « Ver X ») */}
        <p className={`border-t border-gray-200 py-3 text-gray-400 ${reduit ? "px-1 text-center text-[10px]" : "px-4 text-xs"}`}>
          {reduit ? `Ver ${VERSION}` : LIBELLE_VER}
        </p>
      </nav>
    </div>
  );
}
