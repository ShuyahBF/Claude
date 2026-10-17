import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DeconnexionAdmin from "@/components/DeconnexionAdmin";
import DeconnexionInactivite from "@/components/DeconnexionInactivite";
import Layout from "@/components/Layout";
import MiseAJourSite from "@/components/MiseAJourSite";
import ProtectionCaptures from "@/components/ProtectionCaptures";
import RouteProtegee from "@/components/RouteProtegee";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/context/AuthContext";
import Abonnement from "@/pages/Abonnement";
import Admin from "@/pages/Admin";
import Annonceur from "@/pages/Annonceur";
import AdminPresse from "@/pages/AdminPresse";
import Presse from "@/pages/Presse";
import Rappels, { Vers } from "@/pages/Rappels";
import Archives from "@/pages/Archives";
import AdminComptes from "@/pages/AdminComptes";
import AdminMarchands from "@/pages/AdminMarchands";
import MonMarchand from "@/pages/MonMarchand";
import Bientot from "@/pages/Bientot";
import Confidentialite from "@/pages/Confidentialite";
import Connexion from "@/pages/Connexion";
import Garde from "@/pages/Garde";
import Historique from "@/pages/Historique";
import Marchands from "@/pages/Marchands";
import Meteo from "@/pages/Meteo";
import Ordonnances from "@/pages/Ordonnances";
import Payer from "@/pages/Payer";
import Profil from "@/pages/Profil";
import Voix from "@/pages/Voix";

// Routes du site. Tout est réservé aux utilisateurs connectés, sauf la
// connexion, l'inscription et la politique de confidentialité (publique, lot 16) ;
// « /admin » est réservé à l'administrateur.
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          {/* Sécurité (lot 46) : écran flouté sans focus, fermeture après inactivité, déconnexion forcée par l'administrateur */}
          <ProtectionCaptures />
          <DeconnexionInactivite />
          <DeconnexionAdmin />
          <MiseAJourSite />
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
              <Route path="/rappels" element={<Rappels />} />
              {/* Anciennes adresses des rappels (notifications, carte « Aujourd'hui ») : redirigées vers le menu unique */}
              <Route path="/anniversaires" element={<Vers onglet="anniversaires" />} />
              <Route path="/rappels-paiements" element={<Vers onglet="paiements" />} />
              <Route path="/medicaments" element={<Vers onglet="medicaments" />} />
              <Route path="/presse" element={<Presse />} />
              <Route path="/meteo" element={<Meteo />} />
              <Route path="/abonnement" element={<Abonnement />} />
              <Route path="/ordonnances" element={<Ordonnances />} />
              <Route path="/transcription" element={<Voix />} />
              <Route path="/pharmacies-de-garde" element={<Garde />} />
              <Route path="/archives" element={<Archives />} />
              <Route path="/annonceur" element={<Annonceur />} />
              {/* Services du menu latéral (lot 33) : pages d'attente, ouvertes une à une */}
              {["breves"].map((c) => (
                <Route key={c} path={`/${c}`} element={<Bientot />} />
              ))}
              <Route path="/admin" element={<RouteProtegee admin><Admin /></RouteProtegee>} />
              <Route path="/admin/presse" element={<RouteProtegee admin><AdminPresse /></RouteProtegee>} />
              <Route path="/admin/comptes" element={<RouteProtegee admin><AdminComptes /></RouteProtegee>} />
              <Route path="/admin/marchands" element={<RouteProtegee admin><AdminMarchands /></RouteProtegee>} />
              <Route path="/mon-marchand" element={<MonMarchand />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
