// ============================================================================
// alertes.js — sons, vibration et notifications de auRor (lot 40).
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
// renforcee : « alerte renforcée » pour les malvoyants (écran qui clignote en jaune et noir, grosses lettres, vibration longue répétée,
// son répété) ; lecture : le rappel est aussi LU À VOIX HAUTE (synthèse vocale du téléphone, en français)
// tonalite : hauteur du son (liste de choix) ; « aiguë » par défaut : les petits haut-parleurs de téléphone rendent bien mieux 2 000 à 4 000 Hz que les sons graves
const TONALITES = { normale: 1, aigue: 2, tres_aigue: 3 };
export const CHOIX_TONALITE = [["normale", "Normale"], ["aigue", "Aiguë (recommandée)"], ["tres_aigue", "Très aiguë"]];
const DEFAUT = { son: true, volume: 90, tonalite: "aigue", vibration: true, notifications: false, renforcee: false, lecture: true };

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

/** Joue la mélodie du type donné au volume réglé (0 = muet). `force` : joue même si le son est désactivé (bouton « Tester »).
 *  `maximum` : volume au maximum quel que soit le réglage (alerte renforcée pour les malvoyants).
 *  Son renforcé (lot 52, « le son n'est pas très fort ») : onde carrée (beaucoup plus de puissance qu'une onde triangulaire) doublée de son
 *  octave, volume proportionnel au réglage (et non plus au carré, qui rendait les réglages moyens très faibles), puis un limiteur
 *  (compresseur) qui évite la saturation et remonte le niveau moyen. */
export function jouerSon(type = "support", { force = false, maximum = false } = {}) {
  try {
    const p = lirePreferences();
    const volume = maximum ? 100 : p.volume;
    if ((!p.son && !force && !maximum) || volume <= 0) return;
    const c = audio();
    if (!c) return;
    const niveau = (volume / 100) ** 1.2;                 // 0 → 1
    const hauteur = TONALITES[p.tonalite] || TONALITES.aigue;      // multiplicateur de fréquence
    const sortie = c.createGain();
    sortie.gain.value = 1.6;                              // rehausse générale, contenue par le limiteur ci-dessous
    const limiteur = c.createDynamicsCompressor();
    limiteur.threshold.value = -10; limiteur.knee.value = 6; limiteur.ratio.value = 12; limiteur.attack.value = 0.003; limiteur.release.value = 0.15;
    sortie.connect(limiteur); limiteur.connect(c.destination);
    const t0 = c.currentTime + 0.02;
    (MELODIES[type] || MELODIES.support).forEach(([f, debut, duree]) => {
      const fondamentale = Math.min(f * hauteur, 4200);               // jamais au-delà de 4 200 Hz (désagréable et mal rendu)
      // note + octave (l'octave est omise quand elle passerait au-dessus de 6 000 Hz)
      [[fondamentale, 0.45], ...(fondamentale * 2 <= 6000 ? [[fondamentale * 2, 0.22]] : [])].forEach(([freq, part]) => {
        const osc = c.createOscillator();
        const env = c.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, t0 + debut);
        env.gain.setValueAtTime(0.0001, t0 + debut);
        env.gain.exponentialRampToValueAtTime(Math.max(part * niveau, 0.0002), t0 + debut + 0.015);
        env.gain.setValueAtTime(Math.max(part * niveau, 0.0002), t0 + debut + Math.max(0.02, duree - 0.05));
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + debut + duree);
        osc.connect(env); env.connect(sortie);
        osc.start(t0 + debut); osc.stop(t0 + debut + duree + 0.02);
      });
    });
  } catch { /* son impossible : sans importance */ }
}

export function vibrer() {
  try { if (lirePreferences().vibration) navigator.vibrate?.([250, 120, 250]); } catch { /* sans importance */ }
}

/** Vibration LONGUE et insistante (alerte renforcée) : trois secousses fortes, la dernière plus longue. */
export const MOTIF_VIBRATION_FORTE = [600, 200, 600, 200, 1000];
export function vibrerFort() { try { navigator.vibrate?.(MOTIF_VIBRATION_FORTE); } catch { /* sans importance */ } }

/** Lit un texte à voix haute en français (synthèse vocale du téléphone). Sans effet si le navigateur ne sait pas parler. */
export function parler(texte) {
  try {
    if (!("speechSynthesis" in window) || !texte) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = "fr-FR"; u.rate = 0.9; u.volume = Math.max(0.3, lirePreferences().volume / 100);
    window.speechSynthesis.speak(u);
  } catch { /* sans importance */ }
}

/** Déclenche l'alerte renforcée (écran clignotant) : écoutée par le composant AlerteRenforcee monté dans la mise en page. */
export function declencherAlerteRenforcee(evenements) {
  try { window.dispatchEvent(new CustomEvent("mpw:alerte-renforcee", { detail: evenements })); } catch { /* sans importance */ }
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
    const options = { body: texte, icon: "/icone-192.png", badge: "/favicon.png", tag: cle, data: { lien }, renotify: true };
    const reg = await enregistrement();
    if (reg?.showNotification) await reg.showNotification(titre, options);
    else new Notification(titre, options);
  } catch { /* sans importance */ }
}

// ---- Notifications push (application fermée) ---------------------------------
// L'appareil s'abonne auprès du service de notification de son navigateur ; le serveur de auRor reçoit l'adresse et les clés
// de chiffrement (/api/push/abonner) et envoie lui-même les alertes (prise à l'heure, paiement à régler, anniversaire).
function cleEnOctets(base64url) {
  const b = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}
export function pushDisponible() { return "serviceWorker" in navigator && "PushManager" in window && notificationsDisponibles(); }

/** Abonne cet appareil au push (autorisation déjà accordée). Renvoie true si le serveur a enregistré l'appareil. Idempotent. */
export async function abonnerPush(apiClient) {
  try {
    if (!pushDisponible() || etatNotifications() !== "granted") return false;
    const reg = await enregistrement();
    if (!reg) return false;
    const { data } = await apiClient.get("/push/cle");
    let ab = await reg.pushManager.getSubscription();
    if (!ab) ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(data.cle_publique) });
    const j = ab.toJSON();
    await apiClient.post("/push/abonner", { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
    return true;
  } catch { return false; }
}

/** Désabonne cet appareil (côté navigateur et côté serveur). */
export async function desabonnerPush(apiClient) {
  try {
    const reg = await enregistrement();
    const ab = reg && (await reg.pushManager.getSubscription());
    if (!ab) return;
    await apiClient.post("/push/desabonner", { endpoint: ab.endpoint }).catch(() => {});
    await ab.unsubscribe();
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
  if (lirePreferences().renforcee) declencherAlerteRenforcee(nouveaux);       // malvoyants : écran clignotant, vibration, voix
  if (afficher) afficher(nouveaux.length === 1 ? `${nouveaux[0].titre} — ${nouveaux[0].texte}` : `${nouveaux.length} rappels : ${nouveaux.map((e) => e.titre).join(" · ")}`);
  return nouveaux.length;
}
