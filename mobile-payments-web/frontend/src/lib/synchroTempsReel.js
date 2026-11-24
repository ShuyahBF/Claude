// ============================================================================
// synchroTempsReel.js — SYNCHRONISATION EN TEMPS RÉEL entre les appareils d'un même compte (lot 223) : partie qui parle au serveur et aux données du téléphone.
// La logique de comparaison et de fusion (pure, testée) est dans synchro.js ; le serveur (routes/flux.py) ne voit que des octets chiffrés.
//
// Déroulé (pour un développeur WinDev) :
//   - ÉCOUTE : une demande « attente longue » reste ouverte jusqu'à 25 s côté serveur ; dès qu'un autre appareil envoie un changement, il arrive ici en quelques secondes ;
//   - ENVOI : toutes les 4 s on regarde (sans rien déchiffrer) si les données de ce téléphone ont bougé ; si oui, on compare fiche par fiche et on envoie les seuls changements ;
//   - chaque changement est chiffré avec la clé du coffre (la même sur tous les appareils du compte) ; règle : le plus récent l'emporte, fiche par fiche, suppressions comprises.
// Démarrage : « Mon compte → Synchronisation entre appareils » (réglage gardé sur ce téléphone). Rien ne part tant que le coffre n'est pas ouvert sur cet appareil.
// ============================================================================
import { apiClient } from "@/lib/api";
import { chiffrerJson, cleCourante, dechiffrerJson } from "@/lib/archiveCrypto";
import { chargerContacts, enregistrerContact, supprimerContact } from "@/lib/carnet";
import { chargerEntrees, cleDuJournal, enregistrerEntree, lireCleCoffre, supprimerEntree, suffixeUtilisateur } from "@/lib/journalIntime";
import { EVENEMENT_MAJ as EVENEMENT_SMS } from "@/lib/lectureSms";
import { chargerBudget, enregistrerBudget } from "@/lib/budget";
import { chargerLignes, enregistrerLignes } from "@/lib/smsPaiements";
import { ID_BUDGET, TYPES, appliquerChangement, calculerChangements, etatVide, signatureTextes } from "@/lib/synchro";

export const EVENEMENT_SYNCHRO = "auror-synchro";          // annonce aux écrans que l'état de la synchronisation a changé
const PERIODE_ENVOI_MS = 4000;
const ATTENTE_S = 25;
const PAUSE_ERREUR_MS = 8000;

