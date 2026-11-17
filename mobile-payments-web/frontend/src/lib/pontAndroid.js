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

/** Journal des envois USSD tenu par l'application (code composé, réponses exactes de l'opérateur, échecs ; le code secret y est masqué) : texte, ou "" hors application. */
export function journalUssd() {
  try { return dansApplication() && window.AuRorAndroid.journalUssd ? String(window.AuRorAndroid.journalUssd() || "") : ""; } catch { return ""; }
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

/** Vrai si l'accès aux notifications est activé pour l'application (lecture des paiements même application fermée). */
export function notificationsActives() {
  try { return dansApplication() && !!window.AuRorAndroid.notificationsActives && !!window.AuRorAndroid.notificationsActives(); } catch { return false; }
}

/** Ouvre le réglage système « Accès aux notifications » (à activer une seule fois). */
export function ouvrirReglagesNotifications() {
  try { if (dansApplication() && window.AuRorAndroid.ouvrirReglagesNotifications) window.AuRorAndroid.ouvrirReglagesNotifications(); } catch { /* sans effet */ }
}

/**
 * Lecture optique du montant : l'application ouvre l'appareil photo (ou la galerie), lit le texte SUR le téléphone (l'image n'est ni gardée ni envoyée) et rend
 * { montants: [{ valeur, texte, ligne }] } du plus probable au moins probable, ou { erreur }. Rend { erreur } hors application.
 */
export function lireMontantPhoto() {
  if (!dansApplication() || !window.AuRorAndroid.lireMontant) return Promise.resolve({ erreur: "La lecture du montant par l'appareil photo n'existe que dans l'application." });
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.lireMontant(id);
  return promesse;
}

/**
 * Saisie vocale du montant : l'application ouvre l'écoute du téléphone (français) et rend { transcriptions: [...] } (la plus probable d'abord) ou { erreur }.
 * Le site en tire le montant (lib/montantParle.js) et le fait VALIDER en toutes lettres par l'utilisateur.
 */
export function dicterMontantVoix() {
  if (!dansApplication() || !window.AuRorAndroid.dicterMontant) return Promise.resolve({ erreur: "La saisie vocale n'existe que dans l'application." });
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.dicterMontant(id);
  return promesse;
}

/** Ouvre les réglages d'auRor dans le téléphone (pour autoriser le micro, la caméra…). Rend vrai si l'application l'a fait. */
export function ouvrirReglagesApplication() {
  try { if (dansApplication() && window.AuRorAndroid.ouvrirReglagesApplication) { window.AuRorAndroid.ouvrirReglagesApplication(); return true; } } catch { /* sans effet */ }
  return false;
}

/** Notifications de paiement reçues application fermée : [{ adresse, recu_le, corps }]. La lecture VIDE la liste d'attente de l'application (à enregistrer tout de suite). */
export function notificationsEnAttente() {
  try {
    if (!dansApplication() || !window.AuRorAndroid.notificationsEnAttente) return [];
    const l = JSON.parse(window.AuRorAndroid.notificationsEnAttente() || "[]");
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}

// ---- Coffre de données protégé par l'empreinte OU le code du téléphone (Android Keystore) ----
/** Vrai si l'application peut mémoriser le secret du coffre (le téléphone a un verrouillage d'écran). */
export function coffreTelephoneDisponible() {
  try { return dansApplication() && !!window.AuRorAndroid.coffreDisponible && !!window.AuRorAndroid.coffreDisponible(); } catch { return false; }
}
/** Vrai si le secret du coffre est déjà mémorisé sur ce téléphone. */
export function coffreTelephoneMemorise() {
  try { return coffreTelephoneDisponible() && !!window.AuRorAndroid.coffreMemorise(); } catch { return false; }
}
/** Mémorise le secret : le téléphone demande l'empreinte ou son code. Rend { ok } ou { erreur }. */
export function coffreTelephoneMemoriser(secret) {
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.coffreMemoriser(id, String(secret));
  return promesse;
}
/** Retrouve le secret mémorisé après empreinte / code du téléphone. Rend { secret } ou { erreur }. */
export function coffreTelephoneRetrouver() {
  const [id, promesse] = attendreRetour();
  window.AuRorAndroid.coffreRetrouver(id);
  return promesse;
}
/** Oublie le secret mémorisé sur ce téléphone. */
export function coffreTelephoneOublier() {
  try { if (dansApplication()) window.AuRorAndroid.coffreOublier(); } catch { /* sans importance */ }
}

// ---- Connexion au SITE par l'empreinte du téléphone ----
// Un secret propre à ce téléphone (fabriqué par le serveur) est rangé dans le coffre Android ; il ne ressort qu'après reconnaissance de l'empreinte.
/** Vrai si l'application peut ranger le secret de connexion (version de l'application récente + verrouillage d'écran). */
export function empreinteConnexionDisponible() {
  try { return dansApplication() && !!window.AuRorAndroid.empreinteConnexionMemorisee && coffreTelephoneDisponible(); } catch { return false; }
}
/** Vrai si une empreinte de connexion est déjà enregistrée sur ce téléphone. */
export function empreinteConnexionMemorisee() {
  try { return empreinteConnexionDisponible() && !!window.AuRorAndroid.empreinteConnexionMemorisee(); } catch { return false; }
}
/** Range { id, secret } après reconnaissance du téléphone. Rend { ok } ou { erreur }. */
export function empreinteConnexionMemoriser(id, secret) {
  const [num, promesse] = attendreRetour();
  window.AuRorAndroid.empreinteConnexionMemoriser(num, JSON.stringify({ id, secret }));
  return promesse;
}
/** Demande l'empreinte et rend { id, secret } (ou { erreur }). */
export function empreinteConnexionRetrouver() {
  const [num, promesse] = attendreRetour();
  window.AuRorAndroid.empreinteConnexionRetrouver(num);
  return promesse;
}
/** Oublie l'empreinte de connexion de ce téléphone. */
export function empreinteConnexionOublier() {
  try { if (dansApplication() && window.AuRorAndroid.empreinteConnexionOublier) window.AuRorAndroid.empreinteConnexionOublier(); } catch { /* sans importance */ }
}
