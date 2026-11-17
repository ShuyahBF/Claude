// ============================================================================
// sauvegarde.js — Sauvegarde en ligne CHIFFRÉE d'auRor (lot 168) : journal intime, carnet de contacts, lignes de paiement des SMS.
//
// Principe (comme WhatsApp quand on change de téléphone) : le site construit un « instantané » de vos données, le CHIFFRE ici avec la clé de votre coffre
// (celle de vos archives : phrase secrète ou code PIN, code de secours, application d'authentification) puis envoie des octets illisibles à auRor.
// Ni auRor ni SAWALI ne peuvent les lire. Sur un nouveau téléphone : connexion, phrase secrète, et les données reviennent (fusionnées, rien n'est écrasé).
//
// Pour un développeur WinDev : les fonctions « pures » (instantané, empreinte, fusion) se testent sur ordinateur (tests/sauvegarde.test.mjs) ;
// les appels réseau passent par apiClient (même session que le reste du site).
// ============================================================================
import { apiClient } from "@/lib/api";
import { chiffrerJson, cleCourante, dechiffrerJson } from "@/lib/archiveCrypto";
import { chargerContacts, enregistrerContact, nombreContactsStockes } from "@/lib/carnet";
import { chargerEntrees, enregistrerEntree, lireCleCoffre, memoriserCleCoffre, nombreEntreesStockees, suffixeUtilisateur } from "@/lib/journalIntime";
import { chargerLignes, enregistrerLignes, fusionner } from "@/lib/smsPaiements";

export const VERSION_INSTANTANE = 1;

// ---- Choix de l'utilisateur, gardé sur ce téléphone (le serveur garde aussi le mode, pour qu'un NOUVEAU téléphone sache qu'une sauvegarde existe) ----
const cle = (nom) => `auror_sauv_${nom}${suffixeUtilisateur()}`;
const lire = (nom, st = localStorage) => { try { return st.getItem(cle(nom)); } catch { return null; } };
const ecrire = (nom, v, st = localStorage) => { try { st.setItem(cle(nom), v); } catch { /* stockage indisponible */ } };
export const empreinteMemorisee = () => lire("empreinte");
export const derniereSauvegardeLocale = () => lire("derniere");
export const enregistrerResultat = (empreinte, quand, comptes) => { ecrire("empreinte", empreinte); ecrire("derniere", quand); if (comptes) ecrire("comptes", JSON.stringify(comptes)); };
export const oublierResultat = () => { try { ["empreinte", "derniere", "comptes", "alerte"].forEach((n) => localStorage.removeItem(cle(n))); } catch { /* sans importance */ } };
/** Contenu de la dernière sauvegarde VÉRIFIÉE (pour détecter une sauvegarde qui contiendrait soudain moins de données). */
export const comptesMemorises = () => { try { return JSON.parse(lire("comptes") || "null"); } catch { return null; } };
/** Alerte laissée par la sauvegarde automatique quand elle s'est suspendue (affichée dans le profil) ; null si tout va bien. */
export const alerteSauvegarde = () => lire("alerte");
export const poserAlerte = (texte) => ecrire("alerte", texte);
export const effacerAlerte = () => { try { localStorage.removeItem(cle("alerte")); } catch { /* sans importance */ } };

// ---- Vérifications (règle du propriétaire, 17/11/2026, après l'incident de Personnel de maison 1.35 : une sauvegarde incomplète ne doit JAMAIS partir en silence) ----
/** Nombre d'éléments de chaque sorte. */
export const comptesInstantane = (inst) => ({ journal: inst.journal.length, carnet: inst.carnet.length, sms: inst.sms.length });
export const totalComptes = (c) => (c ? c.journal + c.carnet + c.sms : 0);
export const resumeComptes = (c) => `${c.journal} page(s) de journal, ${c.carnet} contact(s), ${c.sms} ligne(s) de SMS`;
/** Erreur d'une sauvegarde REFUSÉE par les contrôles : le message dit pourquoi (rien n'a été envoyé ou la copie reçue est suspecte). */
export class SauvegardeRefusee extends Error { constructor(m) { super(m); this.name = "SauvegardeRefusee"; } }
/**
 * Contrôle 1 — complétude : l'instantané doit contenir TOUT ce qui est stocké. `chargerEntrees` et `chargerContacts` ignorent en silence une entrée illisible
 * (clé locale inexacte, donnée abîmée) : sans ce contrôle, une sauvegarde partielle remplacerait la bonne.
 */
