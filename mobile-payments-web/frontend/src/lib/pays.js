// ============================================================================
// Pays et indicatifs téléphoniques (lot 55) : liste unique utilisée partout où un numéro de téléphone est attendu
// (connexion, inscription, profil, anniversaires, support). Burkina Faso par défaut.
//   longueur : nombre EXACT de chiffres du numéro national quand il est fixe (Burkina Faso : 8, règle du propriétaire du 11/10/2026) ;
//   zero : le numéro national peut s'écrire avec un 0 de tête qui doit disparaître en format international (ex. France 06… → +33 6…).
// ============================================================================
export const PAYS = [
  { longueur: 8, code: "BF", nom: "Burkina Faso", indicatif: "226", drapeau: "🇧🇫" },
  { code: "CI", nom: "Côte d'Ivoire", indicatif: "225", drapeau: "🇨🇮" },
  { longueur: 8, code: "ML", nom: "Mali", indicatif: "223", drapeau: "🇲🇱" },
  { longueur: 9, code: "SN", nom: "Sénégal", indicatif: "221", drapeau: "🇸🇳" },
  { longueur: 8, code: "NE", nom: "Niger", indicatif: "227", drapeau: "🇳🇪" },
  { longueur: 8, code: "TG", nom: "Togo", indicatif: "228", drapeau: "🇹🇬" },
  { code: "BJ", nom: "Bénin", indicatif: "229", drapeau: "🇧🇯" },
  { longueur: 9, code: "GN", nom: "Guinée", indicatif: "224", drapeau: "🇬🇳" },
  { longueur: 8, code: "MR", nom: "Mauritanie", indicatif: "222", drapeau: "🇲🇷" },
  { code: "GH", nom: "Ghana", indicatif: "233", drapeau: "🇬🇭", zero: true },
  { code: "NG", nom: "Nigéria", indicatif: "234", drapeau: "🇳🇬", zero: true },
  { longueur: 9, code: "CM", nom: "Cameroun", indicatif: "237", drapeau: "🇨🇲" },
  { code: "GA", nom: "Gabon", indicatif: "241", drapeau: "🇬🇦" },
  { code: "CG", nom: "Congo", indicatif: "242", drapeau: "🇨🇬" },
  { code: "CD", nom: "RD Congo", indicatif: "243", drapeau: "🇨🇩", zero: true },
  { longueur: 8, code: "TD", nom: "Tchad", indicatif: "235", drapeau: "🇹🇩" },
  { code: "MA", nom: "Maroc", indicatif: "212", drapeau: "🇲🇦", zero: true },
  { code: "DZ", nom: "Algérie", indicatif: "213", drapeau: "🇩🇿", zero: true },
  { code: "TN", nom: "Tunisie", indicatif: "216", drapeau: "🇹🇳" },
  { code: "FR", nom: "France", indicatif: "33", drapeau: "🇫🇷", zero: true },
  { code: "BE", nom: "Belgique", indicatif: "32", drapeau: "🇧🇪", zero: true },
  { code: "CH", nom: "Suisse", indicatif: "41", drapeau: "🇨🇭", zero: true },
  { code: "DE", nom: "Allemagne", indicatif: "49", drapeau: "🇩🇪", zero: true },
  { code: "GB", nom: "Royaume-Uni", indicatif: "44", drapeau: "🇬🇧", zero: true },
  { code: "IT", nom: "Italie", indicatif: "39", drapeau: "🇮🇹" },
  { code: "ES", nom: "Espagne", indicatif: "34", drapeau: "🇪🇸" },
  { code: "US", nom: "États-Unis / Canada", indicatif: "1", drapeau: "🇺🇸" },
];

export const PAYS_DEFAUT = "BF";
export const AUTRE = "__autre";                 // « Autre indicatif… » : l'utilisateur saisit lui-même l'indicatif

export const libellePays = (p) => `${p.drapeau} ${p.nom} (+${p.indicatif})`;
export const trouverPays = (code) => PAYS.find((p) => p.code === code) || PAYS[0];

/** Numéro international « +22670000000 » à partir du pays et du numéro national saisi ; "" si rien n'est saisi. */
export function assembler(indicatif, national, zero = false) {
  let chiffres = String(national || "").replace(/\D/g, "");
  if (!chiffres) return "";
  if (zero && chiffres.startsWith("0")) chiffres = chiffres.slice(1);
  return `+${String(indicatif || "").replace(/\D/g, "")}${chiffres}`;
}

/** Décompose une valeur enregistrée (« +22670000000 », « 70 00 00 00 ») en {pays (code ou AUTRE), indicatif, national}. */
export function separer(valeur) {
  const v = String(valeur || "").trim();
  if (!v) return { pays: PAYS_DEFAUT, indicatif: trouverPays(PAYS_DEFAUT).indicatif, national: "" };
  const chiffres = v.replace(/\D/g, "");
  const international = v.startsWith("+") || v.startsWith("00");
  if (!international) return { pays: PAYS_DEFAUT, indicatif: trouverPays(PAYS_DEFAUT).indicatif, national: v };   // numéro local : pays par défaut
  const sans = v.startsWith("00") ? chiffres.slice(2) : chiffres;
  const p = [...PAYS].sort((a, b) => b.indicatif.length - a.indicatif.length).find((x) => sans.startsWith(x.indicatif));
  if (p) return { pays: p.code, indicatif: p.indicatif, national: sans.slice(p.indicatif.length) };
  return { pays: AUTRE, indicatif: sans.slice(0, 3), national: sans.slice(3) };       // indicatif hors liste
}
