import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LIBELLE_VERSION } from "@/version";

// Menus de l'application (l'entrée « Administration » n'apparaît qu'à l'administrateur)
const MENUS = [
  { to: "/", libelle: "Payer", icone: "💳", fin: true },
  { to: "/historique", libelle: "Historique", icone: "🕘" },
  { to: "/marchands", libelle: "Marchands", icone: "🏪" },
  { to: "/profil", libelle: "Profil", icone: "👤" },
];

// Mise en page des écrans connectés : bandeau bleu nuit en haut et MENU FLOTTANT collé au bas de l'écran,
// identique sur téléphone, tablette et ordinateur (règle du 17/10/2026).
export default function Layout() {
  const { user, deconnexion } = useAuth();
  const navigate = useNavigate();
  const menus = user?.role === "admin" ? [...MENUS, { to: "/admin", libelle: "Admin", icone: "⚙️" }] : MENUS;

  const quitter = async () => {
    await deconnexion();
    navigate("/connexion");
  };

  // Un onglet du menu flottant : pastille bleue quand il est actif ; icône au-dessus du texte sur petit écran, à côté sur grand écran
  const style = ({ isActive }) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold uppercase tracking-normal transition sm:flex-none sm:flex-row sm:gap-2 sm:px-5 sm:text-xs sm:tracking-wider ${
      isActive ? "bg-primary text-white shadow" : "text-gray-600 hover:bg-gray-100"}`;

  return (
    <div className="flex min-h-screen flex-col pb-28">
      {/* Bandeau vert-bleu : nom écrit à la main au centre sur grand écran, à gauche sur téléphone */}
      <header className="no-print bg-nuit-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:py-5">
          <NavLink to="/" className="flex items-center gap-2 sm:col-start-2">
            <img src="/icone.svg" alt="" className="h-8 w-8 sm:hidden" />
            <span className="logo-ecrit whitespace-nowrap text-3xl sm:text-6xl">Paiement Mobile</span>
          </NavLink>
          <div className="flex items-center gap-3 text-sm sm:col-start-3 sm:justify-self-end">
            <span className="hidden text-gray-200 md:inline">{user?.prenom || user?.nom}</span>
            <button type="button" onClick={quitter} className="btn-clair btn-sm">Déconnexion</button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      {/* Pied de page de toutes les pages connectées : version et date de déploiement */}
      {/* + lien vers la politique de confidentialité (lot 16) */}
      <footer className="no-print py-3 text-center text-xs text-gray-400">
        {LIBELLE_VERSION}
        {" · "}<NavLink to="/confidentialite" className="underline hover:text-gray-600">Confidentialité</NavLink>
      </footer>

      {/* Menu FLOTTANT, toujours aligné sur le bas de l'écran (tous appareils) ; la marge basse respecte la zone de geste des téléphones */}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <nav aria-label="Menu principal"
          className="pointer-events-auto flex w-full max-w-md gap-0.5 overflow-hidden rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-xl backdrop-blur sm:w-auto sm:max-w-none">
          {menus.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.fin} className={style}>
              <span className="text-lg leading-none">{m.icone}</span>{m.libelle}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
