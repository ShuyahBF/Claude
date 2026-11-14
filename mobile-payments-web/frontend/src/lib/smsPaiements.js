// Lignes de paiement lues dans les SMS des opérateurs (application Android auRor « direct »). Logique PURE (sans React) : testée par tests/smsPaiements.test.mjs.
//
// Pour un développeur WinDev : un SMS d'opérateur devient une LIGNE (date, sens, montant, bénéficiaire, solde, numéro de transaction). Les lignes sont gardées sur le TÉLÉPHONE
// (stockage du site dans l'application) : le texte complet des SMS n'est jamais enregistré, rien n'est envoyé à auRor. Même principe que Concentration.
//
// Prudence de lecture : un SMS sans montant en francs CFA ou sans sens reconnu (payé / reçu…) est ignoré plutôt que mal classé ; les promotions sont ignorées.

const NOMBRE = "(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,]\\d+)*";
const MONTANT_APRES = new RegExp(`(${NOMBRE})\\s*(?:fcfa|f\\s?cfa|xof|cfa|f)(?![a-z])`, "gi");
const MONTANT_AVANT = new RegExp(`(?:fcfa|f\\s?cfa|xof|cfa)\\s*:?\\s*(${NOMBRE})`, "gi");
const SOLDE = new RegExp(`(?:nouveau\\s+)?solde(?:\\s+(?:actuel|disponible|est|apr[eè]s))?(?:\\s*(?:est|:|de|=))*\\s*(${NOMBRE})`, "i");
const REFERENCE = /([A-Z]{2}\d{6}\.\d{4}\.\d+)/;
const DATE_REFERENCE = /^[A-Z]{2}(\d{2})(\d{2})(\d{2})\.(\d{2})(\d{2})\./;
const MOTS_DEPENSE = ["vous avez payé", "vous avez paye", "votre paiement", "paiement", "payé", "achat", "retrait", "vous avez envoyé", "vous avez envoye", "envoi de", "transfert de", "transfert vers", "facture", "débit", "debit", "vous avez transféré"];
const MOTS_RECETTE = ["vous avez reçu", "vous avez recu", "reçu de", "recu de", "dépôt", "depot", "crédit de", "credit de", "versement", "transfert reçu"];
const MOTS_PROMO = ["gagnez", "gagner", "promo", "offre", "bonus", "félicitations", "felicitations", "tentez", "jeu concours", "cliquez"];

/** « 2,150.00 », « 15 000 », « 15.000 », « 6403.0202 », « 2500 » → entier (francs). Les centimes sont arrondis. Null si illisible. */
export function lireNombre(brut) {
  const t = String(brut).replace(/[   ]/g, "");
  if (!t || !/^\d/.test(t)) return null;
  const derniere = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (derniere < 0) return parseInt(t, 10);
  const separateurs = t.replace(/[^.,]/g, "");
  const apres = t.slice(derniere + 1);
  const avant = t.slice(0, derniere);
  let decimale;
  if (new Set(separateurs).size > 1) decimale = true;               // « 2,150.00 » : l'autre séparateur est celui des milliers
  else if (separateurs.length > 1) decimale = false;                 // « 1.234.567 » : que des milliers
  else decimale = !(apres.length === 3 && avant.length >= 1 && avant.length <= 3);   // « 15.000 » = milliers ; « 6403.0202 » = décimale
  const entier = parseInt((decimale ? avant : t).replace(/\D/g, ""), 10);
  if (Number.isNaN(entier)) return null;
  return decimale && apres[0] >= "5" ? entier + 1 : entier;
}

/** Premier montant du texte (hors celui qui suit « solde »), ou null. */
export function montantDe(texte) {
  const solde = SOLDE.exec(texte);
  const bornes = solde ? [solde.index, solde.index + solde[0].length] : null;
  const candidats = [];
  for (const re of [MONTANT_APRES, MONTANT_AVANT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texte))) candidats.push({ pos: m.index, valeur: m[1] });
  }
  candidats.sort((a, b) => a.pos - b.pos);
  const retenu = candidats.find((c) => !bornes || c.pos < bornes[0] || c.pos >= bornes[1]);
  const n = retenu ? lireNombre(retenu.valeur) : null;
  return n && n > 0 ? n : null;
}

