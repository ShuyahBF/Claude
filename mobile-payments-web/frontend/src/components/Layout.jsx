import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import AlerteRenforcee from "@/components/AlerteRenforcee";
import ArriveeMarchand from "@/components/ArriveeMarchand";
import MenuLateral from "@/components/MenuLateral";
import SupportSawali from "@/components/SupportSawali";
import VerrouEcran from "@/components/VerrouEcran";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { apiClient } from "@/lib/api";
import { abonnerPush, debloquerAudio, lirePreferences, traiterEvenements } from "@/lib/alertes";

// Menus de l'application (« Payer » est la bulle flottante « + » ; « Support » ouvre le chat SAWALI) (l'entrée « Administration » n'apparaît qu'à l'administrateur)
const MENUS = [
  { to: "/historique", libelle: "Historique", icone: "🕘" },
  { to: "/marchands", libelle: "Marchands", icone: "🏪" },
  { to: "/profil", libelle: "Profil", icone: "👤" },
];

// Mise en page des écrans connectés (lot 71, demande du 18/10/2026) : bandeau vert-bleu avec le nom de l'application, puis une BARRE DE MENU
// HORIZONTALE VERTE ÉPINGLÉE EN HAUT de l'écran : elle reste visible quand on fait défiler la page (téléphone, tablette, ordinateur).
// Elle porte le bouton ☰ (menu complet à gauche) et les entrées principales ; la bulle « + » (Payer) reste en bas à droite.
export default function Layout() {
  const { user, deconnexion } = useAuth();
  const navigate = useNavigate();
  const [menuOuvert, setMenuOuvert] = useState(false);   // menu latéral glissant (lot 33)
  const { pathname } = useLocation();
  const toast = useToast();
  // Rappels du jour (anniversaires, paiements, médicaments) : relus à chaque changement de page et toutes les 30 s.
  // Chaque événement NOUVEAU (heure d'une prise arrivée, paiement à régler, anniversaire) déclenche un son au volume réglé,
  // une vibration, une notification du système (si autorisée) et un message à l'écran (lot 40).
  const [rappels, setRappels] = useState({});
  useEffect(() => {
    let actif = true;
    const lire = () => apiClient.get("/rappels/resume").then(({ data }) => {
      if (!actif) return;
      setRappels(data);
      traiterEvenements(data.evenements, { afficher: (texte) => toast.info(texte) });
    }).catch(() => {});
    lire();
    const t = setInterval(lire, 30000);
    return () => { actif = false; clearInterval(t); };
  }, [pathname, toast]);
  // Notifications push activées sur cet appareil : on confirme l'abonnement au serveur à chaque ouverture (l'adresse peut changer)
  useEffect(() => { if (lirePreferences().notifications) abonnerPush(apiClient); }, []);
  // Le navigateur n'autorise le son qu'après un premier toucher : on débloque l'audio dès le premier clic
  useEffect(() => {
    const debloquer = () => { debloquerAudio(); window.removeEventListener("pointerdown", debloquer); };
    window.addEventListener("pointerdown", debloquer);
    return () => window.removeEventListener("pointerdown", debloquer);
  }, []);
  const menus = user?.role === "admin" ? [...MENUS, { to: "/admin", libelle: "Admin", icone: "⚙️" }] : MENUS;

  const quitter = async () => {
    await deconnexion();
    navigate("/connexion");
  };

  // Une entrée de la barre verte : pastille blanche quand elle est active ; icône au-dessus du texte sur petit écran, à côté sur grand écran
  const style = ({ isActive }) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-semibold uppercase tracking-normal transition sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-xs sm:tracking-wider ${
      isActive ? "bg-white text-nuit-900 shadow" : "text-white/85 hover:bg-white/10 hover:text-white"}`;

  return (
    <div className="flex min-h-screen flex-col pb-24">
      {/* Bandeau vert-bleu : nom écrit à la main au centre sur grand écran, à gauche sur téléphone */}
      <header className="no-print bg-nuit-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:py-5">
          <div className="flex items-center gap-2 sm:contents">
          <NavLink to="/" className="flex items-center gap-2 sm:col-start-2">
            <img src="/icone.svg" alt="" className="h-8 w-8 sm:hidden" />
            <span className="logo-ecrit whitespace-nowrap text-3xl sm:text-6xl">Paiement Mobile</span>
          </NavLink>
          </div>
          <div className="flex items-center gap-3 text-sm sm:col-start-3 sm:justify-self-end">
            <span className="hidden text-gray-200 md:inline">{user?.prenom || user?.nom}</span>
            <button type="button" onClick={quitter} className="btn-clair btn-sm">Déconnexion</button>
          </div>
        </div>
      </header>

      {/* BARRE DE MENU verte, ÉPINGLÉE en haut (sticky) : ☰ à gauche, puis les entrées principales (lot 71) */}
      <div className="no-print sticky top-0 z-40 border-t border-white/10 bg-nuit-900 text-white shadow-md">
        <nav aria-label="Menu principal" className="mx-auto flex max-w-5xl items-center gap-1 px-2 py-1.5 sm:px-4">
          {/* Bouton ☰ : ouvre le menu complet (à gauche), avec le point rouge des rappels à traiter */}
          <button type="button" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu" aria-expanded={menuOuvert}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg text-2xl leading-none text-white hover:bg-white/10">
            ☰{rappels.total > 0 && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-nuit-900" aria-label={`${rappels.total} rappel(s) à traiter`} />}
          </button>
          <div className="flex min-w-0 flex-1 gap-0.5 sm:justify-center">
            {/* Onglet Support SAWALI : masqué si SAWALI n'est pas relié */}
            <SupportSawali variante="menu" classeMenu={style({ isActive: false })} />
            {menus.map((m) => (
              <NavLink key={m.to} to={m.to} end={m.fin} className={style}>
                <span className="text-lg leading-none">{m.icone}</span>{m.libelle}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
        <VerrouEcran />
        <ArriveeMarchand />
        <AlerteRenforcee />
      </main>

      {/* Pied de page : lien vers la politique de confidentialité (lot 16). La version est dans le menu latéral (lot 33) */}
      <footer className="no-print py-3 text-center text-xs text-gray-400">
        <NavLink to="/confidentialite" className="underline hover:text-gray-600">Confidentialité</NavLink>
      </footer>

      <MenuLateral ouvert={menuOuvert} fermer={() => setMenuOuvert(false)} compteurs={rappels} />

      {/* Bulle flottante « + » = Payer : en bas à droite (la barre de menu est maintenant en haut) */}
      <NavLink to="/" end aria-label="Payer" title="Payer"
        className="no-print fixed right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-primary text-4xl font-light leading-none text-white shadow-2xl ring-4 ring-white transition hover:bg-primary-dark active:scale-95"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        +
      </NavLink>
    </div>
  );
}
