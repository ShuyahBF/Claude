// ============================================================================
// horsLigne.js — Paiement quand la connexion Internet est instable ou perdue (lot 192).
//
// Décision du propriétaire (17/11/2026) : au moment du paiement la connexion mobile peut être perdue ; les informations nécessaires doivent donc être
// disponibles en LOCAL et CRYPTÉES. Ce fichier fournit :
//  1. un CACHE CHIFFRÉ (AES-256-GCM, clé NON EXTRACTIBLE gardée dans IndexedDB, propre à chaque compte : la même que celle du journal) des listes utiles au paiement
//     (opérateurs, services avec leurs séquences USSD, marchands connus). Chaque fois que le réseau répond, le cache est renouvelé ;
//     sans réseau, c'est le cache qui répond ;
//  2. une FILE D'ATTENTE chiffrée des paiements préparés hors connexion et des changements de statut : elle est envoyée au serveur, sans doublon, au retour du réseau.
// Le code secret (PIN) n'est JAMAIS gardé : ni dans le cache, ni dans la file.
//
// Pour un développeur WinDev : c'est l'équivalent d'une base locale (HFSQL Classic) chiffrée qu'on synchronise avec le serveur quand le réseau revient.
// Les fonctions acceptent `{ stockage, cle }` pour être testées sur ordinateur (tests/horsLigne.test.mjs) sans navigateur.
// ============================================================================
import { chiffrer, cleDuJournal, dechiffrer, suffixeUtilisateur } from "@/lib/journalIntime";

const PREFIXE = "mpw_hl_";
const cleStock = (nom) => `${PREFIXE}${nom}${suffixeUtilisateur()}`;
const stockageParDefaut = () => (typeof localStorage !== "undefined" ? localStorage : null);

/** Vrai si l'échec vient du RÉSEAU (aucune réponse du serveur, ou serveur injoignable 502 / 503 / 504) : seul cas où le mode hors connexion prend le relais. */
export const estErreurReseau = (erreur) => !erreur?.response || [502, 503, 504].includes(erreur.response.status);

// ---------------------------------------------------------------------------------------------------------------------------------------
// 1. Cache chiffré
// ---------------------------------------------------------------------------------------------------------------------------------------
/** Écrit une valeur (JSON) dans le cache chiffré. N'échoue jamais : un cache indisponible ne doit jamais empêcher de payer. */
export async function cacheEcrire(nom, valeur, { stockage = stockageParDefaut(), cle } = {}) {
  try {
    const k = cle || await cleDuJournal();
    stockage.setItem(cleStock(nom), JSON.stringify({ t: Date.now(), p: await chiffrer(k, valeur) }));
    return true;
  } catch { return false; }
}

/** Lit le cache : { valeur, t } (t = instant de la dernière mise à jour), ou null s'il est absent, abîmé ou chiffré avec une autre clé. */
export async function cacheLire(nom, { stockage = stockageParDefaut(), cle } = {}) {
  try {
    const brut = stockage.getItem(cleStock(nom));
    if (!brut) return null;
    const { t, p } = JSON.parse(brut);
    const valeur = await dechiffrer(cle || await cleDuJournal(), p);
    return valeur === null ? null : { valeur, t };
  } catch { return null; }
}

/**
 * Lit en ligne ET garde une copie chiffrée ; si le RÉSEAU manque, rend la copie.
 * Rend { data, horsLigne, depuis } ; `depuis` = instant de la copie utilisée. Une erreur du serveur (400, 401, 403, 404…) n'est jamais masquée par le cache.
 */
export async function chargerAvecCache(nom, recuperer, options = {}) {
  try {
    const data = await recuperer();
    await cacheEcrire(nom, data, options);
    return { data, horsLigne: false, depuis: null };
  } catch (erreur) {
    if (!estErreurReseau(erreur)) throw erreur;
    const copie = await cacheLire(nom, options);
    if (!copie) throw erreur;
    return { data: copie.valeur, horsLigne: true, depuis: copie.t };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2. File d'attente chiffrée
// ---------------------------------------------------------------------------------------------------------------------------------------
const ORDRE = { prepare: 0, abandonne: 1, envoye: 1, effectue: 2 };       // un statut ne revient jamais en arrière (même règle que le serveur)

export async function fileLire(options = {}) {
  const c = await cacheLire("file", options);
  return Array.isArray(c?.valeur) ? c.valeur : [];
}
const fileEcrire = (liste, options = {}) => cacheEcrire("file", liste, options);

/** Ajoute un paiement préparé hors connexion (de la forme rendue par preparerPaiementLocal) : seuls les champs utiles au serveur sont gardés. */
export async function fileAjouterPaiement(paiement, options = {}) {
  const liste = await fileLire(options);
  if (liste.some((e) => e.id === paiement.id)) return liste.length;
  liste.push({ type: "paiement", id: paiement.id, service_id: paiement.service_id, valeurs: paiement.valeurs, cree_le: paiement.cree_le, statut: paiement.statut || "prepare" });
  await fileEcrire(liste, options);
  return liste.length;
}

/** Note un changement de statut : s'il y a déjà un paiement en attente avec cet identifiant, son statut avance (jamais en arrière) ; sinon une mise à jour est mise en file. */
export async function fileMajStatut(id, statut, options = {}) {
  const liste = await fileLire(options);
  const present = liste.find((e) => e.id === id);
  if (present) {
    if ((ORDRE[statut] ?? 0) > (ORDRE[present.statut] ?? 0)) present.statut = statut;
  } else liste.push({ type: "statut", id, statut });
  await fileEcrire(liste, options);
  return liste.length;
}

export async function fileNombre(options = {}) { return (await fileLire(options)).length; }

let synchroEnCours = false;
/**
 * Envoie la file au serveur, dans l'ordre. `api` = le client HTTP (apiClient). Comportement :
 *  - succès → l'élément sort de la file ; le serveur est IDEMPOTENT : un renvoi ne crée jamais de doublon ;
 *  - réseau perdu → on s'arrête, tout reste en file pour la prochaine fois ;
 *  - refus définitif du serveur (400 saisie refusée, 403, 404, 409, 422) → l'élément est ABANDONNÉ (le renvoyer ne changerait rien) et compté dans `abandonnes`.
 * Rend { envoyes, abandonnes, restants }.
 */
export async function fileSynchroniser(api, options = {}) {
  if (synchroEnCours) return { envoyes: 0, abandonnes: 0, restants: await fileNombre(options), occupe: true };
  synchroEnCours = true;
  let envoyes = 0, abandonnes = 0;
  try {
    const liste = await fileLire(options);
    const reste = [];
    let coupe = false;
    for (const e of liste) {
      if (coupe) { reste.push(e); continue; }
      try {
        if (e.type === "paiement") await api.post("/paiements/hors-ligne", { id: e.id, service_id: e.service_id, valeurs: e.valeurs, cree_le: e.cree_le, statut: e.statut });
        else await api.put(`/paiements/${e.id}/statut`, { statut: e.statut });
        envoyes += 1;
      } catch (erreur) {
        if (estErreurReseau(erreur)) { coupe = true; reste.push(e); } else abandonnes += 1;
      }
    }
    await fileEcrire(reste, options);
    return { envoyes, abandonnes, restants: reste.length };
  } finally { synchroEnCours = false; }
}