/** Date et heure inscrites dans un numéro de transaction (MP261113.1339…), en millisecondes ; null sinon. */
export function dateDeReference(ref) {
  const m = DATE_REFERENCE.exec(ref || "");
  if (!m) return null;
  const d = new Date(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Bénéficiaire (dépense) ou expéditeur (recette), tronqué ; chaîne vide si inconnu. */
function tiersDe(texte, genre) {
  const mots = genre === "RECETTE" ? "de|du" : "à|a|au profit de|chez|vers|pour|auprès de";
  const re = new RegExp(`(?:^|\\s)(?:${mots})\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ .\\-]{2,40}?)(?=\\s+(?:le|du|au|n°|num|numéro|ref|réf|frais|solde|montant|trans|a\\s+[ée]t[ée]|est|\\d)|[,.;\\n\\d]|$)`, "i");
  const m = re.exec(genre === "DEPENSE" ? texte.replace(/^.*?(?:fcfa|f\s?cfa|xof)\s+/i, "") : texte);
  return (m ? m[1].trim().replace(/[.\-]+$/, "") : "").slice(0, 40);
}

/** Un SMS (adresse, recu_le en ms, corps) → une ligne de paiement, ou null (promotion, pas de montant, sens indéterminé). */
export function analyserSms({ adresse, recu_le: recuLe, corps }) {
  const t = String(corps || "").toLowerCase();
  if (MOTS_PROMO.some((m) => t.includes(m))) return null;
  const montant = montantDe(corps);
  if (!montant) return null;
  const genre = MOTS_RECETTE.some((m) => t.includes(m)) ? "RECETTE" : MOTS_DEPENSE.some((m) => t.includes(m)) ? "DEPENSE" : null;
  if (!genre) return null;
  const ref = (REFERENCE.exec(corps) || [])[1] || null;
  const soldeM = SOLDE.exec(corps);
  const quand = dateDeReference(ref) || recuLe;
  return { id: ref || `${adresse}|${recuLe}|${montant}`, adresse, quand, genre, montant, tiers: tiersDe(corps, genre), solde: soldeM ? lireNombre(soldeM[1]) : null, reference: ref };
}

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Ce SMS CONFIRME-T-IL le paiement envoyé ? Il faut le MONTANT **et** le MARCHAND : le montant seul ne suffit jamais.
 *  - montant identique ;
 *  - le code marchand figure dans le SMS, ou (à défaut) le nom du marchand enregistré avec ce code (≥ 4 caractères) ;
 *  - c'est un SMS de dépense (pas de l'argent reçu), arrivé après l'envoi (une minute de marge).
 */
export function confirmePaiement(sms, { montant, codeMarchand, libelle, envoyeLe }) {
  if (!sms || (envoyeLe && sms.recu_le < envoyeLe - 60000)) return false;
  const ligne = analyserSms(sms);
  if (!ligne || ligne.genre !== "DEPENSE" || ligne.montant !== montant) return false;
  const corps = String(sms.corps || "");
  if (codeMarchand && corps.replace(/\D+/g, " ").split(" ").includes(String(codeMarchand))) return true;
  const nom = sansAccents(libelle).trim();
  return nom.length >= 4 && sansAccents(corps).includes(nom);
}

// ---- Stockage local (téléphone) ----
const CLE = "auror_sms_lignes";
const MAX = 3000;

/** Lignes gardées (plus récentes d'abord). [] si rien ou stockage indisponible. */
export function chargerLignes(stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { return JSON.parse(stockage?.getItem(CLE) || "[]"); } catch { return []; }
}

/** Ajoute les nouvelles lignes (sans doublon : même numéro de transaction, ou même adresse + heure + montant). Rend { lignes, nouvelles }. */
export function fusionner(existantes, nouvelles) {
  const ids = new Set(existantes.map((l) => l.id));
  const ajoutees = nouvelles.filter((l) => l && !ids.has(l.id));
  const lignes = [...existantes, ...ajoutees].sort((a, b) => b.quand - a.quand).slice(0, MAX);
  return { lignes, nouvelles: ajoutees.length };
}

/** Garde les lignes sur le téléphone ; faux si le stockage est indisponible (le résultat de la lecture reste affiché, mais ne survit pas à la fermeture). */
export function enregistrerLignes(lignes, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { stockage.setItem(CLE, JSON.stringify(lignes)); return true; } catch { return false; }
}
