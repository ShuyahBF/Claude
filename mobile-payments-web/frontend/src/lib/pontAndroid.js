// Pont entre le site auRor et l'application Android auRor (version hybride).
//
// Dans l'application, le site est affiché dans une fenêtre intégrée qui expose l'objet « window.AuRorAndroid » (code natif). Dans un navigateur ordinaire
// cet objet n'existe pas : toutes les fonctions ci-dessous rendent alors « indisponible » et le site se comporte comme d'habitude.
//
// Pour un développeur WinDev : c'est l'équivalent d'un appel à une DLL du téléphone. Les réponses asynchrones (paiement direct, lecture des SMS)
// reviennent par une fonction de rappel enregistrée sous un numéro (window.auRorRetour[numéro]) que le code natif appelle.

/** Vrai si le site est ouvert dans l'application Android auRor. */
export const dansApplication = () => typeof window !== "undefined" && !!window.AuRorAndroid;

/** Capacités de l'application : { version, direct (envoi du code USSD), sms (lecture des SMS) } ; null hors application. */
export function capacites() {
  try {
    return dansApplication() ? JSON.parse(window.AuRorAndroid.capacites()) : null;
  } catch {
    return null;
  }
}

/** Enregistre un rappel sous un numéro unique et rend (numéro, promesse). */
function attendreRetour() {
  window.auRorRetour = window.auRorRetour || {};
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const promesse = new Promise((resoudre) => {
    window.auRorRetour[id] = (json) => {
      delete window.auRorRetour[id];
      try { resoudre(typeof json === "string" ? JSON.parse(json) : json); } catch { resoudre({ erreur: "Réponse illisible de l'application." }); }
    };
  });
  return [id, promesse];
}

/**
 * Paiement direct : l'application affiche sa propre fenêtre de confirmation (résumé), demande le code secret si le code contient le mot PIN,
 * envoie le code USSD et rend { texte } (réponse de l'opérateur) ou { erreur }. Le code secret ne passe jamais par le site.
 */
export function payerDirect({ operateur, code, resume }) {
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.payerDirect(id, operateur, code, resume);
  return promesse;
}

/**
 * Paiement direct avec FENÊTRE DE SÉCURITÉ (lot 120) : l'application demande à l'utilisateur de RETAPER le montant (il doit correspondre à `montant`) et de saisir son
 * code secret ; le code (qui contient le mot PIN) n'est envoyé qu'après cette validation. Rend { texte } ou { erreur }.
 */
export function payerDirectMontant({ operateur, code, resume, montant }) {
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.payerDirectMontant(id, operateur, code, resume, String(montant));
  return promesse;
}

/**
 * Paiement direct EN DEUX TEMPS : `code` est SANS code secret. L'application affiche la fenêtre de sécurité (montant retapé + code secret), compose le code,
 * et un service d'accessibilité tape le code secret dans la fenêtre de l'opérateur. Rend { texte } (réponse finale) ou { erreur }.
 */
export function payerDirectDialogue({ operateur, code, resume, montant }) {
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.payerDirectDialogue(id, operateur, code, resume, String(montant));
  return promesse;
}

/** Lit les SMS de paiement reçus ces derniers jours (version « direct » seulement) : rend { sms: [{ adresse, recu_le, corps }] } ou { erreur }. */
export function lireSmsPaiements(jours = 30) {
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.lireSmsPaiements(id, jours);
  return promesse;
}

/** Ouvre le composeur du téléphone avec le code pré-rempli (toutes les versions de l'application). */
export function composer(code) {
  if (dansApplication()) window.AuRorAndroid.composer(code);
}
