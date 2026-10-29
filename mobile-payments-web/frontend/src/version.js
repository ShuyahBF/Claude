// ============================================================================
// VERSION ET LOT DE LA PLATEFORME PAIEMENT MOBILE — SOURCE UNIQUE
// ============================================================================
//
// Règle permanente du propriétaire : version et lot TOUJOURS à jour à chaque
// déploiement, et version + date/heure de déploiement toujours affichées.
//
// À FAIRE À CHAQUE DÉPLOIEMENT (donc dans chaque PR fusionnée) :
//   1. VERSION : ajouter 1 au nombre ci-dessous (compteur de déploiements).
//   2. LOT     : mettre le numéro de la PR GitHub fusionnée pour ce
//                déploiement (ex. PR #13 → LOT = 13).
//
// Ce fichier est aussi RELU par l'API (backend/version_plateforme.py) pour
// GET /api/version et pour le signal de présence envoyé à SAWALI : il n'y a
// qu'un seul endroit à modifier.
//
// La date/heure de déploiement (= date de compilation du site) et le hash
// court du commit sont calculés AUTOMATIQUEMENT à la compilation
// (voir vite.config.js) : rien à saisir.
//
// Libellés affichés (règle commune à toutes les plateformes) :
//   - court    (connexion + pages connectées) :
//       « Version 1 · déployée le 11/10/2026 21:10 »   (ni lot ni commit)
//   - détaillé (page d'administration uniquement) :
//       « Version 1 · Lot 13 · 1a2b3c4 · déployée le 11/10/2026 21:10 »
// La date est affichée à l'heure de Ouagadougou (Africa/Ouagadougou = UTC).
// ============================================================================

// Compteur de déploiements : +1 à chaque déploiement.
export const VERSION = 90;

// Numéro de la PR GitHub fusionnée pour ce déploiement.
export const LOT = 104;

// Hash court du commit compilé (RENDER_GIT_COMMIT sur Render, sinon `git`),
// injecté par vite.config.js. "dev" si introuvable.
export const COMMIT = import.meta.env.VITE_COMMIT_BUILD || "dev";

// Date et heure de compilation (ISO, UTC), injectées par vite.config.js.
export const DATE_BUILD = import.meta.env.VITE_DATE_BUILD || "";

// Date/heure au format français court « JJ/MM/AAAA HH:MM ». "" si absente ou invalide.
function dateHeureFrancaise(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    // Heure de Ouagadougou (UTC toute l'année) : même affichage pour tous
    timeZone: "Africa/Ouagadougou",
  });
}
export const DATE_BUILD_FR = dateHeureFrancaise(DATE_BUILD);

// ----------------------------------------------------------------------------
// libelleVersion(detaille) : texte prêt à afficher.
//   detaille = false (par défaut) → « Version 1 · déployée le 11/10/2026 21:10 »
//   detaille = true               → « Version 1 · Lot 13 · 1a2b3c4 · déployée le 11/10/2026 21:10 »
// Sans date connue, la partie « déployée le … » est simplement omise.
// ----------------------------------------------------------------------------
export function libelleVersion(detaille = false) {
  const morceaux = [`Version ${VERSION}`];
  if (detaille) {
    // Lot et commit : réservés à la page d'administration
    morceaux.push(`Lot ${LOT}`, COMMIT);
  }
  if (DATE_BUILD_FR) morceaux.push(`déployée le ${DATE_BUILD_FR}`);
  return morceaux.join(" · ");
}

// Libellé court (connexion et pages connectées).
export const LIBELLE_VERSION = libelleVersion(false);

// Libellé « ver » du menu latéral (lot 33) : uniquement la version et la date de déploiement du site,
// ex. « Ver 19 · 17/10/2026 08:09 ». Ni lot, ni commit, ni information sur l'API.
export const LIBELLE_VER = `Ver ${VERSION}${DATE_BUILD_FR ? ` · ${DATE_BUILD_FR}` : ""}`;
