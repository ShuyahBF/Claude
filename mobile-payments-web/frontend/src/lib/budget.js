// budget.js — BUDGET DE DÉPENSES d'auRor (lot 217). Logique PURE (sans React), testée par tests/budget.test.mjs.
//
// Pour un développeur WinDev : le budget est un plafond de dépenses sur une période (jour, semaine, mois…), tous opérateurs confondus.
// Les dépenses viennent des LIGNES DE PAIEMENT lues dans les SMS (smsPaiements.js) : seules les vraies transactions « payées » comptent
// (estTransaction : ni promo, ni doublon). Le budget est gardé SUR LE TÉLÉPHONE (aucun envoi au serveur).
// L'utilisateur peut le MODIFIER, le DÉSACTIVER (réglage conservé) ou le RÉINITIALISER (le compteur repart de zéro à l'instant du clic).
import { estTransaction } from "@/lib/smsPaiements";
import { operateurDeAdresse } from "@/lib/carnet";

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
export const BUDGET_VIDE = { actif: false, montant: 0, periode: "mois", depuis: 0, operateurs: {} };

/** Clé d'un opérateur : « OrangeMoney » et « Orange » donnent « Orange », « Moov Money » et « Moov Africa » donnent « Moov Africa » ; un expéditeur inconnu reste tel quel. */
export const cleOperateur = (nom) => operateurDeAdresse(nom) || String(nom || "Autre").trim() || "Autre";

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
  // Budgets PAR OPÉRATEUR (lot 219) : { "Orange": 30000, … } ; montants nuls retirés ; même période que le budget global
  const operateurs = {};
  for (const [k, v] of Object.entries(b?.operateurs || {})) { const m = Math.max(0, Math.round(Number(v) || 0)); if (m > 0 && String(k).trim()) operateurs[cleOperateur(k)] = m; }
  return { actif: !!b?.actif && montant > 0, montant, periode, depuis: Math.max(0, Number(b?.depuis) || 0), operateurs };
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
    const cle = cleOperateur(l.adresse);                                   // « OrangeMoney » et « Orange » comptent ensemble
    par.set(cle, (par.get(cle) || 0) + l.montant);
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
export function niveauBudget(lignes, budget, prepare = 0, maintenant = Date.now(), operateur = "") {
  const b = normaliser(budget);
  if (!b.actif) return null;
  const d = depensesDeLaPeriode(lignes, b, maintenant);
  const p = Math.max(0, Math.round(Number(prepare) || 0));
  const apres = d.total + p;
  const pctApres = Math.round((apres / b.montant) * 100);
  // Budgets par opérateur : le paiement préparé ne compte que pour SON opérateur
  const cleP = operateur ? cleOperateur(operateur) : "";
  const depParOp = new Map(d.parOperateur.map((o) => [o.adresse, o.total]));
  const operateurs = Object.entries(b.operateurs).map(([cle, montant]) => {
    const dep = depParOp.get(cle) || 0, prep = cle === cleP ? p : 0, ap = dep + prep;
    return { cle, montant, depense: dep, reste: Math.max(0, montant - dep), pct: Math.round((dep / montant) * 100), prepare: prep, apres: ap, pctApres: Math.round((ap / montant) * 100),
      deja: dep > montant, depasse: prep > 0 && ap > montant, exces: Math.max(0, ap - montant), niveau: ap > montant ? "depasse" : Math.round((ap / montant) * 100) >= 80 ? "attention" : "ok" };
  });
  return {
    operateurs, opDepasse: operateurs.some((o) => o.depasse),
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
export function avecDetails(ligne, { motif = "", details = "", pieces, articles } = {}) {
  const r = { ...ligne, motif: String(motif).trim().slice(0, MOTIF_MAX), details: String(details).trim().slice(0, DETAILS_MAX) };
  if (Array.isArray(articles)) { r.articles = normaliserArticles(articles); if (!r.articles.length) delete r.articles; }
  if (Array.isArray(pieces)) r.pieces = pieces.slice(0, PIECES_MAX);
  if (!r.motif) delete r.motif;
  if (!r.details) delete r.details;
  if (!r.pieces?.length) delete r.pieces;
  return r;
}

/** Remplace la ligne d'identifiant « id » dans la liste. */
export const remplacerLigne = (lignes, id, f) => lignes.map((l) => (l.id === id ? f(l) : l));

/** Une ligne a-t-elle des détails saisis ? */
export const aDesDetails = (l) => !!(l?.motif || l?.details || l?.pieces?.length || l?.articles?.length);

// ---------- Détail des achats en TABLEAU (lot 218) : rubrique, montant, catégorie ----------
export const ARTICLES_MAX = 30;
/** Catégories d'une rubrique de dépense (liste finie) : les motifs usuels, sans « Autre… » (une catégorie vide reste possible). */
export const CATEGORIES_RUBRIQUE = MOTIFS_DEPENSE.slice(0, -1);

/** Nettoie un tableau de rubriques : intitulé borné, montant entier ≥ 0, lignes vides retirées, 30 au plus. */
export function normaliserArticles(articles) {
  return (Array.isArray(articles) ? articles : [])
    .map((a) => ({ rubrique: String(a?.rubrique || "").trim().slice(0, 80), montant: Math.max(0, Math.round(Number(a?.montant) || 0)), categorie: String(a?.categorie || "").trim().slice(0, 60) }))
    .filter((a) => a.rubrique || a.montant)
    .slice(0, ARTICLES_MAX);
}
export const totalArticles = (articles) => (articles || []).reduce((t, a) => t + (Number(a.montant) || 0), 0);

// ---------- Recherche plein texte dans les rubriques et détails ----------
const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Recherche générique (sans accents ni majuscules ; plusieurs mots = tous doivent se retrouver) dans les rubriques, catégories, motifs, détails, bénéficiaires et opérateurs.
 * Rend une ligne par RUBRIQUE trouvée : { id, quand, adresse, intitule, montant, categorie, montantSms }.
 * Un SMS sans tableau de rubriques qui correspond sur son motif / détail / bénéficiaire donne une ligne avec le motif (ou « Paiement ») comme intitulé et le montant du SMS.
 * Texte vide : aucune ligne (la recherche n'affiche rien tant qu'on n'a rien cherché).
 */
export function rechercherRubriques(lignes, texte) {
  const mots = sansAccents(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const toutDedans = (s) => mots.every((m) => s.includes(m));
  const r = [];
  for (const l of lignes || []) {
    if (!l || !estTransactionLigne(l)) continue;
    const contexte = sansAccents(`${l.motif || ""} ${l.details || ""} ${l.tiers || ""} ${l.adresse || ""} ${l.id || ""}`);
    const arts = l.articles?.length ? l.articles : null;
    if (arts) {
      for (const a of arts) if (toutDedans(`${sansAccents(`${a.rubrique} ${a.categorie}`)} ${contexte}`)) r.push({ id: l.id, quand: l.quand, adresse: l.adresse, intitule: a.rubrique || "(sans intitulé)", montant: a.montant, categorie: a.categorie || "", montantSms: l.montant });
    } else if (aDesDetails(l) || l.tiers) {
      if (toutDedans(contexte)) r.push({ id: l.id, quand: l.quand, adresse: l.adresse, intitule: l.motif || l.details || l.tiers || "Paiement", montant: l.montant, categorie: "", montantSms: l.montant });
    }
  }
  return r.sort((a, b) => b.quand - a.quand);
}
// (même définition de « vraie transaction » que smsPaiements.estTransaction, sans dépendance circulaire)
const estTransactionLigne = (l) => estTransaction(l);

// ---------- Évolution du solde et entrées d'argent ----------
/**
 * Évolution du SOLDE TOTAL (tous portefeuilles) sur [debut, fin] d'après les soldes que les SMS annoncent après chaque opération.
 *  - Chaque portefeuille (opérateur) garde son DERNIER solde connu ; le total à un instant = somme de ces derniers soldes.
 *  - Point de départ : le dernier solde connu de chaque portefeuille AVANT « debut » (s'il y en a).
 *  - Rend { points: [{ t, total }], entrees: [{ id, quand, adresse, tiers, montant }], sorties: nb, aSolde }.
 *    Les ENTRÉES D'ARGENT = lignes « reçu » (vraies transactions) de la période : elles marquent le graphique.
 */
export function serieSolde(lignes, debut, fin = Date.now()) {
  const tri = (lignes || []).filter((l) => l && l.quand <= fin).sort((a, b) => a.quand - b.quand);
  const dernier = new Map();
  const points = [];
  const somme = () => [...dernier.values()].reduce((t, v) => t + v, 0);
  for (const l of tri) {
    if (l.solde == null || !Number.isFinite(l.solde)) continue;
    dernier.set(l.adresse || "Autre", l.solde);
    if (l.quand < debut) continue;
    if (points.length === 0 && dernier.size) {
      // point de départ de la période : les soldes connus juste avant la première opération
      const avant = new Map(dernier); avant.delete(l.adresse || "Autre");
      const prec = [...avant.values()].reduce((t, v) => t + v, 0);
      if (avant.size) points.push({ t: debut, total: prec });
    }
    points.push({ t: l.quand, total: somme() });
  }
  const entrees = tri.filter((l) => l.genre === "RECETTE" && estTransaction(l) && l.quand >= debut).map((l) => ({ id: l.id, quand: l.quand, adresse: l.adresse, tiers: l.tiers || "", montant: l.montant }));
  return { points, entrees, aSolde: points.length > 0 };
}
