// ============================================================================
// carnet.js — Carnet de contacts de auRor (lot 167) : personnes à qui l'on envoie souvent de l'argent.
//
// Décisions du propriétaire (15/11/2026) : le carnet reste SUR LE TÉLÉPHONE (chiffré comme le journal intime, clé non extractible, propre au compte connecté),
// sans copie sur le serveur ; ajout en un geste depuis un SMS ou l'historique ; « Payer ce contact » prépare le transfert ; un montant habituel est mémorisé ;
// un paiement récurrent se programme par un RAPPEL (le site ne paie jamais seul : il rappelle l'échéance, la personne valide le paiement).
// Seul le rappel, s'il est créé, va sur le serveur : libellé + montant (jamais le numéro).
//
// Pour un développeur WinDev : fonctions pures testables sur ordinateur (frontend/tests/carnet.test.mjs) ; le chiffrement est celui du journal (lib/journalIntime.js).
// ============================================================================
import { chiffrer, dechiffrer, suffixeUtilisateur } from "./journalIntime.js";

/** Opérateurs proposés (liste fermée : ceux qui ont un « Transfert d'argent » dans le catalogue de auRor). */
export const OPERATEURS_CARNET = ["Orange", "Moov Africa"];
const CLE = () => `mpw_carnet${suffixeUtilisateur()}`;

/** Numéro burkinabè en 8 chiffres groupés par deux (« 54 14 47 22 »), indicatif 226 retiré ; null si ce n'est pas un numéro plausible. */
export function normaliserNumero(saisie) {
  let c = String(saisie || "").replace(/\D/g, "");
  if (c.startsWith("00226")) c = c.slice(5); else if (c.startsWith("226") && c.length === 11) c = c.slice(3);
  return c.length === 8 ? c.replace(/(\d{2})(?=\d)/g, "$1 ") : null;
}
/** Opérateur d'après l'expéditeur du SMS (« OrangeMoney » → Orange, « Moov Money » → Moov Africa) ; "" si inconnu. */
export function operateurDeAdresse(adresse) {
  const a = String(adresse || "").toLowerCase();
  return a.includes("orange") ? "Orange" : a.includes("moov") ? "Moov Africa" : "";
}
const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const chiffres = (t) => String(t || "").replace(/\D/g, "");

/** Contact portant ce numéro (comparaison sur les 8 derniers chiffres), ou undefined. */
export const trouverContact = (contacts, numero) => { const n = chiffres(numero).slice(-8); return n.length === 8 ? contacts.find((c) => chiffres(c.tel).slice(-8) === n) : undefined; };

/** Recherche par nom, surnom/note ou numéro (espaces ignorés). */
export function filtrerContacts(contacts, texte) {
  const t = sansAccents(texte).trim(), n = chiffres(texte);
  if (!t) return contacts;
  return contacts.filter((c) => sansAccents(`${c.nom} ${c.note || ""}`).includes(t) || (n.length >= 3 && chiffres(c.tel).includes(n)));
}
/** Contacts triés par nom (sans accents ni casse). */
export const trierContacts = (contacts) => [...contacts].sort((a, b) => sansAccents(a.nom).localeCompare(sansAccents(b.nom)));

/**
 * Adresse de l'écran de paiement, transfert prérempli (numéro, opérateur, montant) : l'utilisateur relit puis valide comme d'habitude.
 * `options.montant` remplace le montant habituel (ex. celui du rappel) ; `options.fige` grise le numéro (venant d'une fiche de rappel : le numéro est celui du contact, le montant reste modifiable).
 */
export function lienPayer(c, options = {}) {
  const q = new URLSearchParams({ transfert: "1", phone: chiffres(c.tel) });
  if (c.operateur) q.set("operateur", c.operateur);
  const montant = options.montant || c.montant;
  if (montant) q.set("montant", String(montant));
  if (options.fige) q.set("fige", "1");
  return `/?${q.toString()}`;
}

/** Contact d'un rappel de paiement : par son identifiant (rappels créés depuis le carnet), sinon par le titre « Envoyer à NOM » (premiers rappels). undefined si introuvable sur ce téléphone. */
export function contactDuRappel(contacts, rappel) {
  if (rappel?.contact_id) { const c = contacts.find((x) => x.id === rappel.contact_id); if (c) return c; }
  const m = /^Envoyer à (.+)$/.exec(rappel?.libelle || "");
  return m ? contacts.find((x) => sansAccents(x.nom) === sansAccents(m[1].trim())) : undefined;
}

/** Rappel de paiement récurrent à créer sur le serveur : libellé + montant seulement (jamais le numéro). Rend le corps de POST /rappels-paiements. */
export function corpsRappel(c, { frequence, echeance, rappel_jours = 1 }) {
  return { libelle: `Envoyer à ${c.nom}`.slice(0, 60), montant: c.montant ? Number(c.montant) : null, operateur: c.operateur === "Moov Africa" ? "Moov" : c.operateur || null, frequence, echeance, rappel_jours, note: null, contact_id: c.id || null };
}

// ---- Stockage chiffré (même clé que le journal) ----
const lirePaquets = (st) => { try { return JSON.parse(st.getItem(CLE()) || "[]"); } catch { return []; } };
/** Nombre de contacts STOCKÉS (lisibles ou non) : sert à vérifier qu'une sauvegarde n'en ignore aucun. */
export const nombreContactsStockes = (stockage = localStorage) => lirePaquets(stockage).length;
export async function chargerContacts(cle, stockage = localStorage) {
  const sortie = [];
  for (const p of lirePaquets(stockage)) { const c = await dechiffrer(cle, p); if (c) sortie.push({ ...c, id: p.id }); }
  return trierContacts(sortie);
}
/** Ajoute ou remplace un contact { id?, nom, tel, operateur, montant, note }. Rend l'id ou null (stockage plein). */
export async function enregistrerContact(cle, contact, stockage = localStorage) {
  const id = contact.id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { id: _i, ...contenu } = contact;
  const paquets = lirePaquets(stockage).filter((p) => p.id !== id);
  paquets.push({ id, ...(await chiffrer(cle, contenu)) });
  try { stockage.setItem(CLE(), JSON.stringify(paquets)); return id; } catch { return null; }
}
export function supprimerContact(id, stockage = localStorage) {
  try { stockage.setItem(CLE(), JSON.stringify(lirePaquets(stockage).filter((p) => p.id !== id))); return true; } catch { return false; }
}
