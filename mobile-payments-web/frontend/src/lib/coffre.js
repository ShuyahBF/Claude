// ============================================================================
// coffre.js — Opérations du « coffre » de l'utilisateur (phrase secrète / code PIN, code de secours, application d'authentification), hors écran.
// Même mécanisme que les archives en ligne (lots 56, 92, 93, 94) ; la clé du coffre protège aussi les SAUVEGARDES EN LIGNE (lot 168).
// Rien de secret ne quitte le téléphone : le serveur de SAWALI ne voit que la « preuve » (empreinte) du code, le « poivre » qu'il rend, la clé chiffrée
// (enveloppe, secours) et un jeton de contrôle. Pour un développeur WinDev : ce sont les mêmes appels que dans pages/Archives.jsx, rangés ici pour être réutilisés.
// ============================================================================
import { apiClient } from "@/lib/api";
import {
  creerAvecSecret, deverrouiller, deverrouillerAvecCode, deverrouillerAvecPoivre, nouveauSecours, nouveauSel, nouvelleEnveloppePin, preuveEtPartie, verrouiller,
} from "@/lib/archiveCrypto";

export const MIN_SECRET = 4;
export const secretValide = (type, s) => (type === "pin" ? /^\d{4,12}$/.test(s) : String(s || "").length >= MIN_SECRET);
export const MESSAGE_SECRET = (type) => (type === "pin" ? "Le code PIN compte de 4 à 12 chiffres" : `La phrase secrète doit compter au moins ${MIN_SECRET} caractères`);

/** État du coffre chez SAWALI (relayé par auRor) ; null si le service est indisponible. */
export async function lireEtatCoffre() {
  try { return (await apiClient.get("/archives/etat")).data; } catch { return null; }
}
/** Le coffre existe-t-il déjà (clé créée) ? */
export const coffreExiste = (etat) => !!(etat && etat.verif);

/** Première activation : crée la clé et l'enregistre (chiffrée). Rend { code } : le code de secours, À MONTRER UNE SEULE FOIS. La clé reste ouverte en mémoire. */
export async function creerCoffre(secret, type) {
  const sel = nouveauSel();
  const { preuve, partie } = await preuveEtPartie(secret, sel);
  try {
    const { data } = await apiClient.post("/archives/pin/enregistrer", { preuve, type_secret: type });
    const { verif, enveloppe, secours, code } = await creerAvecSecret(partie, data.poivre, sel);
    await apiClient.post("/archives/cle", { sel, verif, enveloppe, secours });
    return { code };
  } catch (e) { verrouiller(); throw e; }
}

/** Ouverture avec la phrase / le code (+ code de l'application d'authentification si elle est activée). Rend { codeSecours } (un code neuf seulement pour de très anciens coffres). */
export async function ouvrirCoffre(secret, etat, codeTotp = "") {
  try {
    if (etat.pin) {
      const { preuve, partie } = await preuveEtPartie(secret, etat.sel);
      const { data } = await apiClient.post("/archives/pin/ouvrir", { preuve, ...(etat.a2f ? { code_totp: codeTotp } : {}) });
      if (!(await deverrouillerAvecPoivre(partie, data.poivre, etat.verif, etat.enveloppe))) throw new Error("Ouverture impossible : réessayez");
      return { codeSecours: null };
    }
    // Coffre d'avant le lot 93 (phrase seule) : ouverture puis mise à niveau vers code + poivre
    const r = await deverrouiller(secret, etat.sel, etat.verif, etat.enveloppe);
    if (!r.ok) throw new Error("Phrase secrète incorrecte");
    const { preuve, partie } = await preuveEtPartie(secret, etat.sel);
    const { data } = await apiClient.post("/archives/pin/enregistrer", { preuve, type_secret: "phrase", verif_actuelle: etat.verif });
    let maj = { verif_actuelle: etat.verif, enveloppe: await nouvelleEnveloppePin(partie, data.poivre) };
    let codeSecours = null;
    if (!etat.secours) { const s = await nouveauSecours(etat.sel); maj = { ...maj, secours: s.secours }; codeSecours = s.code; }
    await apiClient.post("/archives/cle/enveloppes", maj);
    return { codeSecours };
  } catch (e) { verrouiller(); throw e; }
}

/** Secret oublié : le code de secours rouvre la clé, puis un NOUVEAU secret est enregistré (rien d'autre ne change). */
export async function ouvrirParCodeSecours(codeSaisi, nouveauSecret, type, etat) {
  try {
    if (!etat.secours) throw new Error("Aucun code de secours n'a été enregistré");
    if (!(await deverrouillerAvecCode(codeSaisi, etat.sel, etat.verif, etat.secours))) throw new Error("Code de secours incorrect");
    const { preuve, partie } = await preuveEtPartie(nouveauSecret, etat.sel);
    const { data } = await apiClient.post("/archives/pin/enregistrer", { preuve, type_secret: type, verif_actuelle: etat.verif });
    await apiClient.post("/archives/cle/enveloppes", { verif_actuelle: etat.verif, enveloppe: await nouvelleEnveloppePin(partie, data.poivre) });
  } catch (e) { verrouiller(); throw e; }
}
