// ============================================================================
// ussdLocal.js — Préparation d'un paiement SUR LE TÉLÉPHONE, sans connexion (lot 192). Logique PURE, testée (tests/ussdLocal.test.mjs).
//
// Au moment de payer, la connexion Internet peut être instable ou perdue. Le code USSD, lui, ne passe pas par Internet : il part par le réseau du téléphone.
// Ce fichier reproduit donc côté téléphone ce que fait le serveur (backend/ussd.py `construire_code`) : même contrôle de chaque champ, même résultat.
// Le serveur RECALCULE toujours le code quand le paiement lui est transmis ensuite : le code calculé ici n'est jamais cru sur parole.
// Le code secret (PIN) n'est jamais ici : le mot « PIN » reste dans la séquence, l'application Android le remplace dans sa fenêtre sécurisée.
// ============================================================================
export const MONTANT_MAX = 10_000_000;            // même garde-fou que le serveur (FCFA)

export class ErreurSaisie extends Error {}

/** Clés attendues par un gabarit, dans l'ordre (ex. « *144*10*{code}*{amount}# » → ["code", "amount"]). */
export const placeholders = (gabarit) => [...String(gabarit || "").matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);

/** Remplace chaque {cle} par la valeur saisie, après contrôle de chaque champ (messages identiques à ceux du serveur). Lève ErreurSaisie sinon. */
export function construireCode(gabarit, champs, valeurs) {
  const libelles = Object.fromEntries((champs || []).map((c) => [c.key, c.label || c.key]));
  const types = Object.fromEntries((champs || []).map((c) => [c.key, c.type || "numeric"]));
  let code = String(gabarit || "");
  for (const cle of placeholders(gabarit)) {
    let brut = String(valeurs?.[cle] ?? "").trim().replace(/ /g, "");
    const libelle = libelles[cle] || cle;
    if (!brut) throw new ErreurSaisie(`« ${libelle} » est obligatoire`);
    if ((types[cle] || "numeric") === "numeric" && !/^[0-9]+$/.test(brut)) throw new ErreurSaisie(`« ${libelle} » ne doit contenir que des chiffres`);
    if (types[cle] === "text" && !/^[0-9A-Za-z]+$/.test(brut)) throw new ErreurSaisie(`« ${libelle} » ne doit contenir que des lettres et des chiffres`);
    if (cle === "amount") {
      const montant = parseInt(brut, 10);
      if (montant <= 0) throw new ErreurSaisie("Le montant doit être supérieur à 0");
      if (montant > MONTANT_MAX) throw new ErreurSaisie("Montant trop élevé : vérifiez la saisie");
      brut = String(montant);                      // retire les zéros de tête
    }
    code = code.split(`{${cle}}`).join(brut);
  }
  return code;
}

/** Identifiant d'un paiement préparé hors connexion : « local- » + identifiant aléatoire (le serveur n'accepte que ce format pour le rattrapage). */
export const identifiantLocal = (aleatoire = () => globalThis.crypto.randomUUID()) => `local-${aleatoire()}`;

/**
 * Paiement préparé localement, de MÊME FORME que celui que renvoie le serveur (POST /paiements), plus `hors_ligne: true`.
 *  - service : un service du catalogue (id, operateur, nom, categorie, gabarit_ussd, champs) tel que gardé dans le cache chiffré ;
 *  - valeurs : saisie de l'utilisateur ; marchandsConnus : [{ code, libelle }] (cache) pour retrouver le nom du marchand.
 * Lève ErreurSaisie si la saisie est refusée.
 */
export function preparerPaiementLocal(service, valeurs, { marchandsConnus = [], maintenant = new Date(), aleatoire } = {}) {
  let champs = service.champs || [];
  let gabarit = service.gabarit_ussd || "";
  if (gabarit.includes("{pin}")) {                  // code secret : jamais demandé ici ; le mot PIN reste dans la séquence
    gabarit = gabarit.split("{pin}").join("PIN");
    champs = champs.filter((c) => c.key !== "pin");
  }
  const code = construireCode(gabarit, champs, valeurs);
  const propres = Object.fromEntries(champs.map((c) => [c.key, String(valeurs?.[c.key] ?? "").trim().replace(/ /g, "")]));
  const champMarchand = champs.find((c) => c.isMerchantCode);
  let marchand = null;
  if (champMarchand) {
    const codeMarchand = propres[champMarchand.key];
    marchand = { code: codeMarchand, libelle: (marchandsConnus.find((m) => String(m.code) === codeMarchand) || {}).libelle || null };
  }
  return {
    id: identifiantLocal(aleatoire), service_id: service.id, operateur: service.operateur, service_nom: service.nom, categorie: service.categorie,
    valeurs: propres, marchand, montant: /^[0-9]+$/.test(propres.amount || "") ? parseInt(propres.amount, 10) : null, code_ussd: code,
    statut: "prepare", cree_le: maintenant.toISOString(), hors_ligne: true,
  };
}
