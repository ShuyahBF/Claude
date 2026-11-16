// CONVERSATION AVEC LILUVINE, gardée EN MÉMOIRE seulement (jamais sur disque, jamais sur un serveur : ce sont des confidences).
// Elle vit en dehors de l'écran « Journal » pour que la réponse de Liluvine ne soit pas perdue si l'utilisateur change de page
// pendant qu'elle réfléchit : le message arrive alors « hors page », un son et une bulle le signalent, et le menu affiche le nombre de messages non lus.
import { useSyncExternalStore } from "react";
import { apiClient } from "@/lib/api";
import { emotionDeTexte } from "@/lib/liluvineEmotion";
import { echangesPourLiluvine, VERSION_MENTIONS } from "@/lib/journalIntime";
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
export function surLiluvine(vu) { emettre(vu ? { surLiluvine: true, nonLus: 0, bulle: null } : { surLiluvine: false }); }
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
