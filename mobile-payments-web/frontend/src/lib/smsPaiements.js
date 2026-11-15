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

const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Nom répété : « ALIMENTATION LA MENAGERE ALIMENTATION LA MENAGERE » → « ALIMENTATION LA MENAGERE » (Orange écrit souvent le nom du marchand deux fois).
 * Si les premiers mots sont répétés juste après, on ne garde que la première occurrence.
 */
export function sansRepetition(nom) {
  const mots = String(nom || "").trim().split(/\s+/).filter(Boolean);
  for (let n = 1; n <= Math.floor(mots.length / 2); n++) {
    const debut = mots.slice(0, n).map((m) => m.toLowerCase()).join(" ");
    const suite = mots.slice(n, 2 * n).map((m) => m.toLowerCase()).join(" ");
    if (debut === suite) return mots.slice(0, n).join(" ");
  }
  return mots.join(" ");
}

/**
 * Numéro de téléphone de l'expéditeur dans un SMS d'argent REÇU (Orange précise le numéro, pas le nom). Les montants, soldes et numéros de transaction sont écartés avant la recherche.
 * 8 chiffres (Burkina) ou 11 à 13 chiffres avec l'indicatif (226…), séparateurs permis. Rend le numéro en chiffres groupés par deux, ou "" si aucun.
 */
export function telephoneDe(texte) {
  const propre = String(texte || "").replace(REFERENCE, " ").replace(MONTANT_APRES, " ").replace(MONTANT_AVANT, " ").replace(SOLDE, " ");
  const re = /\+?\d[\d .\-]{6,16}\d/g;
  let m;
  while ((m = re.exec(propre))) {
    const chiffres = m[0].replace(/\D/g, "");
    if (chiffres.length === 8) return chiffres.replace(/(\d{2})(?=\d)/g, "$1 ");
    if (chiffres.length >= 11 && chiffres.length <= 13) return "+" + chiffres.slice(0, chiffres.length - 8) + " " + chiffres.slice(-8).replace(/(\d{2})(?=\d)/g, "$1 ");
  }
  return "";
}

/**
 * Tiers de l'opération :
 *  - argent REÇU : le NUMÉRO DE TÉLÉPHONE de l'expéditeur (le SMS ne donne pas son nom) ;
 *  - PAIEMENT effectué : le NOM DU MARCHAND seul (jamais son code), dédoublonné car souvent écrit deux fois.
 */
function tiersDe(texte, genre) {
  if (genre === "RECETTE") return telephoneDe(texte);
  const apresMontant = texte.replace(/^.*?(?:fcfa|f\s?cfa|xof)\s+/i, "");
  const re = /(?:^|\s)(?:à|a|au profit de|chez|vers|pour|auprès de)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9'’ &.\-]{1,100}?)(?=\s+(?:le\s+\d|du\s+\d|n°|num|numéro|ref|réf|frais|solde|montant|trans|a\s+[ée]t[ée]|est\s+[ée]t[ée]|effectu|avec\s+succ)|[,;\n]|\.\s|$)/i;
  const m = re.exec(apresMontant);
  return m ? sansRepetition(m[1].trim().replace(/[.\-]+$/, "")).slice(0, 60) : "";
}

