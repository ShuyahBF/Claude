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
import { chargerContacts, enregistrerContact } from "@/lib/carnet";
import { chargerEntrees, enregistrerEntree, lireCleCoffre, memoriserCleCoffre, suffixeUtilisateur } from "@/lib/journalIntime";
import { chargerLignes, enregistrerLignes, fusionner } from "@/lib/smsPaiements";

export const VERSION_INSTANTANE = 1;

// ---- Choix de l'utilisateur, gardé sur ce téléphone (le serveur garde aussi le mode, pour qu'un NOUVEAU téléphone sache qu'une sauvegarde existe) ----
const cle = (nom) => `auror_sauv_${nom}${suffixeUtilisateur()}`;
const lire = (nom, st = localStorage) => { try { return st.getItem(cle(nom)); } catch { return null; } };
const ecrire = (nom, v, st = localStorage) => { try { st.setItem(cle(nom), v); } catch { /* stockage indisponible */ } };
export const empreinteMemorisee = () => lire("empreinte");
export const derniereSauvegardeLocale = () => lire("derniere");
export const enregistrerResultat = (empreinte, quand) => { ecrire("empreinte", empreinte); ecrire("derniere", quand); };
export const oublierResultat = () => { try { localStorage.removeItem(cle("empreinte")); localStorage.removeItem(cle("derniere")); } catch { /* sans importance */ } };
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

/** Sauvegarde maintenant (si `force`) ou seulement si les données ont changé. Rend { fait, raison?, maj_le? } ; la clé du coffre vient de la mémoire (coffre ouvert) ou de l'appareil. */
export async function sauvegarder(cleLocale, { force = false, app = "" } = {}) {
  const cleCoffre = cleCourante() || (await lireCleCoffre());
  if (!cleCoffre) return { fait: false, raison: "coffre_ferme" };
  const inst = await construireInstantane(cleLocale);
  if (instantaneVide(inst) && !force) return { fait: false, raison: "rien" };
  const empreinte = await empreinteInstantane(inst);
  if (!force && empreinte === empreinteMemorisee()) return { fait: false, raison: "inchange" };
  const r = await envoyerSauvegarde(await chiffrerInstantane(inst, cleCoffre), app);
  enregistrerResultat(empreinte, r.maj_le);
  return { fait: true, maj_le: r.maj_le };
}
/** Mémorise la clé du coffre ouverte sur cet appareil (sauvegarde automatique sans redemander la phrase). */
export async function memoriserCoffreOuvert() { const k = cleCourante(); if (k) await memoriserCleCoffre(k); return !!k; }
