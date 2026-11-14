// Lecture des SMS de paiement PARTAGÉE (écran Historique et lecture automatique) : lit les SMS par le pont Android, les transforme en lignes gardées sur le téléphone
// et met à jour le récapitulatif. Aucun texte de SMS n'est enregistré et rien n'est envoyé à auRor.
import { lireSmsPaiements } from "@/lib/pontAndroid";
import { analyserSms, chargerLignes, enregistrerLignes, fusionner } from "@/lib/smsPaiements";

export const CLE_RESUME = "auror_sms_resume";
export const EVENEMENT_MAJ = "auror-sms-maj";          // annonce aux écrans ouverts que de nouvelles lignes ont été enregistrées

export const lireResume = () => { try { return JSON.parse(localStorage.getItem(CLE_RESUME) || "null"); } catch { return null; } };
const ecrireResume = (r) => { try { localStorage.setItem(CLE_RESUME, JSON.stringify(r)); } catch { /* stockage indisponible */ } };

/** Lit les SMS des `jours` derniers jours. Rend { erreur } ou { lus, nouvelles, lignes, resume }. */
export async function synchroniserSms(jours) {
  const r = await lireSmsPaiements(jours);
  if (!r.sms) return { erreur: r.erreur || "Lecture impossible." };
  // Chaque SMS devient une ligne ; les lignes déjà connues ne sont pas dupliquées
  const { lignes, nouvelles } = fusionner(chargerLignes(), r.sms.map(analyserSms).filter(Boolean));
  enregistrerLignes(lignes);
  const par = {};
  lignes.forEach((l) => { par[l.adresse] = (par[l.adresse] || 0) + 1; });
  const resume = { le: Date.now(), lus: r.sms.length, operateurs: Object.entries(par).map(([nom, n]) => ({ nom, nb: n })).sort((a, b) => b.nb - a.nb) };
  ecrireResume(resume);
  if (nouvelles > 0) window.dispatchEvent(new Event(EVENEMENT_MAJ));
  return { lus: r.sms.length, nouvelles, lignes, resume };
}
