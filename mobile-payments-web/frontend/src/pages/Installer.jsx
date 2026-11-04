import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PictoInstallation from "@/components/PictoInstallation";
import QrCode from "@/components/QrCode";
import { detecterEnvironnement, estInstallee, guideInstallation } from "@/lib/installation";

// ============================================================================
// PAGE D'INSTALLATION d'auRor — PUBLIQUE (aucune connexion requise) : /installer
// ============================================================================
// Pensée pour une personne peu familière avec la technologie, qui reçoit souvent le lien par WhatsApp :
//  - un seul grand bouton quand le navigateur sait installer en un geste (Chrome, Edge, Samsung Internet…) ;
//  - sinon 3 étapes illustrées, adaptées au téléphone et au navigateur reconnus (lib/installation.js, testé) ;
//  - lien ouvert dans Facebook / Instagram / TikTok… : on explique d'abord comment l'ouvrir dans le vrai navigateur ;
//  - déjà installée : on le dit et on propose de l'ouvrir ;
//  - boutons « Copier le lien » et « Envoyer par WhatsApp » pour aider un proche ; QR code sur ordinateur.
// L'invitation d'installation de Chrome (« beforeinstallprompt ») est gardée par main.jsx dans window.__mpwInvite.
// ============================================================================
const NOM_APP = "auRor";
const LIEN = `${window.location.origin}/installer`;

