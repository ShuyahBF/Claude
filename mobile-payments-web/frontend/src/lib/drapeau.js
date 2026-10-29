// Drapeau d'un pays (lot 101 — auRor) à partir de son code ISO à 2 lettres : « BF » → 🇧🇫.
// Un drapeau est formé de deux « lettres indicateurs régionaux » Unicode ; les téléphones Android et iPhone les dessinent en drapeau.
// Sur un ordinateur Windows, le navigateur affiche à la place les deux lettres (« BF ») : l'information reste lisible.
// Renvoie "" si le code est absent ou invalide. Pour un développeur WinDev : une simple procédure globale, sans accès à la base.
export function drapeau(code) {
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}
