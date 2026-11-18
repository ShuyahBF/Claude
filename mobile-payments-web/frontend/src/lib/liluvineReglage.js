// RÉGLAGE DE LILUVINE (coach) dans le profil de l'utilisateur : présente, silencieuse pendant une période, ou désactivée.
// Gardé sur CE téléphone, pour CE compte (un téléphone peut servir à plusieurs comptes). Même abonné, chacun choisit.
//  - « active »   : Liluvine dit bonjour le matin, une bulle et un son signalent ses messages, la pastille s'allume.
//  - « silence »  : jusqu'à une date, Liluvine n'écrit plus la première, sans bulle ni son ; elle reste disponible dans le Journal. Elle revient seule à l'échéance.
//  - « off »      : Liluvine disparaît (plus d'onglet, de bonjour, de bulle ni de pastille) jusqu'à ce que l'utilisateur la réactive.
// Pour un développeur WinDev : trois fonctions pures (LireReglage, EcrireReglage, EtatLiluvine) ; le stockage est passé en paramètre pour pouvoir les tester.

const cle = (id) => `mpw_liluvine_reglage_${String(id || "").replace(/[^\w-]/g, "")}`;

/** Réglage mémorisé { mode: "active"|"silence"|"off", jusqua: nombre|null }, ou le réglage par défaut (présente). */
export function lireReglage(id, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try {
    const r = JSON.parse(stockage?.getItem(cle(id)) || "null");
    if (r && ["active", "silence", "off"].includes(r.mode)) return { mode: r.mode, jusqua: Number(r.jusqua) || null };
  } catch { /* réglage illisible : présente par défaut */ }
  return { mode: "active", jusqua: null };
}

/** Enregistre le réglage ; rend vrai si le téléphone l'a gardé. */
export function ecrireReglage(id, reglage, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { stockage.setItem(cle(id), JSON.stringify({ mode: reglage.mode, jusqua: reglage.jusqua || null })); return true; } catch { return false; }
}

/** État à l'instant donné : « active », « silence » (échéance pas encore passée) ou « off ». Une silence arrivée à échéance redevient « active ». */
export function etatLiluvine(reglage, maintenant = Date.now()) {
  if (reglage.mode === "off") return "off";
  if (reglage.mode === "silence" && reglage.jusqua && maintenant < reglage.jusqua) return "silence";
  return "active";
}

/** Durées de silence proposées (liste déroulante). */
export const DUREES_SILENCE = [
  { id: "demain", libelle: "Jusqu'à demain matin" },
  { id: "semaine", libelle: "Pendant 1 semaine" },
  { id: "mois", libelle: "Pendant 1 mois" },
  { id: "date", libelle: "Jusqu'à une date que je choisis…" },
];

/** Fin du silence (ms) pour une durée choisie ; `dateChoisie` = « AAAA-MM-JJ » pour « date » (silence jusqu'à la fin de ce jour). Rend null si la date est invalide ou passée. */
export function finDuSilence(duree, maintenant = new Date(), dateChoisie = "") {
  if (duree === "demain") { const d = new Date(maintenant); d.setDate(d.getDate() + 1); d.setHours(5, 0, 0, 0); return d.getTime(); }   // 5 h : l'heure où le bonjour redevient possible
  if (duree === "semaine") return maintenant.getTime() + 7 * 86400000;
  if (duree === "mois") { const d = new Date(maintenant); d.setMonth(d.getMonth() + 1); return d.getTime(); }
  if (duree === "date") {
    const d = new Date(`${dateChoisie}T23:59:59`);
    return Number.isNaN(d.getTime()) || d.getTime() <= maintenant.getTime() ? null : d.getTime();
  }
  return null;
}