export default function Installer() {
  const [invite, setInvite] = useState(window.__mpwInvite || null);
  const [installee, setInstallee] = useState(estInstallee(window));
  const [copie, setCopie] = useState(false);

  // Identité du navigateur et étapes à montrer (recalculées quand l'invitation d'installation arrive)
  const env = useMemo(() => detecterEnvironnement(navigator.userAgent, { pointsTactiles: navigator.maxTouchPoints }), []);
  const guide = useMemo(() => guideInstallation(env, { nomApp: NOM_APP, invitePrete: !!invite, ipad: /iPad/.test(navigator.userAgent) || (env.systeme === "ios" && /Macintosh/.test(navigator.userAgent)) }), [env, invite]);

  useEffect(() => {
    // Chrome déclenche cet événement quand le site est installable ; « appinstalled » quand l'installation est faite
    const surInvite = (e) => { e.preventDefault(); window.__mpwInvite = e; setInvite(e); };
    const surInstallation = () => { window.__mpwInvite = null; setInvite(null); setInstallee(true); };
    window.addEventListener("beforeinstallprompt", surInvite);
    window.addEventListener("appinstalled", surInstallation);
    return () => { window.removeEventListener("beforeinstallprompt", surInvite); window.removeEventListener("appinstalled", surInstallation); };
  }, []);

  // Installation en un geste (Chrome, Edge, Samsung Internet…)
  const installer = async () => {
    if (!invite) return;
    invite.prompt();
    try { await invite.userChoice; } catch { /* choix ignoré */ }
    window.__mpwInvite = null; setInvite(null);
  };

  // Copie du lien (repli : sélection manuelle si le navigateur refuse)
  const copier = async () => {
    try { await navigator.clipboard.writeText(LIEN); setCopie(true); setTimeout(() => setCopie(false), 3000); }
    catch { window.prompt("Copiez ce lien :", LIEN); }
  };
  const partager = async () => {
    if (navigator.share) { try { await navigator.share({ title: `Installer ${NOM_APP}`, text: `Installez ${NOM_APP} sur votre téléphone :`, url: LIEN }); } catch { /* annulé */ } }
  };
  const lienWhatsapp = `https://wa.me/?text=${encodeURIComponent(`Installez ${NOM_APP} sur votre téléphone : ${LIEN}`)}`;

  return (
    <div className="min-h-screen bg-creme">
      <header className="bg-nuit-900 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-4">
          <img src="/auror-mot-blanc.webp" alt={NOM_APP} className="h-10 w-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Installer {NOM_APP} sur votre téléphone</h1>
          <p className="mt-1 text-base text-gray-700">Gratuit, rapide, sans passer par le Play Store. Aucune place à libérer : l'application est très légère.</p>
        </div>

        {/* Déjà installée */}
        {installee ? (
          <section className="card space-y-3" data-testid="installee">
            <p className="text-lg font-semibold text-green-700">✅ {NOM_APP} est déjà installée sur cet appareil.</p>
            <Link to="/" className="btn-primary w-full text-lg">Ouvrir {NOM_APP}</Link>
          </section>
        ) : (
          <section className="card space-y-4" data-testid="guide-installation">
            <h2 className="text-lg font-bold">{guide.titre}</h2>
            <p className="text-base text-gray-700">{guide.intro}</p>

            {/* Un seul geste */}
            {guide.mode === "direct" && (
              <button type="button" onClick={installer} className="btn-primary w-full py-4 text-xl" data-testid="bouton-installer">Installer {NOM_APP}</button>
            )}

            {/* Étapes illustrées */}
            {guide.etapes.length > 0 && (
              <ol className="space-y-3">
                {guide.etapes.map((etape, i) => (
                  <li key={etape.texte} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white" aria-hidden="true">{i + 1}</span>
                    <p className="flex-1 pt-1 text-base">{etape.texte}</p>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-nuit-900 text-white"><PictoInstallation nom={etape.icone} taille={28} /></span>
                  </li>
                ))}
              </ol>
            )}

            {guide.conseil && <p className="rounded-xl bg-blue-50 p-3 text-sm text-gray-700">💡 {guide.conseil}</p>}
          </section>
        )}

        {/* Aider un proche / changer de navigateur */}
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Envoyer ce lien</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copier} className="btn-outline" data-testid="copier-lien">{copie ? "✅ Lien copié" : "📋 Copier le lien"}</button>
            <a href={lienWhatsapp} target="_blank" rel="noreferrer" className="btn-outline">💬 Envoyer par WhatsApp</a>
            {navigator.share && <button type="button" onClick={partager} className="btn-outline">📤 Partager…</button>}
          </div>
          {/* Sur ordinateur : on scanne avec le téléphone */}
          {env.systeme === "ordinateur" && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <QrCode valeur={LIEN} taille={200} alt="QR code de la page d'installation" />
              <p className="text-center text-sm text-gray-600">Scannez ce QR code avec l'appareil photo de votre téléphone.</p>
            </div>
          )}
        </section>

        {/* Questions fréquentes */}
        <section className="card space-y-3 text-sm">
          <h2 className="text-lg font-bold">Un souci ?</h2>
          <details><summary className="cursor-pointer font-semibold">Je ne vois pas l'option « Installer »</summary>
            <p className="mt-1 text-gray-700">Rechargez la page une fois, puis recommencez. Vérifiez que vous utilisez Chrome (Android) ou Safari (iPhone), et que vous avez ouvert le lien en entier.</p></details>
          <details><summary className="cursor-pointer font-semibold">Où est l'application après l'installation ?</summary>
            <p className="mt-1 text-gray-700">Sur l'écran d'accueil de votre téléphone, avec l'icône {NOM_APP}, comme vos autres applications. Sur Android, elle est aussi dans la liste de toutes les applications.</p></details>
          <details><summary className="cursor-pointer font-semibold">Faut-il la mettre à jour ?</summary>
            <p className="mt-1 text-gray-700">Non. {NOM_APP} se met à jour toute seule à chaque ouverture, quand vous avez Internet.</p></details>
          <details><summary className="cursor-pointer font-semibold">Comment la désinstaller ?</summary>
            <p className="mt-1 text-gray-700">Appuyez longuement sur l'icône {NOM_APP} puis choisissez « Désinstaller » ou « Supprimer ». Vos données restent sur votre compte ; pour les effacer : <Link to="/suppression-compte" className="underline">supprimer mon compte</Link>.</p></details>
        </section>

        <p className="text-center text-sm"><Link to="/connexion" className="font-semibold text-primary">← Retour à la connexion</Link></p>
      </main>
    </div>
  );
}
