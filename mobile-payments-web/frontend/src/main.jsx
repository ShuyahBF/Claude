import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Application installable (lot 69) : le « service worker » est enregistré dès l'ouverture du site (condition d'installation sur Android,
// page « Pas de connexion » et notifications). Un échec (navigateur ancien, mode privé) est sans conséquence.
// Lot 74 : enregistré DÈS le démarrage du site (et non après l'événement « load ») : le service worker est alors déjà actif quand les outils
// d'analyse (PWABuilder) et le navigateur contrôlent la page, au lieu de l'être quelques secondes plus tard.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Garde l'invitation d'installation de Chrome même si l'utilisateur n'est pas encore sur la page « Installer sur Android »
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__mpwInvite = e; });
