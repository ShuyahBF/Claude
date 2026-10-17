// ============================================================================
// SupportSawali.jsx — icône d'assistance + fenêtre de discussion avec le support
// SAWALI (lot 24).
//
// Deux présentations (prop `variante`) :
//   - "carte" : petite icône posée en bas à droite de la fenêtre de connexion ;
//   - "menu"  : onglet du menu flottant (écrans connectés), à la place de « Payer ».
// Les messages partent vers CE serveur (/api/support-sawali/…) qui les relaie à SAWALI
// par une requête signée : aucun secret dans le navigateur. Un visiteur non connecté
// est identifié par un code aléatoire gardé dans le navigateur (localStorage) + le nom
// et le contact qu'il saisit. Fenêtre ouverte : le fil est relu toutes les 5 s ;
// fermée : une pastille rouge compte les réponses non lues (vérification toutes les 60 s)
// et un SON est joué à chaque nouvelle réponse. L'icône reste cachée si la clé SAWALI est absente.
// ============================================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";
import Patientez from "@/components/Patientez";

const RAFRAICHIR_OUVERT_MS = 5000;
const RAFRAICHIR_FERME_MS = 60000;
const CLE_VISITEUR = "mpw_visiteur_support";
const CLE_COORD = "mpw_coordonnees_support";

// Numéro au format international « +22670000000 » (même règle que le serveur, ussd.py) ; null si invalide.
// « 70 00 00 00 » (8 chiffres) reçoit l'indicatif du Burkina Faso 226 ; « + » ou « 00 » = numéro étranger (8 à 15 chiffres).
function normaliserTelephone(brut) {
  const texte = (brut || "").trim();
  let chiffres = texte.replace(/\D/g, "");
  if (texte.startsWith("00")) chiffres = chiffres.slice(2);
  else if (!texte.startsWith("+") && chiffres.length === 8) chiffres = `226${chiffres}`;
  return chiffres.length >= 8 && chiffres.length <= 15 ? `+${chiffres}` : null;
}

// Les relectures du fil sont silencieuses : seul l'envoi d'un message affiche « Patientez… »
const EN_ARRIERE_PLAN = {};

