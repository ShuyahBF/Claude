import { apiClient } from "@/lib/api";

// Visite d'une personne NON connectée (alerte WhatsApp du propriétaire, via SAWALI).
// Le site prévient l'API au plus une fois toutes les 30 minutes par navigateur.
// L'identifiant « visiteur » est tiré au hasard et gardé dans le navigateur
// (localStorage) : aucune donnée personnelle. Toute erreur est ignorée.
const CLE_VISITEUR = "pm_visiteur";
const CLE_DERNIER_ENVOI = "pm_visite_le";
const INTERVALLE_MS = 30 * 60 * 1000;

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}

function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch { /* navigation privée : sans conséquence */ }
}

/** Identifiant aléatoire du navigateur (créé à la première visite). */
function identifiantVisiteur() {
  let id = lire(CLE_VISITEUR);
  if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .replace(/[^A-Za-z0-9_-]/g, "");
    ecrire(CLE_VISITEUR, id);
  }
  return id;
}

/** À appeler quand on sait que personne n'est connecté. */
export function signalerVisite() {
  const dernier = Number(lire(CLE_DERNIER_ENVOI) || 0);
  if (Date.now() - dernier < INTERVALLE_MS) return;
  ecrire(CLE_DERNIER_ENVOI, String(Date.now()));
  apiClient.post("/presence/visite", { visiteur: identifiantVisiteur(), page: window.location.pathname })
    .catch(() => { /* jamais bloquant */ });
}
