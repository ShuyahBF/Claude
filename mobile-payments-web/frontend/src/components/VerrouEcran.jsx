import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChampMotDePasse from "@/components/ChampMotDePasse";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";
import { empreinteConnexionMemorisee, empreinteConnexionRetrouver } from "@/lib/pontAndroid";
import { ecrireDrapeau, lireDrapeau } from "@/lib/verrouEtat";

// ============================================================================
// VERROU DE L'ÉCRAN (lot 64) — téléphone laissé dans les mains des enfants.
// Quand la page perd le focus (autre onglet, autre application, écran éteint, appel entrant), le moment du départ est noté.
// Au RETOUR :
//   - absence plus courte que le délai réglé par l'administrateur (Admin → Comptes, 30 s par défaut) : l'écran se rouvre tout seul ;
//   - absence plus longue (ou délai 0 = toujours) : l'écran reste FLOUTÉ et le mot de passe du compte est redemandé.
// Le drapeau du verrou est EFFACÉ à chaque connexion, inscription, déconnexion ou perte de session (lib/verrouEtat.js) : une session qui expire
// pendant le verrou ne verrouille plus la connexion suivante.
// Le verrou survit à un rechargement de la page (drapeau dans sessionStorage) : F5 ne le contourne pas. Pendant le verrou, tout le
// contenu est inerte (ni toucher, ni clavier, ni lecteur d'écran). « Se déconnecter » reste possible.
// Les fenêtres ouvertes par le site lui-même (confirmation, sélecteur de fichier) ne comptent PAS comme un départ : la tolérance
// est partagée avec ProtectionCaptures (window.__mpwTolerance).
// Monté une seule fois dans Layout (pages connectées) ; la page de connexion n'a pas de compte à protéger.
// ============================================================================
const DELAI_DEFAUT_S = 30;