// Code aléatoire du visiteur, créé une fois puis relu dans le navigateur
function codeVisiteur() {
  try {
    let v = localStorage.getItem(CLE_VISITEUR);
    if (!v) {
      v = (crypto.randomUUID?.() || `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem(CLE_VISITEUR, v);
    }
    return v;
  } catch { return "anonyme-navigateur"; }
}

// Son de notification (3 notes montantes) : autorisé après un premier clic
let contexteAudio = null;
function jouerSon() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    contexteAudio = contexteAudio || new Ctx();
    if (contexteAudio.state === "suspended") contexteAudio.resume().catch(() => {});
    const t0 = contexteAudio.currentTime + 0.02;
    [[659.25, 0, 0.18], [783.99, 0.14, 0.18], [1046.5, 0.28, 0.32]].forEach(([f, debut, duree]) => {
      const osc = contexteAudio.createOscillator();
      const env = contexteAudio.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t0 + debut);
      env.gain.setValueAtTime(0.0001, t0 + debut);
      env.gain.exponentialRampToValueAtTime(0.5, t0 + debut + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + debut + duree);
      osc.connect(env); env.connect(contexteAudio.destination);
      osc.start(t0 + debut); osc.stop(t0 + debut + duree + 0.02);
    });
  } catch { /* son impossible : sans importance */ }
}

const heure = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};
const ETATS = { attente: "⏳ En attente du support", active: "💬 En cours", terminee: "✅ Terminée" };

// Pictogramme « casque d'assistance »
const Casque = ({ taille = 20 }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
    <path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /><path d="M18 17v1a3 3 0 0 1-3 3h-3" />
  </svg>
);

export default function SupportSawali({ variante = "carte", classeMenu = "" }) {
  const { user } = useAuth();                      // connecté : nom et numéro du compte, non modifiables
  const [actif, setActif] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [nouveau, setNouveau] = useState(false);   // réponse arrivée fenêtre déployée : la fenêtre clignote jusqu'au prochain geste
  const [reduit, setReduit] = useState(false);
  const boutonMenu = useRef(null);                 // onglet « Support » du menu : la barre rabattue se pose juste au-dessus
  const [posBarre, setPosBarre] = useState(null);  // { left, bottom } de la barre rabattue (px)   // fenêtre rabattue : seule une petite barre reste visible
  const [messages, setMessages] = useState([]);
  const [requete, setRequete] = useState(null);
  const [nonLus, setNonLus] = useState(0);
  const [texte, setTexte] = useState("");
  const [coord, setCoord] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CLE_COORD)) || { nom: "", contact: "" }; } catch { return { nom: "", contact: "" }; }
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const visiteur = useRef(codeVisiteur()).current;
  const dernierRef = useRef("");
  const nonLusRef = useRef(0);
  const filRef = useRef(null);

  // L'icône n'apparaît que si la plateforme est reliée à SAWALI
  useEffect(() => {
    apiClient.get("/support-sawali/etat", EN_ARRIERE_PLAN).then((r) => setActif(!!r.data?.actif)).catch(() => setActif(false));
  }, []);

  // Lecture du fil (fenêtre ouverte)
  const lireFil = useCallback(async () => {
    try {
      const r = await apiClient.post("/support-sawali/fil", { visiteur, depuis: dernierRef.current || null, marquer_lu: true }, EN_ARRIERE_PLAN);
      const nouveaux = r.data?.messages || [];
      if (nouveaux.length) {
        if (dernierRef.current && nouveaux.some((m) => m.de === "support")) { jouerSon(); setNouveau(true); }
        dernierRef.current = nouveaux[nouveaux.length - 1].le;
        setMessages((avant) => {
          const connus = new Set(avant.map((m) => m.id));
          return [...avant, ...nouveaux.filter((m) => !connus.has(m.id))];
        });
      }
      setRequete(r.data?.requete || null);
      setNonLus(0); nonLusRef.current = 0;
      setErreur("");
    } catch (e) {
      setErreur(messageErreur(e, "Support SAWALI injoignable : réessayez dans un instant."));
    }
  }, [visiteur]);

  // Fenêtre fermée : simple comptage des réponses non lues
  const verifierNonLus = useCallback(async () => {
    try {
      const r = await apiClient.post("/support-sawali/fil", { visiteur, depuis: dernierRef.current || null, marquer_lu: false }, EN_ARRIERE_PLAN);
      const n = r.data?.non_lus || 0;
      if (n > nonLusRef.current) jouerSon();
      nonLusRef.current = n;
      setNonLus(n);
    } catch { /* silencieux */ }
  }, [visiteur]);

  useEffect(() => {
    if (!actif) return undefined;
    const deploye = ouvert && !reduit;
    const action = deploye ? lireFil : verifierNonLus;
    action();
    // Fenêtre déployée ou rabattue : relecture toutes les 5 s (le clignotement doit être rapide)
    const minuterie = setInterval(action, ouvert ? RAFRAICHIR_OUVERT_MS : RAFRAICHIR_FERME_MS);
    return () => clearInterval(minuterie);
  }, [actif, ouvert, reduit, lireFil, verifierNonLus]);

  useEffect(() => {
    if (!nouveau) return undefined;
    const t = setTimeout(() => setNouveau(false), 15000);   // au plus 15 s de clignotement
    return () => clearTimeout(t);
  }, [nouveau]);

  // Barre rabattue : placée juste au-dessus de l'onglet « Support » du menu, sans le cacher
  useLayoutEffect(() => {
    if (!(ouvert && reduit && variante === "menu")) return undefined;
    const placer = () => {
      const r = boutonMenu.current?.getBoundingClientRect();
      if (r) setPosBarre({ left: Math.max(8, r.left), bottom: window.innerHeight - r.top + 10 });
    };
    placer();
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [ouvert, reduit, variante]);

  useEffect(() => { if (filRef.current) filRef.current.scrollTop = filRef.current.scrollHeight; }, [messages, ouvert, reduit]);

  // Envoi d'un message
  const envoyer = async (e) => {
    e.preventDefault();
    const t = texte.trim();
    if (!t || envoi) return;
    // Visiteur : numéro obligatoire et valide (le support lui répond par téléphone / WhatsApp)
    const numero = user ? "" : normaliserTelephone(coord.contact);
    if (!user && !numero) { setErreur("Numéro invalide : 8 chiffres au Burkina Faso (ex. 70 00 00 00)."); return; }
    setEnvoi(true);
    try {
      try { localStorage.setItem(CLE_COORD, JSON.stringify(coord)); } catch { /* sans importance */ }
      const r = await apiClient.post("/support-sawali/messages", { visiteur, texte: t, nom: user ? "" : coord.nom, contact: numero });
      setTexte("");
      if (r.data?.requete) setRequete(r.data.requete);
      await lireFil();
    } catch (err) {
      setErreur(messageErreur(err, "Envoi impossible : votre message est conservé, réessayez."));
    } finally { setEnvoi(false); }
  };

  // Clic sur l'icône : fermée → ouvre ; rabattue → déploie ; déployée → ferme
  const basculer = () => {
    if (!ouvert) { setOuvert(true); setReduit(false); }
    else if (reduit) setReduit(false);
    else setOuvert(false);
  };

  if (!actif) return null;
  const pastille = nonLus > 0 && (
    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{nonLus}</span>
  );

  return (
    <>
      {variante === "menu" ? (
        // Onglet du menu flottant (même gabarit que les autres onglets)
        <button type="button" ref={boutonMenu} onClick={basculer} aria-label="Assistance — écrire au support SAWALI"
          className={`relative ${classeMenu} ${nonLus > 0 ? "clignote" : ""}`}>
          <span className="text-lg leading-none"><Casque /></span>Support{pastille}
        </button>
      ) : (
        // Petite icône discrète en bas à droite de la carte de connexion
        <button type="button" onClick={basculer} title="Assistance — écrire au support SAWALI"
          aria-label="Assistance — écrire au support SAWALI"
          className={`relative ${nonLus > 0 ? "clignote" : ""} grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-primary`}>
          <Casque />{pastille}
        </button>
      )}

      <Patientez actif={envoi} />

      {/* Portail vers <body> : sinon le menu flottant (flou + coins arrondis) découpe la fenêtre */}
      {/* Fenêtre rabattue : petite barre en bas à droite, qui clignote à l'arrivée d'un message */}
      {ouvert && reduit && createPortal(
        <button type="button" onClick={() => setReduit(false)} aria-label="Déployer la fenêtre du support SAWALI"
          style={variante === "menu" && posBarre ? { left: posBarre.left, bottom: posBarre.bottom } : { right: "0.5rem", bottom: "0.75rem" }}
          className={`no-print fixed z-[80] flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-2xl border border-primary ${nonLus > 0 ? "clignote" : ""}`}>
          <span className="text-primary"><Casque taille={16} /></span>Support SAWALI
          {nonLus > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold">{nonLus}</span>}
          <span aria-hidden="true" className="text-gray-500">▴</span>
        </button>,
        document.body
      )}

      {/* Fenêtre déployée : étroite (≈ 17 rem au plus) pour ne pas cacher l'écran derrière */}
      {ouvert && !reduit && createPortal(
        <div onPointerDown={() => setNouveau(false)} onFocusCapture={() => setNouveau(false)}
          className={`no-print fixed bottom-2 right-2 z-[80] flex h-[60dvh] max-h-[440px] w-[min(17rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-2xl border border-primary sm:right-4 ${nouveau ? "clignote" : ""}`}
          role="dialog" aria-label="Support SAWALI">
          <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 text-ink">
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold">Support SAWALI</p>
              <p className="truncate text-xs text-gray-500">
                {requete ? `${requete.numero} · ${ETATS[requete.statut] || requete.libelle || ""}` : "Posez votre question, nous vous répondons ici."}
              </p>
            </div>
            {/* Rabattre (la discussion reste active) / fermer */}
            <button type="button" onClick={() => setReduit(true)} className="rounded-lg px-2 py-1 text-lg leading-none text-gray-600 hover:bg-gray-100" aria-label="Rabattre la fenêtre" title="Rabattre">▾</button>
            <button type="button" onClick={() => setOuvert(false)} className="rounded-lg px-2 py-1 text-lg leading-none text-gray-600 hover:bg-gray-100" aria-label="Fermer" title="Fermer">×</button>
          </div>
          <div ref={filRef} className="flex-1 space-y-2 overflow-y-auto bg-creme p-3">
            {messages.length === 0 && <p className="py-6 text-center text-sm italic text-gray-400">Aucun message pour l'instant.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.de === "moi" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.systeme ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : m.de === "moi" ? "bg-primary text-white" : "bg-white ring-1 ring-gray-200"}`}>
                  {m.de !== "moi" && !m.systeme && <p className="mb-0.5 text-[11px] font-bold text-gray-500">{m.auteur}</p>}
                  {m.texte && <p className="whitespace-pre-wrap break-words">{m.texte}</p>}
                  <p className={`mt-1 text-right text-[10px] ${m.de === "moi" ? "text-white/70" : "text-gray-400"}`}>{heure(m.le)}</p>
                </div>
              </div>
            ))}
          </div>
          {erreur && <p className="bg-red-50 px-3 py-1 text-xs text-red-700">{erreur}</p>}
          <form onSubmit={envoyer} className="space-y-2 p-2">
            {/* Nom et contact : pour que le support puisse répondre (utile surtout aux visiteurs) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Connecté : nom et numéro du compte, grisés. Visiteur : saisie (numéro obligatoire) */}
              <input className="input text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500" placeholder="Votre nom" maxLength={80}
                disabled={!!user} value={user ? `${user.prenom || ""} ${user.nom || ""}`.trim() : coord.nom}
                onChange={(e) => setCoord({ ...coord, nom: e.target.value })} aria-label="Votre nom" />
              <input className="input text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500" placeholder="Téléphone 70 00 00 00" maxLength={20}
                type="tel" inputMode="tel" autoComplete="tel" required={!user}
                disabled={!!user} value={user ? user.telephone || "" : coord.contact}
                onChange={(e) => setCoord({ ...coord, contact: e.target.value })} aria-label="Numéro de téléphone" />
            </div>
            <div className="flex gap-2">
              <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} maxLength={2000}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) envoyer(e); }}
                placeholder="Votre message…" className="input min-w-0 flex-1 resize-none text-sm" />
              <button type="submit" disabled={envoi || !texte.trim()} className="btn-primary btn-sm">
                {envoi ? "Patientez…" : "Envoyer"}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
}
