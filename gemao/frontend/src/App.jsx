import { createContext, useContext, useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { api, session } from "./lib/api.js";
import { titreMenu } from "./lib/tri.js";
import { FournisseurToasts } from "./components/Toasts.jsx";
import Connexion from "./pages/Connexion.jsx";
import TableauDeBord from "./pages/TableauDeBord.jsx";
import Equipements from "./pages/Equipements.jsx";
import Interventions from "./pages/Interventions.jsx";
import Stock from "./pages/Stock.jsx";
import Preventif from "./pages/Preventif.jsx";
import Utilisateurs from "./pages/Utilisateurs.jsx";
import WhatsApp from "./pages/WhatsApp.jsx";
import Clients from "./pages/Clients.jsx";

const Moi = createContext(null);
export const useMoi = () => useContext(Moi);

// Menu selon le rôle ; libellés en « Majuscule À Chaque Mot » (règle 18) via titreMenu.
const MENU = [
  ["/", "tableau de bord", ["admin", "technicien"]],
  ["/interventions", "interventions", ["admin", "technicien", "demandeur"]],
  ["/equipements", "équipements", ["admin", "technicien", "demandeur"]],
  ["/stock", "pièces et stock", ["admin", "technicien"]],
  ["/preventif", "maintenance préventive", ["admin", "technicien"]],
  ["/utilisateurs", "utilisateurs", ["admin"]],
  ["/whatsapp", "whatsapp", ["admin", "technicien"]],
  ["/clients", "clients et clés hmac", ["super_admin"]],
];

function Cadre() {
  const [moi, setMoi] = useState(null);
  const [clients, setClients] = useState([]);
  const nav = useNavigate();
  useEffect(() => {
    if (!session.jeton()) { nav("/connexion"); return; }
    api("/auth/moi").then(async (u) => {
      setMoi(u);
      if (u.role === "super_admin") setClients(await api("/clients"));
    }).catch(() => nav("/connexion"));
  }, [nav]);
  if (!moi) return <p className="vide">Chargement…</p>;
  const superAdmin = moi.role === "super_admin";
  const sortir = () => { session.definir(""); session.choisirClient(""); nav("/connexion"); };
  return (
    <Moi.Provider value={moi}>
      <div className="mise-en-page">
        <aside>
          <div className="logo">GeMAO</div>
          <div className="client">{superAdmin ? (
            // Liste déroulante des clients : le super-administrateur choisit celui dont il voit les données
            <select value={session.client()} onChange={(e) => { session.choisirClient(e.target.value); window.location.reload(); }}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>) : moi.client?.nom}</div>
          <nav>{MENU.filter(([, , roles]) => roles.includes(moi.role)).map(([a, l]) =>
            <NavLink key={a} to={a} end={a === "/"}>{titreMenu(l)}</NavLink>)}</nav>
          <div className="pied"><div>{moi.nom}</div><button onClick={sortir}>Déconnexion</button></div>
        </aside>
        <main><Outlet /></main>
      </div>
    </Moi.Provider>
  );
}

export default function App() {
  return (
    <FournisseurToasts>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route element={<Cadre />}>
            <Route index element={<TableauDeBord />} />
            <Route path="interventions" element={<Interventions />} />
            <Route path="equipements" element={<Equipements />} />
            <Route path="stock" element={<Stock />} />
            <Route path="preventif" element={<Preventif />} />
            <Route path="utilisateurs" element={<Utilisateurs />} />
            <Route path="whatsapp" element={<WhatsApp />} />
            <Route path="clients" element={<Clients />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </FournisseurToasts>
  );
}
