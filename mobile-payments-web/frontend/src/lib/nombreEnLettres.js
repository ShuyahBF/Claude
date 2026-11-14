// Montant en LETTRES (français) : « 200000 » → « deux cent mille ». Sert à la fenêtre de sécurité du paiement direct : voir le montant écrit en toutes lettres
// aide à repérer une faute de frappe (20 000 au lieu de 200 000). Logique pure, testée par tests/nombreEnLettres.test.mjs.
const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99 (la dizaine « quatre-vingts » prend son s seulement quand rien ne la suit). */
function moinsDeCent(n, fin) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10), u = n % 10;
  if (d <= 6) return u === 0 ? DIZAINES[d] : u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
  if (d === 7) return u === 1 ? "soixante et onze" : `soixante-${UNITES[10 + u]}`;
  if (d === 8) return u === 0 ? (fin ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITES[u]}`;
  return `quatre-vingt-${UNITES[10 + u]}`;                       // 90 à 99
}

/** 0 à 999 ; « cent » prend son s seulement quand rien ne le suit (« deux cents » mais « deux cent mille »). */
function moinsDeMille(n, fin) {
  const c = Math.floor(n / 100), reste = n % 100;
  const centaines = c === 0 ? "" : c === 1 ? "cent" : `${UNITES[c]} cent`;
  if (reste === 0) return c === 0 ? "" : (c > 1 && fin ? `${centaines}s` : centaines);
  return (centaines ? `${centaines} ` : "") + moinsDeCent(reste, fin);
}

/** Entier positif en toutes lettres (jusqu'à 999 milliards) ; chaîne vide si ce n'est pas un entier positif. */
export function enLettres(valeur) {
  const n = Math.floor(Number(valeur));
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999_999) return "";
  if (n === 0) return "zéro";
  const groupes = [[1_000_000_000, "milliard"], [1_000_000, "million"]];
  let reste = n; const parties = [];
  for (const [valeurGroupe, nom] of groupes) {
    const q = Math.floor(reste / valeurGroupe);
    if (q > 0) { parties.push(`${moinsDeMille(q, false)} ${nom}${q > 1 ? "s" : ""}`); reste %= valeurGroupe; }
  }
  const milliers = Math.floor(reste / 1000);
  if (milliers > 0) { parties.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`); reste %= 1000; }
  if (reste > 0) parties.push(moinsDeMille(reste, true));
  return parties.join(" ");
}