// ---- Classement des SMS : promo / alerte / message / transaction (même règle que SAWALI lot 398 et Concentration 1.29) ----
// Pour un développeur WinDev : on additionne des POINTS. Chaque signe commercial (code USSD, « composez », validité, pourcentage, verbes d'offre) en ajoute ;
// chaque signe de vraie transaction (numéro de transaction, « Débit Montant : », « Vous avez reçu… ») en retire. À 4 points ou plus : promotion.
// Seule une TRANSACTION du portefeuille mobile devient une ligne : promo, alerte de banque et message d'une personne sont lus puis oubliés.
export const SEUIL_PROMO = 4;
const RE_USSD = /\*\d{2,4}(\*[\w#*]*)?#/;
const RE_APPEL = /stop \*|envoyez stop|composez|tapez/;
const RE_VALIDITE = /jusqu|valable|a partir de/;
const RE_POURCENT = /[0-9]\s?%/;
const RE_OFFRE = /beneficiez|profitez|gagnez|retirez|reglez|rechargez|abonnez|obtenez|offre|promo|bonus|cadeau|vous accompagne|decouvrez/;
const RE_VRAIE_FORME = /(debit|credit)\s*montant\s*:/;
const RE_VOUS_AVEZ = /vous avez (recu|envoye|paye|transfere|effectu)/;
const RE_BANQUE = /ubabf|\buba\b|banque|bank|coris|ecobank|sgbf|\bboa\b|bicia|bdm|cbao|sonibank|societe generale/;
const RE_NUMERO_EXPEDITEUR = /^\+?\d{7,}$/;

/** Points « promotion » d'un SMS (reference = numéro de transaction trouvé dans le SMS, ou null). */
export function scorePromo(corps, reference) {
  const t = sansAccents(corps);
  return (RE_USSD.test(t) ? 3 : 0) + (RE_APPEL.test(t) ? 2 : 0) + (RE_VALIDITE.test(t) ? 2 : 0) + (RE_POURCENT.test(t) ? 2 : 0) + (RE_OFFRE.test(t) ? 2 : 0)
    - (reference ? 5 : 0) - (RE_VRAIE_FORME.test(t) ? 5 : 0) - (RE_VOUS_AVEZ.test(t) ? 3 : 0);
}

/** Catégorie d'un SMS : "alerte" (banque) → "message" (expéditeur = numéro de téléphone) → "promo" (score ≥ 4) → sinon "transaction". */
export function categorieSms({ adresse, corps }) {
  const a = String(adresse || "").trim();
  if (RE_VRAIE_FORME.test(sansAccents(corps)) || RE_BANQUE.test(sansAccents(a))) return "alerte";
  if (RE_NUMERO_EXPEDITEUR.test(a.replace(/\s/g, ""))) return "message";
  const ref = (REFERENCE.exec(corps || "") || [])[1] || null;
  return scorePromo(corps, ref) >= SEUIL_PROMO ? "promo" : "transaction";
}

/**
 * Un SMS (adresse, recu_le en ms, corps) → une ligne, ou null (pas de montant, ou transaction dont le sens est indéterminé).
 * Un SMS qui n'est pas une TRANSACTION (promo, alerte de banque, message de personne) est GARDÉ avec sa `categorie` (pastille grise à l'écran) et le sens « AUTRE » :
 * il ne compte jamais comme paiement (voir estTransaction). Les mots promotionnels explicites (« gagnez », « jeu concours »…) donnent aussi « promo ».
 */
export function analyserSms({ adresse, recu_le: recuLe, corps }) {
  const t = String(corps || "").toLowerCase();
  let categorie = categorieSms({ adresse, corps });
  if (categorie === "transaction" && MOTS_PROMO.some((m) => t.includes(m))) categorie = "promo";
  const montant = montantDe(corps);
  if (!montant) return null;
  const sens = MOTS_RECETTE.some((m) => t.includes(m)) ? "RECETTE" : MOTS_DEPENSE.some((m) => t.includes(m)) ? "DEPENSE" : null;
  if (categorie === "transaction" && !sens) return null;          // prudence : sens indéterminé = ignoré plutôt que mal classé
  const genre = sens || "AUTRE";
  const ref = (REFERENCE.exec(corps) || [])[1] || null;
  const soldeM = SOLDE.exec(corps);
  const quand = dateDeReference(ref) || recuLe;
  return { id: ref || `${adresse}|${recuLe}|${montant}`, adresse, quand, genre, categorie, montant, tiers: tiersDe(corps, genre), solde: soldeM ? lireNombre(soldeM[1]) : null, reference: ref };
}

/** Vrai pour une vraie transaction du portefeuille mobile (les lignes anciennes, sans catégorie, en sont). Les autres sont hors décompte. */
export const estTransaction = (ligne) => !ligne?.categorie || ligne.categorie === "transaction";

/** Les deux noms désignent-ils le même marchand ? Sans accents ni casse ; l'un contient l'autre, ou tous les mots (3 lettres et plus) du plus court figurent dans l'autre. */
export function memeMarchand(nomSms, nomEnregistre) {
  const a = sansAccents(sansRepetition(nomSms)).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const b = sansAccents(sansRepetition(nomEnregistre)).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (a.length < 4 || b.length < 4) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  const mots = court.split(" ").filter((m) => m.length >= 3);
  return mots.length >= 2 && mots.every((m) => long.includes(m));
}

/**
 * Ce SMS CONFIRME-T-IL le paiement envoyé ? Le MONTANT seul ne suffit jamais : il faut aussi le MARCHAND.
 * Orange n'affiche, pour un paiement, que le NOM du marchand (souvent écrit deux fois) : on compare ce nom à celui enregistré dans auRor avec le code marchand.
 * Si le SMS porte le code marchand lui-même, il est accepté aussi. Un marchand sans nom enregistré ne peut pas être confirmé automatiquement (bouton « J'ai payé »).
 *  - montant identique ; SMS de dépense (pas de l'argent reçu) arrivé après l'envoi (une minute de marge).
 */
export function confirmePaiement(sms, { montant, codeMarchand, libelle, envoyeLe }) {
  if (!sms || (envoyeLe && sms.recu_le < envoyeLe - 60000)) return false;
  const ligne = analyserSms(sms);
  if (!ligne || !estTransaction(ligne) || ligne.genre !== "DEPENSE" || ligne.montant !== montant) return false;
  const corps = String(sms.corps || "");
  if (codeMarchand && corps.replace(/\D+/g, " ").split(" ").includes(String(codeMarchand))) return true;     // le code figure dans le SMS
  return !!libelle && memeMarchand(ligne.tiers, libelle);                                                       // sinon : le nom du marchand
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
