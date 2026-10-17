import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

// Installer l'application sur Android (lot 69) : Paiement Mobile s'installe comme une vraie application (icône sur l'écran d'accueil,
// ouverture plein écran, sans barre d'adresse). Chrome propose l'installation par un événement « beforeinstallprompt » : on le garde
// de côté et on l'offre sur un bouton. Si le navigateur ne le propose pas (iPhone, Firefox, déjà installée…), on affiche les gestes à faire.
export default function Installer() {
  const toast = useToast();
  const [invite, setInvite] = useState(window.__mpwInvite || null);
  const [installee, setInstallee] = useState(
    window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true,
  );

  useEffect(() => {
    // Chrome Android déclenche cet événement quand le site est installable
    const surInvite = (e) => { e.preventDefault(); window.__mpwInvite = e; setInvite(e); };
    const surInstallation = () => { window.__mpwInvite = null; setInvite(null); setInstallee(true); toast.succes("Application installée"); };
    window.addEventListener("beforeinstallprompt", surInvite);
    window.addEventListener("appinstalled", surInstallation);
    return () => { window.removeEventListener("beforeinstallprompt", surInvite); window.removeEventListener("appinstalled", surInstallation); };
  }, [toast]);

  const installer = async () => {
    if (!invite) return;
    invite.prompt();
    try { await invite.userChoice; } catch { /* choix ignoré */ }
    window.__mpwInvite = null; setInvite(null);
  };

  const estIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">📲 Installer sur Android</h1>
      <section className="card space-y-3">
        {installee ? (
          <p className="font-medium text-green-700">✅ Paiement Mobile est déjà installée sur cet appareil.</p>
        ) : invite ? (
          <>
            <p>Ajoutez Paiement Mobile à votre écran d'accueil : elle s'ouvre en plein écran, comme une application.</p>
            <button type="button" className="btn-primary" onClick={installer}>Installer l'application</button>
          </>
        ) : estIphone ? (
          <ol className="list-decimal space-y-1 pl-5">
            <li>Ouvrez ce site dans <b>Safari</b>.</li>
            <li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li>
            <li>Choisissez <b>Sur l'écran d'accueil</b>.</li>
          </ol>
        ) : (
          <>
            <p>Sur Android, avec <b>Chrome</b> :</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Touchez le menu <b>⋮</b> en haut à droite.</li>
              <li>Choisissez <b>Installer l'application</b> (ou <b>Ajouter à l'écran d'accueil</b>).</li>
              <li>Confirmez : l'icône Paiement Mobile apparaît sur votre écran d'accueil.</li>
            </ol>
            <p className="text-sm text-gray-500">Le bouton d'installation direct n'apparaît que dans Chrome, quand le site est ouvert depuis une adresse sécurisée.</p>
          </>
        )}
      </section>
      <p className="text-xs text-gray-500">L'application reste toujours à jour toute seule : elle charge la dernière version du site à chaque ouverture, et un bandeau « Mettre à jour » apparaît si une nouvelle version est publiée.</p>
    </div>
  );
}
