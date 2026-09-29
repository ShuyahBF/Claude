import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Menus de l'application (l'entrée « Administration » n'apparaît qu'à l'administrateur)
const MENUS = [
  { to: "/", libelle: "Payer", icone: "💳", fin: true },
  { to: "/historique", libelle: "Historique", icone: "🕘" },
  { to: "/marchands", libelle: "Marchands", icone: "🏪" },
  { to: "/profil", libelle: "Profil", icone: "👤" },
];

// Mise en page des écrans connectés : bandeau bleu nuit en haut, menu en
// onglets (en bas de l'écran sur téléphone, en haut sur ordinateur).
export default function Layout() {
  const { user, deconnexion } = useAuth();
  const navigate = useNavigate();
  const menus = user?.role === "admin" ? [...MENUS, { to: "/admin", libelle: "Admin", icone: "⚙️" }] : MENUS;

  const quitter = async () => {
    await deconnexion();
    navigate("/connexion");
  };

  const style = ({ isActive }) =>
    `flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium sm:flex-none sm:flex-row sm:gap-2 sm:rounded-lg sm:px-3 sm:text-sm ${
      isActive ? "text-primary sm:bg-white/10 sm:text-white" : "text-gray-500 sm:text-gray-300 sm:hover:text-white"}`;

  return (
    <div className="flex min-h-screen flex-col pb-16 sm:pb-0">
      <header className="no-print bg-nuit-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/icone.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-lg font-bold">Paiement Mobile</span>
          </NavLink>
          {/* Menu en haut sur ordinateur */}
          <nav className="hidden items-center gap-1 sm:flex">
            {menus.map((m) => <NavLink key={m.to} to={m.to} end={m.fin} className={style}>{m.icone} {m.libelle}</NavLink>)}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-300 md:inline">{user?.prenom || user?.nom}</span>
            <button type="button" onClick={quitter} className="btn-clair btn-sm">Déconnexion</button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      {/* Menu en bas de l'écran sur téléphone (comme une application) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white sm:hidden">
        {menus.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.fin} className={style}>
            <span className="text-lg">{m.icone}</span>{m.libelle}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
