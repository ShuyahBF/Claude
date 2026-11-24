// google.js — connexion par compte Google (lot 222), côté site. Le déroulé complet est expliqué dans backend/google_auth.py.
// Dans l'application Android, Google refuse sa page de connexion dans une fenêtre intégrée : on demande donc à l'application d'ouvrir le NAVIGATEUR du téléphone
// (pont « ouvrirNavigateur »), qui revient dans l'application par l'adresse « auror://google?code=… ».
import { API_BASE_URL, apiClient } from "@/lib/api";
import { dansApplication } from "@/lib/pontAndroid";

/** Le serveur est-il configuré pour Google ? (le bouton n'est affiché que si oui) */
export async function googleDisponible() {
  try { return !!(await apiClient.get("/auth/google/config")).data.disponible; } catch { return false; }
}

/** « web » dans un navigateur, « app » dans l'application Android : le retour de Google n'est pas le même. */
export const cibleGoogle = () => (dansApplication() ? "app" : "web");

/** Adresse de départ de la connexion (le serveur renvoie ensuite vers Google). */
export const urlConnexionGoogle = () => `${API_BASE_URL}/auth/google/demarrer?cible=${cibleGoogle()}`;

/**
 * Ouvre une adresse Google : navigateur du téléphone dans l'application, même fenêtre sinon.
 * Rend false si l'application est trop ancienne (elle ne sait pas ouvrir le navigateur) : le site affiche alors « mettez à jour ».
 */
export function ouvrirGoogle(url) {
  if (dansApplication()) {
    if (!window.AuRorAndroid.ouvrirNavigateur) return false;
    window.AuRorAndroid.ouvrirNavigateur(url);
    return true;
  }
  window.location.href = url;
  return true;
}

/** Messages clairs pour chaque cause d'échec renvoyée par le serveur (?erreur=…). */
export const MESSAGES_GOOGLE = {
  aucun_compte: "Aucun compte auRor n'est lié à ce compte Google. Connectez-vous avec votre téléphone ou votre e-mail, puis liez Google dans Profil → Compte Google.",
  deja_lie: "Ce compte Google est déjà lié à un autre compte auRor.",
  bloque: "Ce compte est bloqué : contactez le support.",
  refuse: "La connexion par Google a été annulée ou refusée.",
  google: "Google n'a pas pu confirmer votre identité (e-mail vérifié exigé). Réessayez.",
  etat: "Cette demande a expiré. Recommencez la connexion.",
};
