// ============================================================================
// copieLocale.js — COPIE DE SÉCURITÉ CHIFFRÉE EN FICHIER sur le téléphone (auRor, demande du propriétaire, 23/11/2026) :
// « sauvegarder toutes les données sur le périphérique, de manière cryptée ».
//
// Même instantané et même chiffrement que la sauvegarde en ligne (lib/sauvegarde.js : journal intime, carnet de contacts, lignes de paiement des SMS), chiffrés avec la CLÉ DU COFFRE
// (celle de votre secret : PIN ou phrase) ; le fichier est enregistré où l'on veut (Documents, carte SD…) et survit à la désinstallation. Restauration : « fusionnée, rien n'est écrasé »
// (seuls les éléments absents du téléphone sont ajoutés), comme pour la sauvegarde en ligne. Sans le secret du même compte, le fichier est illisible.
//
// Pour un développeur WinDev : le fichier est un texte « AURSAUV1 » suivi, à la ligne, du contenu chiffré en base64 ; les fonctions ci-dessous préparent et relisent ce texte.
// L'enregistrement et le choix du fichier passent par l'application Android (pont) ou, dans un navigateur, par le téléchargement et le choix de fichier habituels.
// ============================================================================
import { cleCourante } from "@/lib/archiveCrypto";
import { lireCleCoffre } from "@/lib/journalIntime";
import { chiffrerInstantane, comptesInstantane, construireInstantane, empreinteInstantane, lireInstantane, resumeComptes, restaurerInstantane, SauvegardeRefusee, verifierCompletude } from "@/lib/sauvegarde";

export const ENTETE = "AURSAUV1";

/** Nom du fichier proposé : auror-AAAA-MM-JJ-HHMM.aursauv */
export function nomFichier(maintenant = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `auror-${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}-${p(maintenant.getHours())}${p(maintenant.getMinutes())}.aursauv`;
}

/** Texte du fichier : en-tête + contenu chiffré. */
export const texteFichier = (contenu) => `${ENTETE}\n${contenu}`;

/** Contenu chiffré d'un texte de fichier ; lève une erreur claire si ce n'est pas une copie d'auRor. */
export function contenuDuTexte(texte) {
  const t = String(texte || "").trim();
  if (t === ENTETE) throw new Error("Cette copie de sécurité est vide ou abîmée.");
  if (!t.startsWith(`${ENTETE}\n`)) throw new Error("Ce fichier n'est pas une copie de sécurité d'auRor.");
  const contenu = t.slice(ENTETE.length + 1).trim();
  if (!contenu) throw new Error("Cette copie de sécurité est vide ou abîmée.");
  return contenu;
}

/** Clé du coffre (ouverte ou mémorisée sur ce téléphone) ; null si le coffre est fermé : le secret doit alors être redemandé. */
const cleDuCoffre = async () => cleCourante() || (await lireCleCoffre());

/**
 * Prépare la copie : instantané COMPLET (contrôle de complétude), chiffré, puis RELU (le fichier doit redonner exactement les mêmes données).
 * Rend { ok:true, texte, nom, comptes } ou { ok:false, raison:"coffre_ferme"|"vide"|"refusee", message }.
 */
export async function preparerCopie(cleLocale, maintenant = new Date()) {
  const cleCoffre = await cleDuCoffre();
  if (!cleCoffre) return { ok: false, raison: "coffre_ferme", message: "Remettez votre secret (code PIN ou phrase) pour chiffrer la copie." };
  const inst = await construireInstantane(cleLocale, maintenant);
  if (!inst.journal.length && !inst.carnet.length && !inst.sms.length) return { ok: false, raison: "vide", message: "Ce téléphone ne contient encore aucune donnée à copier." };
  try {
    verifierCompletude(inst);
    const contenu = await chiffrerInstantane(inst, cleCoffre);
    if ((await empreinteInstantane(await lireInstantane(contenu, cleCoffre))) !== (await empreinteInstantane(inst))) throw new SauvegardeRefusee("Copie REFUSÉE : le fichier chiffré ne redonne pas les mêmes données. Rien n'a été enregistré.");
    return { ok: true, texte: texteFichier(contenu), nom: nomFichier(maintenant), comptes: comptesInstantane(inst), resume: resumeComptes(comptesInstantane(inst)) };
  } catch (e) { return { ok: false, raison: "refusee", message: e?.message || "Copie impossible." }; }
}

/** Lit un fichier de copie avec la clé du coffre ; rend { ok:true, inst, comptes } ou { ok:false, message }. Ne modifie rien. */
export async function lireCopie(texte) {
  try {
    const cleCoffre = await cleDuCoffre();
    if (!cleCoffre) return { ok: false, raison: "coffre_ferme", message: "Remettez votre secret (code PIN ou phrase) : il ouvre le fichier." };
    const inst = await lireInstantane(contenuDuTexte(texte), cleCoffre);
    return { ok: true, inst, comptes: comptesInstantane(inst), resume: resumeComptes(comptesInstantane(inst)) };
  } catch (e) { return { ok: false, message: e?.message?.startsWith("Ce fichier") || e?.message?.startsWith("Cette copie") ? e.message : "Fichier illisible : mauvais secret (autre compte ?) ou fichier abîmé." }; }
}

/** Restaure SANS RIEN ÉCRASER (éléments absents ajoutés) ; rend le nombre d'éléments ajoutés { journal, carnet, sms }. */
export const restaurerCopie = (inst, cleLocale) => restaurerInstantane(inst, cleLocale);

/** Dans un navigateur ordinaire : télécharge le texte comme fichier. */
export function telechargerNavigateur(nom, texte) {
  const url = URL.createObjectURL(new Blob([texte], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
