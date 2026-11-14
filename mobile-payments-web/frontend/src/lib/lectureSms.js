// Lecture des paiements PARTAGÉE (écran Historique et lecture automatique) : lit les SMS par le pont Android ET les notifications reçues application fermée, les transforme
// en lignes gardées sur le téléphone et met à jour le récapitulatif. Aucun texte de SMS ni de notification n'est enregistré et rien n'est envoyé à auRor.
import { capacites, lireSmsPaiements, notificationsEnAttente } from "@/lib/pontAndroid";
import { analyserSms, chargerLignes, enregistrerLignes, fusionner } from "@/lib/smsPaiements";

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
  const { lignes, nouvelles } = fusionner(existantes, [...duSms, ...desNotifs]);
  enregistrerLignes(lignes);
  const par = {};
  lignes.forEach((l) => { par[l.adresse] = (par[l.adresse] || 0) + 1; });
  const lus = sms.length + notifs.length;
  const resume = { le: Date.now(), lus, operateurs: Object.entries(par).map(([nom, n]) => ({ nom, nb: n })).sort((a, b) => b.nb - a.nb) };
  ecrireResume(resume);
  if (nouvelles > 0) window.dispatchEvent(new Event(EVENEMENT_MAJ));
  return { lus, nouvelles, lignes, resume };
}
