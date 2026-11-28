// Tri des tableaux (règle 19) : 1er clic croissant, 2e décroissant, 3e ordre d'origine.
// Vides toujours en dernier ; texte sans accents ni casse ; nombres et dates comparés pour de vrai.
const sansAccents = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const vide = (v) => v === null || v === undefined || v === "";

export function comparer(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const da = Date.parse(a), db = Date.parse(b);
  if (/^\d{4}-\d{2}-\d{2}/.test(String(a)) && !Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return sansAccents(a).localeCompare(sansAccents(b), "fr", { numeric: true });
}

/** @param lignes tableau d'objets ; @param cle fonction (ligne) => valeur ; @param sens "asc" | "desc" | null */
export function trierLignes(lignes, cle, sens) {
  if (!sens || !cle) return lignes;
  const f = sens === "asc" ? 1 : -1;
  const pleines = lignes.filter((l) => !vide(cle(l)));
  const vides = lignes.filter((l) => vide(cle(l)));
  return [...pleines.sort((x, y) => f * comparer(cle(x), cle(y))), ...vides];   // vides en dernier quel que soit le sens
}

export const sensSuivant = (s) => (s === null ? "asc" : s === "asc" ? "desc" : null);

/** Majuscule à chaque mot d'un libellé de menu (règle 18) ; sigles intacts, mot après apostrophe inchangé. */
export function titreMenu(t) {
  return t.replace(/(^|\s)([a-zà-ÿ])/g, (_, esp, c) => esp + c.toUpperCase());
}