export default function VerrouEcran() {
  const { user, deconnexion } = useAuth();
  const [delaiS, setDelaiS] = useState(DELAI_DEFAUT_S);
  const [verrouille, setVerrouille] = useState(lireDrapeau);
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const parti = useRef(null);                     // horodatage (ms) du départ de la page, ou null
  const delaiRef = useRef(DELAI_DEFAUT_S);

  // Délai réglé par l'administrateur, relu à chaque connexion
  const idUtilisateur = user?.id;
  useEffect(() => {
    if (!idUtilisateur) return undefined;
    let annule = false;
    apiClient.get("/auth/verrou").then(({ data }) => { if (!annule) { setDelaiS(data.secondes); delaiRef.current = data.secondes; } }).catch(() => { /* délai par défaut */ });
    return () => { annule = true; };
  }, [idUtilisateur]);

  const verrouiller = useCallback(() => { ecrireDrapeau(true); setVerrouille(true); }, []);

  // Surveillance des départs et des retours
  useEffect(() => {
    if (!idUtilisateur) return undefined;
    // Un départ pendant une fenêtre du site ou du téléphone (empreinte, code) n'en est pas un : même tolérance pour le blur ET la visibilité
    const depart = () => { if (Date.now() < (window.__mpwTolerance || 0)) return; if (parti.current === null) parti.current = Date.now(); };
    const retour = () => {
      if (parti.current === null) return;
      const absence = Date.now() - parti.current;
      parti.current = null;
      const delai = delaiRef.current * 1000;
      if (delai === 0 || absence >= delai) verrouiller();
    };
    const surBlur = () => {
      // Départ provoqué par le site lui-même (confirmation, sélecteur de fichier) : ignoré
      if (Date.now() < (window.__mpwTolerance || 0)) return;
      setTimeout(() => {
        if (Date.now() < (window.__mpwTolerance || 0)) return;
        if (document.activeElement?.tagName === "IFRAME") return;      // clic dans une maquette du site
        if (!document.hasFocus() || document.hidden) depart();
      }, 0);
    };
    const surVisibilite = () => { if (document.hidden) depart(); else if (document.hasFocus()) retour(); };
    const surFocus = () => { if (!document.hidden) retour(); };
    window.addEventListener("blur", surBlur);
    window.addEventListener("focus", surFocus);
    window.addEventListener("pageshow", surFocus);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.removeEventListener("blur", surBlur);
      window.removeEventListener("focus", surFocus);
      window.removeEventListener("pageshow", surFocus);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [idUtilisateur, verrouiller]);

  // Pendant le verrou : tout le contenu de la page est inerte (aucun toucher, aucune touche, aucun lecteur d'écran)
  useEffect(() => {
    const racine = document.getElementById("root");
    if (!racine) return undefined;
    racine.inert = verrouille;
    return () => { racine.inert = false; };
  }, [verrouille]);

  const deverrouiller = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");
    try {
      await apiClient.post("/auth/deverrouiller", { mot_de_passe: mdp });
      ecrireDrapeau(false);
      setVerrouille(false);
      setMdp("");
    } catch (err) { setErreur(messageErreur(err, "Mot de passe incorrect")); } finally { setEnvoi(false); }
  };
  // Lot 120.6 — EMPREINTE : si le téléphone a l'empreinte de connexion activée (application Android), le doigt remplace le mot de passe. L'invite s'ouvre toute seule
  // dès que l'écran se verrouille ; en cas d'échec ou d'annulation, le mot de passe reste possible juste en dessous.
  const peutEmpreinte = verrouille && !!idUtilisateur && empreinteConnexionMemorisee();
  const [empreinteEnCours, setEmpreinteEnCours] = useState(false);
  const deverrouillerParEmpreinte = useCallback(async () => {
    setErreur(""); setEmpreinteEnCours(true);
    try {
      const r = await empreinteConnexionRetrouver();
      if (!r?.secret) { setErreur(r?.erreur || "Empreinte non reconnue : tapez votre mot de passe."); return; }
      await apiClient.post("/auth/empreinte/deverrouiller", { id: r.id, secret: r.secret });
      ecrireDrapeau(false); setVerrouille(false); setMdp("");
    } catch (err) { setErreur(messageErreur(err, "Empreinte non reconnue : tapez votre mot de passe.")); } finally { setEmpreinteEnCours(false); }
  }, []);
  useEffect(() => { if (peutEmpreinte) deverrouillerParEmpreinte(); /* une seule fois à chaque verrouillage */ // eslint-disable-next-line
  }, [peutEmpreinte]);
  const quitter = async () => {
    ecrireDrapeau(false);
    try { await deconnexion(); } catch { /* session déjà fermée */ }
    window.location.assign("/connexion");
  };

  if (!idUtilisateur || !verrouille) return null;
  // Rendu hors de #root (qui est inerte) : voile flouté plein écran + carte de déverrouillage
  return createPortal(
    <div className="no-print fixed inset-0 z-[2147483646] grid place-items-center p-4 backdrop-blur-2xl" style={{ background: "rgba(247, 245, 243, 0.9)", WebkitBackdropFilter: "blur(28px)" }} role="dialog" aria-modal="true" aria-label="Écran verrouillé">
      <form onSubmit={deverrouiller} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-center text-3xl" aria-hidden="true">🔒</p>
        <h2 className="text-center text-lg font-bold">Écran verrouillé</h2>
        <p className="text-center text-sm text-gray-600">Vous avez quitté la page. {peutEmpreinte ? "Posez votre doigt ou saisissez" : "Saisissez"} le mot de passe de votre compte pour continuer.</p>
        {peutEmpreinte && (
          <button type="button" className="btn-primary w-full inline-flex items-center justify-center gap-2" disabled={empreinteEnCours} onClick={deverrouillerParEmpreinte} data-testid="deverrouiller-empreinte">
            <span aria-hidden="true">🖐️</span> {empreinteEnCours ? "Patientez…" : "Déverrouiller avec l'empreinte"}
          </button>
        )}
        <ChampMotDePasse className="input" autoFocus required autoComplete="current-password" placeholder="Mot de passe" value={mdp} onChange={(e) => setMdp(e.target.value)} aria-label="Mot de passe du compte" />
        {erreur && <p className="text-sm text-red-700" role="alert">{erreur}</p>}
        <button type="submit" className="btn-primary w-full" disabled={envoi || !mdp}>{envoi ? "Patientez…" : "Déverrouiller"}</button>
        <button type="button" className="btn-outline w-full" onClick={quitter}>Se déconnecter</button>
        <p className="text-center text-xs text-gray-400">Délai réglé par l'administrateur : {delaiS === 0 ? "mot de passe à chaque retour" : `${delaiS} s hors de la page`}.</p>
      </form>
    </div>,
    document.body,
  );
}
