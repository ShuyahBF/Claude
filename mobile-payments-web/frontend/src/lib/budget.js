// budget.js — BUDGET DE DÉPENSES d'auRor (lot 217). Logique PURE (sans React), testée par tests/budget.test.mjs.
//
// Pour un développeur WinDev : le budget est un plafond de dépenses sur une période (jour, semaine, mois…), tous opérateurs confondus.
// Les dépenses viennent des LIGNES DE PAIEMENT lues dans les SMS (smsPaiements.js) : seules les vraies transactions « payées » comptent
// (estTransaction : ni promo, ni doublon). Le budget est gardé SUR LE TÉLÉPHONE (aucun envoi au serveur).
// L'utilisateur peut le MODIFIER, le DÉSACTIVER (réglage conservé) ou le RÉINITIALISER (le compteur repart de zéro à l'instant du clic).
import { estTransaction } from "@/lib/smsPaiements";

const CLE = "auror_budget";

/** Périodes proposées (liste finie) : libellé du menu et libellé court pour les phrases. */
export const PERIODES = [
  { cle: "jour", libelle: "par jour", court: "aujourd'hui" },
  { cle: "semaine", libelle: "par semaine", court: "cette semaine" },
  { cle: "quinzaine", libelle: "par quinzaine", court: "cette quinzaine" },
  { cle: "mois", libelle: "par mois", court: "ce mois" },
  { cle: "trimestre", libelle: "par trimestre", court: "ce trimestre" },
  { cle: "annee", libelle: "par an", court: "cette année" },
];
export const libellePeriode = (cle) => (PERIODES.find((p) => p.cle === cle) || PERIODES[3]);

/** Budget vide : désactivé, mensuel, sans montant. */
export const BUDGET_VIDE = { actif: false, montant: 0, periode: "mois", depuis: 0 };

/** Début CALENDAIRE de la période qui contient « maintenant » (heure locale) : minuit, lundi, 1er / 16 du mois, 1er du mois, du trimestre, de l'année. */
export function debutPeriode(periode, maintenant = Date.now()) {
  const d = new Date(maintenant);
  const minuit = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (periode) {
    case "jour": return minuit.getTime();
    case "semaine": { const j = (minuit.getDay() + 6) % 7; return new Date(minuit.getFullYear(), minuit.getMonth(), minuit.getDate() - j).getTime(); }   // lundi
    case "quinzaine": return new Date(d.getFullYear(), d.getMonth(), d.getDate() >= 16 ? 16 : 1).getTime();
    case "trimestre": return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
    case "annee": return new Date(d.getFullYear(), 0, 1).getTime();
    default: return new Date(d.getFullYear(), d.getMonth(), 1).getTime();                                                                                   // mois
  }
}

/** Début effectif du décompte : le plus tard entre le début de la période et la dernière RÉINITIALISATION. */
export const debutEffectif = (budget, maintenant = Date.now()) => Math.max(debutPeriode(budget.periode, maintenant), Number(budget.depuis) || 0);

/** Nettoie un budget lu ou saisi : montant entier positif, période connue. */
export function normaliser(b) {
  const montant = Math.max(0, Math.round(Number(b?.montant) || 0));
  const periode = PERIODES.some((p) => p.cle === b?.periode) ? b.periode : "mois";
  return { actif: !!b?.actif && montant > 0, montant, periode, depuis: Math.max(0, Number(b?.depuis) || 0) };
}

export function chargerBudget(stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { return normaliser(JSON.parse(stockage?.getItem(CLE) || "null") || BUDGET_VIDE); } catch { return { ...BUDGET_VIDE }; }
}
/** Garde le budget ; faux si le stockage est indisponible. */
export function enregistrerBudget(budget, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { stockage.setItem(CLE, JSON.stringify(normaliser(budget))); return true; } catch { return false; }
}

