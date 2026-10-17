// ============================================================================
// MenuLateral.jsx — menu glissant (tiroir) à gauche des écrans connectés (lot 33).
//
// Ouvert par le bouton ☰ de l'en-tête ; se ferme au toucher du fond, à la touche Échap, au choix d'une
// entrée ou au changement de page. Il regroupe les services « du quotidien » ; en bas, seule information
// du site : « Ver X · date » (les détails lot / commit / API ne sont plus affichés une fois connecté).
// ============================================================================
import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LIBELLE_VER } from "@/version";

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

export default function MenuLateral({ ouvert, fermer }) {
  const { pathname } = useLocation();

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
      {/* Tiroir : glisse depuis la gauche */}
      <nav aria-label="Menu latéral"
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-primary bg-white transition-transform duration-200 ${ouvert ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <p className="logo-ecrit text-3xl text-accent">Paiement Mobile</p>
          <button type="button" onClick={fermer} aria-label="Fermer" className="rounded-lg px-2 py-1 text-xl leading-none text-gray-600 hover:bg-gray-100">×</button>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-3">
          {ENTREES_MENU.map((e) => (
            <li key={e.to}>
              <NavLink to={e.to}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                <span className="text-xl leading-none">{e.icone}</span>{e.libelle}
              </NavLink>
            </li>
          ))}
        </ul>
        {/* Seule information du site : version et date de déploiement */}
        <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-400">{LIBELLE_VER}</p>
      </nav>
    </div>
  );
}