const cle = (nom) => `auror_synchro_${nom}${suffixeUtilisateur()}`;
const lire = (nom) => { try { return JSON.parse(localStorage.getItem(cle(nom)) || "null"); } catch { return null; } };
const ecrire = (nom, v) => { try { localStorage.setItem(cle(nom), JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const nouvelAppareil = () => { const o = crypto.getRandomValues(new Uint8Array(16)); return Array.from(o, (b) => b.toString(16).padStart(2, "0")).join(""); };

export const synchroActive = () => lire("actif") === true;
/** Identifiant ALÉATOIRE de cette installation (rien de personnel) : sert à ne pas se rejouer ses propres changements. */
export const identifiantAppareil = () => { let a = lire("appareil"); if (!a) { a = nouvelAppareil(); ecrire("appareil", a); } return a; };

// ---- État visible (mémoire du processus) ----
const statut = { enCours: false, tourne: false, derniere: null, erreur: "", recus: 0, envoyes: 0, prete: false };
export const statutSynchro = () => ({ ...statut, actif: synchroActive() });
const annoncer = () => { try { window.dispatchEvent(new Event(EVENEMENT_SYNCHRO)); } catch { /* sans importance */ } };
/** Vrai quand cet appareil a fait au moins un tour complet (envoi + réception) : la sauvegarde automatique attend ce moment pour ne rien écraser. */
export const synchroPrete = () => !synchroActive() || statut.prete;

// ---- Données de ce téléphone : lecture / écriture par type (adaptateurs) ----
function adaptateurs(cleLocale) {
  const dire = () => { try { window.dispatchEvent(new Event(EVENEMENT_SMS)); } catch { /* sans importance */ } };
  return {
    journal: { lire: () => chargerEntrees(cleLocale), ecrire: async (f) => (await enregistrerEntree(cleLocale, f)) !== null, supprimer: async (id) => supprimerEntree(id) },
    carnet: { lire: () => chargerContacts(cleLocale), ecrire: async (f) => (await enregistrerContact(cleLocale, f)) !== null, supprimer: async (id) => supprimerContact(id) },
    sms: {
      lire: async () => chargerLignes(),
      // Une ligne reçue garde les PHOTOS de cet appareil s'il en a pour elle (les photos ne voyagent pas)
      ecrire: async (f) => {
        const lignes = chargerLignes(); const i = lignes.findIndex((l) => l.id === f.id);
        const fiche = i >= 0 && lignes[i].pieces ? { ...f, pieces: lignes[i].pieces } : f;
        if (i >= 0) lignes[i] = fiche; else lignes.push(fiche);
        lignes.sort((a, b) => b.quand - a.quand);
        const ok = enregistrerLignes(lignes); if (ok) dire(); return ok;
      },
      supprimer: async (id) => { const ok = enregistrerLignes(chargerLignes().filter((l) => l.id !== id)); if (ok) dire(); return ok; },
    },
    budget: {
      lire: async () => { try { return localStorage.getItem("auror_budget") ? [{ id: ID_BUDGET, ...chargerBudget() }] : []; } catch { return []; } },
      ecrire: async (f) => { const { id: _i, ...b } = f; const ok = enregistrerBudget(b); if (ok) dire(); return ok; },
      supprimer: async () => false,                                          // un budget ne se supprime pas à distance
    },
  };
}
/** Signature rapide (sans déchiffrer) des textes stockés qui nous concernent : change dès qu'une donnée est écrite. */
function signatureLocale() {
  const s = suffixeUtilisateur();
  try { return signatureTextes([`mpw_journal_entrees${s}`, `mpw_carnet${s}`, "auror_sms_lignes", "auror_budget"].map((k) => localStorage.getItem(k))); } catch { return ""; }
}

// ---- Verrou : un seul passage de lecture / écriture des données à la fois ----
let file = Promise.resolve();
const exclusif = (f) => { const p = file.then(f, f); file = p.catch(() => {}); return p; };

let arret = true, etat = null, ad = null, cleCoffre = null, derniereSignature = null, minuteur = null, forcer = false;
const sauverEtat = () => ecrire("etat", etat);

/** Envoie les changements de ce téléphone (s'il y en a). */
async function pousser() {
  return exclusif(async () => {
    const donnees = {};
    for (const t of TYPES) donnees[t] = await ad[t].lire();
    const { changements, etat: suivant } = await calculerChangements(donnees, etat);
    if (!changements.length) return 0;
    const contenus = [];
    for (const c of changements) contenus.push(await chiffrerJson(c, cleCoffre));
    for (let i = 0; i < contenus.length; i += 100) await apiClient.post("/flux", { appareil: etat.appareil, changements: contenus.slice(i, i + 100) });
    etat = suivant;                                       // état mémorisé seulement APRÈS l'envoi réussi : un échec renverra les mêmes changements
    sauverEtat();
    statut.envoyes += changements.length;
    return changements.length;
  });
}

/** Rejoue sur ce téléphone un lot de changements reçus. */
async function appliquer(reponse) {
  return exclusif(async () => {
    let appliques = 0, derniere = etat.seq;
    for (const l of reponse.changements) {
      derniere = Math.max(derniere, l.seq);
      if (l.appareil === etat.appareil) continue;         // mes propres changements : déjà là
      let c;
      try { c = await dechiffrerJson(l.contenu, cleCoffre); } catch { statut.erreur = "Un changement n'a pas pu être lu (clé du coffre différente ?)."; continue; }
      const r = await appliquerChangement(c, l.appareil, etat, ad);
      if (r.applique) appliques += 1;
    }
    if (!reponse.changements.length) derniere = Math.max(derniere, reponse.seq || 0);
    etat.seq = derniere;
    sauverEtat();
    statut.recus += appliques;
    return appliques;
  });
}

/** Cet appareil est resté trop longtemps absent (des changements ont été purgés) : on repart de la sauvegarde en ligne (ajout seulement), puis du flux. */
async function reprendreDepuisSauvegarde(reponse) {
  try {
    const { telechargerSauvegarde, lireInstantane, restaurerInstantane } = await import("@/lib/sauvegarde");
    const inst = await lireInstantane((await telechargerSauvegarde(false)).contenu, cleCoffre);
    await restaurerInstantane(inst, await cleDuJournal());
  } catch { /* pas de sauvegarde en ligne : on repart du flux disponible */ }
  etat.seq = Math.max(0, (reponse.changements[0]?.seq || reponse.seq + 1) - 1);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function boucleEcoute() {
  while (!arret) {
    try {
      const { data } = await apiClient.get("/flux", { params: { apres: etat.seq, attente: ATTENTE_S }, timeout: (ATTENTE_S + 12) * 1000 });
      if (arret) break;
      if (data.reinitialiser) await reprendreDepuisSauvegarde(data);
      const n = await appliquer(data);
      statut.erreur = statut.erreur.startsWith("Un changement") ? statut.erreur : "";
      statut.derniere = new Date().toISOString();
      if (n) { derniereSignature = signatureLocale(); }  // nos propres écritures de réception ne sont pas des changements à renvoyer : l'état les connaît déjà
      annoncer();
    } catch (e) {
      if (arret) break;
      statut.erreur = e?.response?.status === 401 ? "Session expirée : reconnectez-vous." : "Hors connexion : la synchronisation reprendra toute seule.";
      annoncer();
      await pause(PAUSE_ERREUR_MS);
    }
  }
}

async function tourEnvoi() {
  if (arret || statut.enCours) return;
  const sig = signatureLocale();
  if (!forcer && sig === derniereSignature) return;
  statut.enCours = true; forcer = false;
  try {
    const n = await pousser();
    derniereSignature = signatureLocale();
    if (n) { statut.derniere = new Date().toISOString(); statut.erreur = ""; }
    statut.prete = true;
  } catch { statut.erreur = "Envoi impossible pour l'instant : nouvel essai dans un instant."; forcer = true; }
  finally { statut.enCours = false; annoncer(); }
}

/** Demande un passage d'envoi tout de suite (retour au premier plan, retour du réseau). */
export function synchroniserMaintenant() { forcer = true; tourEnvoi(); }

/** Démarre la synchronisation (si elle est activée sur ce téléphone et que le coffre est ouvert). Rend vrai si elle tourne. */
export async function demarrerSynchro() {
  if (!synchroActive() || !arret) return !arret;
  cleCoffre = cleCourante() || (await lireCleCoffre());
  if (!cleCoffre) { statut.erreur = "Ouvrez votre coffre (phrase secrète ou code) pour synchroniser."; annoncer(); return false; }
  const cleLocale = await cleDuJournal();
  ad = adaptateurs(cleLocale);
  etat = lire("etat") || etatVide(identifiantAppareil());
  etat.appareil = identifiantAppareil();
  arret = false; statut.tourne = true; statut.prete = false; derniereSignature = null; forcer = true;
  boucleEcoute();
  minuteur = setInterval(tourEnvoi, PERIODE_ENVOI_MS);
  tourEnvoi();
  document.addEventListener("visibilitychange", surVisibilite);
  window.addEventListener("online", synchroniserMaintenant);
  annoncer();
  return true;
}
const surVisibilite = () => { if (document.visibilityState === "visible") synchroniserMaintenant(); };

export function arreterSynchro() {
  arret = true; statut.tourne = false; statut.prete = false;
  if (minuteur) { clearInterval(minuteur); minuteur = null; }
  document.removeEventListener("visibilitychange", surVisibilite);
  window.removeEventListener("online", synchroniserMaintenant);
  annoncer();
}

/** Active la synchronisation sur CE téléphone (le coffre doit être ouvert). */
export async function activerSynchro() {
  if (!(cleCourante() || (await lireCleCoffre()))) return { ok: false, raison: "coffre_ferme" };
  ecrire("actif", true);
  identifiantAppareil();
  const ok = await demarrerSynchro();
  return { ok };
}

/** Désactive la synchronisation sur ce téléphone ; `effacerServeur` efface aussi le flux du compte (les autres appareils s'arrêteront d'être tenus à jour). */
export async function desactiverSynchro({ effacerServeur = false } = {}) {
  arreterSynchro();
  ecrire("actif", false);
  try { localStorage.removeItem(cle("etat")); } catch { /* sans importance */ }
  if (effacerServeur) { try { await apiClient.delete("/flux"); } catch { /* sans importance */ } }
  annoncer();
}