/** Dépenses de la période en cours : vraies transactions payées, tous opérateurs confondus ; { total, nb, parOperateur: [{ adresse, total }] } (du plus gros au plus petit). */
export function depensesDeLaPeriode(lignes, budget, maintenant = Date.now()) {
  const debut = debutEffectif(budget, maintenant);
  const par = new Map();
  let total = 0, nb = 0;
  for (const l of lignes || []) {
    if (!l || l.genre !== "DEPENSE" || !estTransaction(l) || !(l.quand >= debut) || l.quand > maintenant + 60_000) continue;
    total += l.montant; nb += 1;
    par.set(l.adresse || "Autre", (par.get(l.adresse || "Autre") || 0) + l.montant);
  }
  return { total, nb, debut, parOperateur: [...par].map(([adresse, t]) => ({ adresse, total: t })).sort((a, b) => b.total - a.total) };
}

/**
 * Niveau du budget, avec ou sans un paiement qu'on s'apprête à faire (« prepare », en FCFA).
 * Rend null si le budget est désactivé. Sinon :
 *  - depense, reste (jamais négatif), pct (part déjà dépensée, 0-100+) ;
 *  - apres : dépenses si le paiement préparé est fait ; depasse : ce paiement ferait dépasser le budget ; deja : le budget est déjà dépassé ;
 *  - exces : montant au-dessus du budget après le paiement ; niveau : "ok" (< 80 %), "attention" (≥ 80 %), "depasse" (> 100 %).
 */
export function niveauBudget(lignes, budget, prepare = 0, maintenant = Date.now()) {
  const b = normaliser(budget);
  if (!b.actif) return null;
  const d = depensesDeLaPeriode(lignes, b, maintenant);
  const p = Math.max(0, Math.round(Number(prepare) || 0));
  const apres = d.total + p;
  const pctApres = Math.round((apres / b.montant) * 100);
  return {
    montant: b.montant, periode: b.periode, depense: d.total, nb: d.nb, parOperateur: d.parOperateur, debut: d.debut,
    reste: Math.max(0, b.montant - d.total), pct: Math.round((d.total / b.montant) * 100),
    prepare: p, apres, pctApres, deja: d.total > b.montant, depasse: p > 0 && apres > b.montant, exces: Math.max(0, apres - b.montant),
    niveau: apres > b.montant ? "depasse" : pctApres >= 80 ? "attention" : "ok",
  };
}

/** Réinitialisation : le décompte repart de zéro à cet instant (les lignes restent dans l'historique). */
export const reinitialiser = (budget, maintenant = Date.now()) => normaliser({ ...budget, depuis: maintenant });

// ---------- Détails ajoutés à une ligne de SMS (motif, détail des achats, photos) ----------
export const MOTIF_MAX = 300, DETAILS_MAX = 1000, PIECES_MAX = 3;

/** Motifs usuels proposés (liste finie ; « Autre… » ouvre la saisie libre). Dépenses et recettes n'ont pas les mêmes. */
export const MOTIFS_DEPENSE = ["Courses / alimentation", "Transport", "Santé / pharmacie", "Scolarité", "Loyer / charges", "Eau / électricité", "Crédit téléphone / internet", "Famille / entraide", "Loisirs", "Autre…"];
export const MOTIFS_RECETTE = ["Salaire", "Vente / commerce", "Remboursement", "Aide familiale", "Prêt reçu", "Cadeau", "Autre…"];

/** Applique les détails à UNE ligne (copie) : champs vides retirés, longueurs bornées. */
export function avecDetails(ligne, { motif = "", details = "", pieces } = {}) {
  const r = { ...ligne, motif: String(motif).trim().slice(0, MOTIF_MAX), details: String(details).trim().slice(0, DETAILS_MAX) };
  if (Array.isArray(pieces)) r.pieces = pieces.slice(0, PIECES_MAX);
  if (!r.motif) delete r.motif;
  if (!r.details) delete r.details;
  if (!r.pieces?.length) delete r.pieces;
  return r;
}

/** Remplace la ligne d'identifiant « id » dans la liste. */
export const remplacerLigne = (lignes, id, f) => lignes.map((l) => (l.id === id ? f(l) : l));

/** Une ligne a-t-elle des détails saisis ? */
export const aDesDetails = (l) => !!(l?.motif || l?.details || l?.pieces?.length);
