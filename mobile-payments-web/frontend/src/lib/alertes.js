// ============================================================================
// alertes.js — sons, vibration et notifications de Paiement Mobile (lot 40).
//
// Pour un développeur WinDev : c'est un petit « module de signalisation » commun à toute l'application.
//   - les RÉGLAGES (son oui/non, volume 0–100, vibration, notifications) sont gardés dans le navigateur de l'appareil ;
//   - jouerSon(type) joue une mélodie courte PROPRE à chaque type d'événement (médicament, paiement, anniversaire, support…)
//     au volume réglé ; le navigateur n'autorise le son qu'après un premier toucher : debloquerAudio() est appelé au 1er clic ;
//   - notifier() affiche une notification du système (écran verrouillé compris) via le service worker /sw.js ;
//   - traiterEvenements() reçoit la liste d'événements du serveur (/api/rappels/resume) et n'alerte qu'UNE fois par clé et par jour.
// Limite à connaître : tout cela fonctionne tant que l'application est ouverte (même en arrière-plan sur le téléphone).
// Alerter application fermée demanderait des notifications « push » envoyées par le serveur.
// ============================================================================
const CLE_PREFS = "mpw_alertes";
const CLE_VUES = "mpw_alertes_vues";
const DEFAUT = { son: true, volume: 70, vibration: true, notifications: false };

export function lirePreferences() {
  try { return { ...DEFAUT, ...(JSON.parse(localStorage.getItem(CLE_PREFS)) || {}) }; } catch { return { ...DEFAUT }; }
}
export function ecrirePreferences(p) {
  try { localStorage.setItem(CLE_PREFS, JSON.stringify(p)); } catch { /* sans importance */ }
}

// ---- Son -------------------------------------------------------------------
let contexte = null;
function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  contexte = contexte || new Ctx();
  if (contexte.state === "suspended") contexte.resume().catch(() => {});
  return contexte;
}
/** À appeler au premier toucher de l'utilisateur : le navigateur autorise alors les sons suivants. */
export function debloquerAudio() { try { audio(); } catch { /* sans importance */ } }

// Mélodies : [fréquence en Hz, début en s, durée en s]. Chaque type d'événement a la sienne (reconnaissable sans regarder l'écran).
const MELODIES = {
  medicament: [[880, 0, 0.16], [880, 0.22, 0.16], [1175, 0.44, 0.34], [880, 0.95, 0.16], [880, 1.17, 0.16], [1175, 1.39, 0.34]],   // double appel insistant
  paiement: [[523.25, 0, 0.18], [659.25, 0.2, 0.18], [523.25, 0.45, 0.3]],
  anniversaire: [[523.25, 0, 0.14], [659.25, 0.14, 0.14], [783.99, 0.28, 0.14], [1046.5, 0.42, 0.45]],                              // arpège joyeux
  support: [[659.25, 0, 0.18], [783.99, 0.14, 0.18], [1046.5, 0.28, 0.32]],
};

/** Joue la mélodie du type donné au volume réglé (0 = muet). `force` : joue même si le son est désactivé (bouton « Tester »). */
export function jouerSon(type = "support", { force = false } = {}) {
  try {
    const p = lirePreferences();
    if ((!p.son && !force) || p.volume <= 0) return;
    const c = audio();
    if (!c) return;
    // Volume ressenti ≈ proportionnel au carré du réglage (l'oreille est logarithmique) ; 0,9 maximum pour éviter la saturation
    const crete = 0.9 * (p.volume / 100) ** 2;
    const t0 = c.currentTime + 0.02;
    (MELODIES[type] || MELODIES.support).forEach(([f, debut, duree]) => {
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t0 + debut);
      env.gain.setValueAtTime(0.0001, t0 + debut);
      env.gain.exponentialRampToValueAtTime(Math.max(crete, 0.0002), t0 + debut + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + debut + duree);
      osc.connect(env); env.connect(c.destination);
      osc.start(t0 + debut); osc.stop(t0 + debut + duree + 0.02);
    });
  } catch { /* son impossible : sans importance */ }
}

export function vibrer() {
  try { if (lirePreferences().vibration) navigator.vibrate?.([250, 120, 250]); } catch { /* sans importance */ }
}

// ---- Notifications du système ----------------------------------------------
export function notificationsDisponibles() { return typeof window !== "undefined" && "Notification" in window; }
export function etatNotifications() {
  if (!notificationsDisponibles()) return "indisponible";
  return Notification.permission;          // "granted" | "denied" | "default"
}

async function enregistrement() {
  if (!("serviceWorker" in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js")); } catch { return null; }
}

/** Demande l'autorisation au navigateur (à appeler après un clic) ; renvoie l'état obtenu. */
export async function activerNotifications() {
  if (!notificationsDisponibles()) return "indisponible";
  const etat = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (etat === "granted") await enregistrement();
  return etat;
}

/** Affiche une notification du système si elles sont activées ET autorisées. */
export async function notifier({ titre, texte, lien = "/", cle }) {
  try {
    if (!lirePreferences().notifications || etatNotifications() !== "granted") return;
    const options = { body: texte, icon: "/icone.svg", badge: "/icone.svg", tag: cle, data: { lien }, renotify: true };
    const reg = await enregistrement();
    if (reg?.showNotification) await reg.showNotification(titre, options);
    else new Notification(titre, options);
  } catch { /* sans importance */ }
}

// ---- Événements du serveur ---------------------------------------------------
function vues() {
  const jour = new Date().toISOString().slice(0, 10);
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VUES));
    if (v && v.jour === jour) return v;
  } catch { /* nouvelle liste */ }
  return { jour, cles: [] };
}

/**
 * Alerte les événements NOUVEAUX (clé jamais vue aujourd'hui) : un son (celui du plus urgent), une vibration, une notification
 * par événement et un message à l'écran. Renvoie le nombre d'événements alertés.
 */
export function traiterEvenements(evenements, { afficher } = {}) {
  const v = vues();
  const nouveaux = (evenements || []).filter((e) => !v.cles.includes(e.cle));
  if (!nouveaux.length) return 0;
  v.cles.push(...nouveaux.map((e) => e.cle));
  try { localStorage.setItem(CLE_VUES, JSON.stringify(v)); } catch { /* sans importance */ }
  jouerSon(nouveaux[0].type);          // la liste arrive triée : médicaments d'abord
  vibrer();
  nouveaux.forEach((e) => notifier(e));
  if (afficher) afficher(nouveaux.length === 1 ? `${nouveaux[0].titre} — ${nouveaux[0].texte}` : `${nouveaux.length} rappels : ${nouveaux.map((e) => e.titre).join(" · ")}`);
  return nouveaux.length;
}
