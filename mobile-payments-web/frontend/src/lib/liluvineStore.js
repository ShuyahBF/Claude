// CONVERSATION AVEC LILUVINE, gardée EN MÉMOIRE seulement (jamais sur disque, jamais sur un serveur : ce sont des confidences).
// Elle vit en dehors de l'écran « Journal » pour que la réponse de Liluvine ne soit pas perdue si l'utilisateur change de page
// pendant qu'elle réfléchit : le message arrive alors « hors page », un son et une bulle le signalent, et le menu affiche le nombre de messages non lus.
import { useSyncExternalStore } from "react";
import { apiClient } from "@/lib/api";
import { emotionDeTexte, bonjourDuMatin } from "@/lib/liluvineEmotion";
import { echangesPourLiluvine, VERSION_MENTIONS, accordDonne, pourUtilisateur } from "@/lib/journalIntime";
import { jouerBulle } from "@/lib/sonBulle";

let etat = { utilisateur: null, messages: [], attente: false, nonLus: 0, essais: null, refus: null, surLiluvine: false, bulle: null };
const abonnes = new Set();
let compteur = 0;
const emettre = (suite) => { etat = { ...etat, ...suite }; abonnes.forEach((f) => f()); };

/** Hook : l'état courant (messages, attente, nonLus, essais, refus, bulle…), remis à jour à chaque changement. */
export function useLiluvine() {
  return useSyncExternalStore((f) => { abonnes.add(f); return () => abonnes.delete(f); }, () => etat);
}
export const lireLiluvine = () => etat;

/** Un autre compte se connecte sur ce téléphone : la conversation du précédent est effacée de la mémoire. */
export function lierUtilisateur(id) { if (etat.utilisateur !== (id || null)) emettre({ utilisateur: id || null, messages: [], nonLus: 0, essais: null, refus: null, bulle: null, attente: false }); }

/** L'onglet « Liluvine » est affiché (vrai) ou quitté (faux) : l'afficher remet le compteur de messages non lus à zéro. */
export function surLiluvine(vu) {
  if (vu) oublierBonjourNonLu();                                                // le bonjour en attente est lu
  emettre(vu ? { surLiluvine: true, nonLus: 0, bulle: null } : { surLiluvine: false });
}

// ---- Bonjour du matin ----
// La conversation reste en mémoire (confidences), MAIS le bonjour du matin n'est pas une confidence (phrase locale) : il est gardé sur le téléphone
// jusqu'à sa lecture, pour que la pastille « non lu » du menu survive à la fermeture de l'application.
const cleBonjour = (id) => `mpw_liluvine_bonjour_${id}`;          // jour local du dernier bonjour
const cleBonjourNonLu = (id) => `mpw_liluvine_bonjour_nonlu_${id}`;   // { texte, emotion, quand } tant que non lu
const lireLS = (c) => { try { return localStorage.getItem(c); } catch { return null; } };
const ecrireLS = (c, v) => { try { localStorage.setItem(c, v); } catch { /* sans importance */ } };
function oublierBonjourNonLu() { if (etat.utilisateur) { try { localStorage.removeItem(cleBonjourNonLu(etat.utilisateur)); } catch { /* sans importance */ } } }

/**
 * À appeler pour le compte connecté (à l'ouverture, toutes les 10 minutes et au retour sur l'application) :
 *  1. remet à l'écran un bonjour déjà envoyé mais pas encore lu (pastille du menu) ;
 *  2. si c'est le matin et qu'aucun bonjour n'a été dit aujourd'hui, Liluvine écrit la première (bulle + son + pastille).
 * Rien n'est dit avant que l'utilisateur ait approuvé les mentions de Liluvine.
 */
export function verifierBonjour(idUtilisateur, maintenant = new Date()) {
  if (!idUtilisateur) return;
  lierUtilisateur(idUtilisateur);
  pourUtilisateur(idUtilisateur);
  if (!accordDonne("liluvine")) return;
  // 1. bonjour non lu mémorisé : on le remet dans la conversation (sans son), la pastille s'allume
  if (!etat.messages.some((m) => m.initiative)) {
    let attente = null; try { attente = JSON.parse(lireLS(cleBonjourNonLu(idUtilisateur)) || "null"); } catch { /* sans importance */ }
    if (attente?.texte && !etat.surLiluvine) {
      const message = { id: `m${++compteur}`, quand: attente.quand || Date.now(), role: "assistant", content: attente.texte, emotion: attente.emotion || "joie", initiative: true };
      emettre({ messages: [...etat.messages, message], nonLus: etat.nonLus + 1 });
    }
  }
  // 2. nouveau bonjour du matin
  const b = bonjourDuMatin({ maintenant, dernierBonjour: lireLS(cleBonjour(idUtilisateur)) });
  if (!b) return;
  ecrireLS(cleBonjour(idUtilisateur), b.jour);
  initiativeDeLiluvine(b.texte, b.emotion);
  if (!etat.surLiluvine) ecrireLS(cleBonjourNonLu(idUtilisateur), JSON.stringify({ texte: b.texte, emotion: b.emotion, quand: Date.now() }));
}
export function fermerBulle() { emettre({ bulle: null }); }

function ajouter(m) {
  const message = { id: `m${++compteur}`, quand: Date.now(), ...m };
  const hors = m.role === "assistant" && !etat.surLiluvine;                   // arrivé alors que l'écran de Liluvine n'est pas affiché
  emettre({ messages: [...etat.messages, message], nonLus: etat.nonLus + (hors ? 1 : 0), bulle: hors ? { id: message.id, texte: String(m.content).slice(0, 90) } : etat.bulle });
  if (m.role === "assistant") jouerBulle();
  return message;
}

/** Liluvine écrit la première (phrase locale choisie par `initiativeDuMoment`). */
export function initiativeDeLiluvine(texte, emotion) { return ajouter({ role: "assistant", content: texte, emotion, initiative: true }); }

export function effacerConversation() { emettre({ messages: [], refus: null, bulle: null, nonLus: 0 }); }

/**
 * Envoie un message de l'utilisateur et attend la réponse. Rend { ok: true } ou { ok: false, texte, erreur, refus } : en cas d'échec,
 * l'échange n'a pas eu lieu (le message est retiré) et le texte est rendu pour que l'utilisateur puisse le renvoyer.
 */
export async function envoyerALiluvine(texte) {
  const avant = etat.messages;
  const mien = ajouter({ role: "user", content: texte });
  emettre({ attente: true, refus: null });
  try {
    const { data } = await apiClient.post("/journal-intime/liluvine", { messages: echangesPourLiluvine(etat.messages), consentement: true, version_mentions: VERSION_MENTIONS });
    emettre({ attente: false, essais: data.essais_restants != null ? data.essais_restants : etat.essais });
    ajouter({ role: "assistant", content: data.reponse, urgence: !!data.urgence, modere: data.modere || null, emotion: data.modere ? "calme" : emotionDeTexte(data.reponse, !!data.urgence) });
    return { ok: true };
  } catch (err) {
    const detail = err?.response?.data?.detail;
    emettre({ attente: false, messages: avant.filter((m) => m.id !== mien.id), refus: err?.response?.status === 402 && detail && typeof detail === "object" ? detail : null });
    return { ok: false, texte, erreur: err?.response?.status === 402 ? null : (typeof detail === "string" ? detail : "Liluvine ne peut pas répondre pour le moment.") };
  }
}
