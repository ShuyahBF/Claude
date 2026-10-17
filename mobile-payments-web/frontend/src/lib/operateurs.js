// ============================================================================
// Opérateur d'un numéro burkinabè et mise en forme lisible d'un numéro (lot 57).
// RÈGLE CONFIRMÉE PAR LE PROPRIÉTAIRE (11/10/2026, plateforme ZandGo) — identique ici :
//   - tous les numéros du Burkina Faso (+226) ont EXACTEMENT 8 chiffres nationaux (un numéro peut commencer par 0 : 07 33 23 13) ;
//   - le 2e chiffre de ces 8 chiffres donne le réseau : 0, 1, 2, 3 → Moov ; 4, 5, 6, 7 → Orange ; 8, 9 → Telecel.
// L'opérateur sert à l'AFFICHAGE (pastille) : il ne change rien aux paiements.
// Affichage d'un numéro : groupes de 2 chiffres (« +226 07 33 23 13 »).
// Pour un développeur WinDev : de simples « procédures globales » sans accès à la base.
// ============================================================================
const INDICATIF_BF = "226";
const LONGUEUR_BF = 8;
const RESEAUX = { 0: "Moov", 1: "Moov", 2: "Moov", 3: "Moov", 4: "Orange", 5: "Orange", 6: "Orange", 7: "Orange", 8: "Telecel", 9: "Telecel" };

const chiffres = (tel) => String(tel || "").replace(/\D/g, "");

/** Réseau d'un numéro international (« +22607332313 » → « Orange ») ; null si le numéro n'est pas burkinabè ou n'a pas 8 chiffres nationaux. */
export function operateurBf(tel) {
  const c = chiffres(tel);
  if (!c.startsWith(INDICATIF_BF) || c.length !== INDICATIF_BF.length + LONGUEUR_BF) return null;
  return RESEAUX[c[INDICATIF_BF.length + 1]] || null;
}

/** Numéro lisible : « 22607332313 » → « +226 07 33 23 13 » (groupes de 2 au Burkina) ; autre pays : « +chiffres ». "" si rien. */
export function formaterTelephone(tel) {
  const c = chiffres(tel);
  if (!c) return "";
  if (c.startsWith(INDICATIF_BF) && c.length === INDICATIF_BF.length + LONGUEUR_BF) return `+${INDICATIF_BF} ${c.slice(3).match(/.{2}/g).join(" ")}`;
  return `+${c}`;
}

/** Chiffres nationaux groupés par 2 (« 07332313 » → « 07 33 23 13 »), pour l'affichage pendant la saisie. */
export const grouperPar2 = (national) => (String(national || "").replace(/\D/g, "").match(/.{1,2}/g) || []).join(" ");