export function verifierCompletude(inst, stockage = localStorage) {
  const stocke = { journal: nombreEntreesStockees(stockage), carnet: nombreContactsStockes(stockage), sms: chargerLignes(stockage).length };
  const lu = comptesInstantane(inst);
  const manque = ["journal", "carnet", "sms"].filter((k) => lu[k] !== stocke[k]);
  if (manque.length) throw new SauvegardeRefusee(`Sauvegarde REFUSÉE pour ne rien perdre : ${resumeComptes(stocke)} sont stockés sur ce téléphone mais seuls ${resumeComptes(lu)} ont pu être lus. Reconnectez-vous et réessayez.`);
}
export const reporterChoix = () => { try { sessionStorage.setItem(cle("plus_tard"), "1"); } catch { /* sans importance */ } };
export const choixReporte = () => { try { return sessionStorage.getItem(cle("plus_tard")) === "1"; } catch { return false; } };

// ---- Instantané (pur) ----
/** Instantané de toutes les données sauvegardées : { v, le, journal, carnet, sms }. Les données locales sont lues (déchiffrées) avec la clé de cet appareil. */
export async function construireInstantane(cleLocale, maintenant = new Date()) {
  return { v: VERSION_INSTANTANE, le: maintenant.toISOString(), journal: await chargerEntrees(cleLocale), carnet: await chargerContacts(cleLocale), sms: chargerLignes() };
}
/** Empreinte (SHA-256 hexadécimal) du CONTENU d'un instantané, sans sa date : sert à ne sauvegarder que ce qui a changé. */
export async function empreinteInstantane(inst) {
  const { le: _le, ...contenu } = inst;
  const o = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(contenu))));
  return Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Y a-t-il quelque chose à sauvegarder ? */
export const instantaneVide = (inst) => !inst.journal.length && !inst.carnet.length && !inst.sms.length;

/** Chiffre un instantané avec la clé du coffre → texte base64 à envoyer. */
export const chiffrerInstantane = (inst, cleCoffre) => chiffrerJson(inst, cleCoffre);
/** Déchiffre une sauvegarde → instantané, ou lève une erreur (mauvaise clé, données altérées). */
export async function lireInstantane(contenu, cleCoffre) {
  const inst = await dechiffrerJson(contenu, cleCoffre);
  if (!inst || inst.v !== VERSION_INSTANTANE || !Array.isArray(inst.journal) || !Array.isArray(inst.carnet) || !Array.isArray(inst.sms)) throw new Error("Sauvegarde d'une version inconnue");
  return inst;
}

/**
 * Restaure un instantané SANS RIEN ÉCRASER : ne sont ajoutés que les éléments absents de ce téléphone (même identifiant = on garde la version locale).
 * Rend { journal, carnet, sms } : le nombre d'éléments ajoutés.
 */
export async function restaurerInstantane(inst, cleLocale, stockage = localStorage) {
  const entrees = new Set((await chargerEntrees(cleLocale)).map((e) => e.id));
  let journal = 0;
  for (const e of inst.journal) if (e?.id && !entrees.has(e.id)) { if (await enregistrerEntree(cleLocale, e)) journal += 1; }
  const contacts = new Set((await chargerContacts(cleLocale)).map((c) => c.id));
  let carnet = 0;
  for (const c of inst.carnet) if (c?.id && !contacts.has(c.id)) { if (await enregistrerContact(cleLocale, c)) carnet += 1; }
  const { lignes, nouvelles } = fusionner(chargerLignes(stockage), inst.sms.filter(Boolean));
  if (nouvelles) enregistrerLignes(lignes, stockage);
  return { journal, carnet, sms: nouvelles };
}

