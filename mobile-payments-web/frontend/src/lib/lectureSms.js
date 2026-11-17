// Lecture des paiements PARTAGÉE (écran Historique et lecture automatique) : lit les SMS par le pont Android ET les notifications reçues application fermée, les transforme
// en lignes gardées sur le téléphone et met à jour le récapitulatif. Seuls les 10 premiers caractères de chaque SMS sont gardés (pour le retrouver en tapant son début), jamais le texte complet ; rien n'est envoyé à auRor.
import { capacites, lireSmsPaiements, notificationsEnAttente } from "@/lib/pontAndroid";
import { analyserSms, chargerLignes, enregistrerLignes, estTransaction, fusionner, marquerDoublonsEnergie } from "@/lib/smsPaiements";

export const CLE_RESUME = "auror_sms_resume";
export const EVENEMENT_MAJ = "auror-sms-maj";          // annonce aux écrans ouverts que de nouvelles lignes ont été enregistrées

export const lireResume = () => { try { return JSON.parse(localStorage.getItem(CLE_RESUME) || "null"); } catch { return null; } };
const ecrireResume = (r) => { try { localStorage.setItem(CLE_RESUME, JSON.stringify(r)); } catch { /* stockage indisponible */ } };

/**
 * Lit les SMS des `jours` derniers jours (si `lireSms`) et les notifications en attente. Rend { erreur } ou { lus, nouvelles, lignes, resume }.
 * Une notification qui double un SMS déjà lu (même montant, à moins de 2 minutes) est ignorée.
 */
export async function synchroniserSms(jours, { lireSms = true } = {}) {
  const cap = capacites() || {};
  let sms = []; let erreurSms = null;
  if (lireSms && cap.sms) {
    const r = await lireSmsPaiements(jours);
    if (r.sms) sms = r.sms; else erreurSms = r.erreur || "Lecture impossible.";
  }
  const notifs = cap.notifications ? notificationsEnAttente() : [];     // vide la liste d'attente de l'application : enregistrées tout de suite ci-dessous
  if (erreurSms && notifs.length === 0) return { erreur: erreurSms };
  const existantes = chargerLignes();
  const duSms = sms.map(analyserSms).filter(Boolean);
  const connues = [...existantes, ...duSms];
  const desNotifs = notifs.map(analyserSms).filter(Boolean).filter((n) => !connues.some((l) => l.montant === n.montant && Math.abs(l.quand - n.quand) < 120_000));
  // Chaque SMS ou notification devient une ligne ; les lignes déjà connues ne sont pas dupliquées
  const fusion = fusionner(existantes, [...duSms, ...desNotifs]);
  const lignes = marquerDoublonsEnergie(fusion.lignes);                  // un achat de courant n'est compté qu'UNE fois (confirmation de l'opérateur + détail SONABEL)
  const toutesNouvelles = fusion.nouvelles;
  // Les compteurs ne comptent que les vraies TRANSACTIONS : promo, alerte de banque et message de personne sont gardés (pastille grise) mais hors décompte
  const idsConnus = new Set(existantes.map((l) => l.id));
  const nouvelles = lignes.filter((l) => !idsConnus.has(l.id) && estTransaction(l)).length;
  enregistrerLignes(lignes);
  const par = {};
  lignes.filter(estTransaction).forEach((l) => { par[l.adresse] = (par[l.adresse] || 0) + 1; });
  const lus = sms.length + notifs.length;
  const resume = { le: Date.now(), lus, operateurs: Object.entries(par).map(([nom, n]) => ({ nom, nb: n })).sort((a, b) => b.nb - a.nb) };
  ecrireResume(resume);
  if (toutesNouvelles > 0) window.dispatchEvent(new Event(EVENEMENT_MAJ));     // la liste se rafraîchit aussi pour une ligne hors décompte (pastille grise)
  return { lus, nouvelles, lignes, resume };
}
