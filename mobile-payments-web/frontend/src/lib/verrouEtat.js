// ============================================================================
// ÉTAT DU VERROU D'ÉCRAN (logique pure, testée : tests/verrouEtat.test.mjs)
// ----------------------------------------------------------------------------
// Le verrou d'écran (components/VerrouEcran.jsx) garde un drapeau dans sessionStorage pour survivre à un rechargement (F5).
// Ce drapeau appartient à UNE SESSION de connexion. Avant ce correctif il n'était effacé qu'au déverrouillage : si la session
// expirait ou si l'on se déconnectait pendant le verrou, il restait à « 1 » et, à la connexion suivante (mot de passe OU empreinte),
// l'écran se verrouillait aussitôt : « Vous avez quitté la page », alors que la personne venait de s'identifier.
// Règle : se connecter, s'inscrire, se déconnecter ou perdre la session EFFACE le drapeau.
// Pour un développeur WinDev : sessionStorage = un petit tableau clé / valeur gardé par l'onglet, comme une variable globale d'application.
// ============================================================================
export const CLE_VERROU = "mpw_verrou_ecran";

const stockageDefaut = () => { try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; } };

/** Vrai si le drapeau « écran verrouillé » est posé. */
export function lireDrapeau(stockage = stockageDefaut()) {
  try { return stockage?.getItem(CLE_VERROU) === "1"; } catch { return false; }
}

/** Pose (v = true) ou efface (v = false) le drapeau. */
export function ecrireDrapeau(v, stockage = stockageDefaut()) {
  try { if (v) stockage?.setItem(CLE_VERROU, "1"); else stockage?.removeItem(CLE_VERROU); } catch { /* stockage indisponible */ }
}

/** À appeler quand une identification vient de réussir ou que la session se termine : plus aucun verrou ne doit rester. */
export function effacerVerrou(stockage = stockageDefaut()) {
  ecrireDrapeau(false, stockage);
}

/**
 * Fenêtre d'identification du téléphone (empreinte, code) : elle passe AU-DESSUS de la page, qui perd alors le focus. Ce n'est pas un départ de
 * l'utilisateur. La page partage la tolérance `window.__mpwTolerance` (voir ProtectionCaptures) : on la prolonge pendant l'attente de la
 * réponse, puis de 2 s après (le focus revient un instant plus tard). Rend la même promesse.
 */
export function avecTolerance(promesse, cible = typeof window === "undefined" ? {} : window, maintenant = () => Date.now()) {
  cible.__mpwTolerance = maintenant() + 120000;                 // le temps maximal de réponse de l'utilisateur
  const fin = () => { cible.__mpwTolerance = maintenant() + 2000; };
  promesse.then(fin, fin);
  return promesse;
}