// ---- Serveur ----
export const lireEtatServeur = async () => { try { return (await apiClient.get("/sauvegarde/etat")).data; } catch { return null; } };
export const definirModeServeur = (mode) => apiClient.put("/sauvegarde/mode", { mode }).then((r) => r.data);
export const envoyerSauvegarde = (contenu, app = "") => apiClient.put("/sauvegarde", { contenu, app }).then((r) => r.data);
export const telechargerSauvegarde = (precedente = false) => apiClient.get("/sauvegarde", { params: precedente ? { precedente: true } : {} }).then((r) => r.data);
export const effacerSauvegardeServeur = () => apiClient.delete("/sauvegarde").then((r) => r.data);

/**
 * Sauvegarde maintenant (si `force`) ou seulement si les données ont changé. Rend { fait, raison?, maj_le?, comptes?, verifie? }.
 * Contrôles AVANT et APRÈS l'envoi (aucune sauvegarde « à peu près ») :
 *   1. complétude : tout ce qui est stocké est dans l'instantané ;
 *   2. aller-retour local : l'instantané chiffré se déchiffre et redonne exactement le même contenu ;
 *   3. pas de régression : une sauvegarde VIDE ou contenant MOINS d'éléments que la dernière vérifiée n'écrase pas la bonne (raison « vide » / « moins »), sauf `confirmerMoins` ;
 *   4. après l'envoi (sauvegarde manuelle ou première) : on RELIT la copie du serveur et on vérifie qu'elle redonne le même contenu.
 */
export async function sauvegarder(cleLocale, { force = false, app = "", confirmerMoins = false } = {}) {
  const cleCoffre = cleCourante() || (await lireCleCoffre());
  if (!cleCoffre) return { fait: false, raison: "coffre_ferme" };
  const inst = await construireInstantane(cleLocale);
  if (instantaneVide(inst) && !force) return { fait: false, raison: "rien" };
  verifierCompletude(inst);
  const comptes = comptesInstantane(inst);
  const empreinte = await empreinteInstantane(inst);
  if (!force && empreinte === empreinteMemorisee()) return { fait: false, raison: "inchange" };
  const contenu = await chiffrerInstantane(inst, cleCoffre);
  if ((await empreinteInstantane(await lireInstantane(contenu, cleCoffre))) !== empreinte) throw new SauvegardeRefusee("Sauvegarde REFUSÉE : la copie chiffrée ne redonne pas les mêmes données. Rien n'a été envoyé.");
  if (!confirmerMoins) {
    const etat = await lireEtatServeur();
    const ancien = comptesMemorises();
    if (etat?.existe && instantaneVide(inst)) return { fait: false, raison: "vide", comptes, ancien };
    if (ancien && totalComptes(comptes) < totalComptes(ancien)) return { fait: false, raison: "moins", comptes, ancien };
  }
  const r = await envoyerSauvegarde(contenu, app);
  let verifie = false;
  if (force) {                                         // sauvegarde manuelle : preuve de bout en bout (on relit ce que le serveur a gardé)
    const recu = await lireInstantane((await telechargerSauvegarde(false)).contenu, cleCoffre);
    if ((await empreinteInstantane(recu)) !== empreinte) throw new SauvegardeRefusee("La copie gardée par le serveur ne correspond pas à vos données : la version précédente reste disponible. Réessayez.");
    verifie = true;
  }
  enregistrerResultat(empreinte, r.maj_le, comptes);
  effacerAlerte();
  return { fait: true, maj_le: r.maj_le, comptes, verifie };
}
/** Mémorise la clé du coffre ouverte sur cet appareil (sauvegarde automatique sans redemander la phrase). */
export async function memoriserCoffreOuvert() { const k = cleCourante(); if (k) await memoriserCleCoffre(k); return !!k; }
