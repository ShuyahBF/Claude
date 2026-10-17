import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import RouteProtegee from "@/components/RouteProtegee";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/context/AuthContext";
import Admin from "@/pages/Admin";
import Anniversaires from "@/pages/Anniversaires";
import Bientot from "@/pages/Bientot";
import Confidentialite from "@/pages/Confidentialite";
import Connexion from "@/pages/Connexion";
import Historique from "@/pages/Historique";
import Marchands from "@/pages/Marchands";
import Payer from "@/pages/Payer";
import Profil from "@/pages/Profil";

// Routes du site. Tout est réservé aux utilisateurs connectés, sauf la
// connexion, l'inscription et la politique de confidentialité (publique, lot 16) ;
// « /admin » est réservé à l'administrateur.
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/connexion" element={<Connexion />} />
            <Route path="/inscription" element={<Connexion mode="inscription" />} />
            {/* Page publique déclarée dans la Play Console (lot 16) */}
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route element={<RouteProtegee><Layout /></RouteProtegee>}>
              <Route path="/" element={<Payer />} />
              <Route path="/historique" element={<Historique />} />
              <Route path="/marchands" element={<Marchands />} />
              <Route path="/profil" element={<Profil />} />
              <Route path="/anniversaires" element={<Anniversaires />} />
              {/* Services du menu latéral (lot 33) : pages d'attente, ouvertes une à une */}
              {["pharmacies-de-garde", "rappels-paiements", "medicaments", "ordonnances", "breves", "presse"].map((c) => (
                <Route key={c} path={`/${c}`} element={<Bientot />} />
              ))}
              <Route path="/admin" element={<RouteProtegee admin><Admin /></RouteProtegee>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
