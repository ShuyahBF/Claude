// ============================================================================
// synchro.js — SYNCHRONISATION EN TEMPS RÉEL entre appareils (lot 223) : logique PURE (sans réseau ni écran), testée par tests/synchro.test.mjs.
//
// Pour un développeur WinDev : on compare, fiche par fiche, ce que contient CET appareil avec ce qu'il avait déjà envoyé (une « empreinte » par fiche) :
//   - fiche nouvelle ou modifiée  → un changement « voici la fiche » (date de modification = maintenant) ;
//   - fiche disparue              → un changement « supprimée » (une « pierre tombale » empêche un autre appareil de la ressusciter) ;
// et on REJOUE les changements venus des autres appareils avec la règle « le plus récent l'emporte, fiche par fiche » (à égalité : l'appareil dont
// l'identifiant est le plus grand l'emporte, pour que tous les appareils décident pareil). Les données elles-mêmes sont chiffrées ailleurs (synchroTempsReel.js).
// Données suivies : journal, carnet, lignes de SMS (avec motif, détails, rubriques) et budget. Les PHOTOS de tickets restent sur leur appareil (trop lourdes).
// ============================================================================

export const TYPES = ["journal", "carnet", "sms", "budget"];
export const ID_BUDGET = "principal";
export const cleFiche = (type, id) => `${type}:${id}`;

/** Fiche telle qu'elle voyage : les photos (`pieces`) restent sur l'appareil qui les a prises. */
export const fichePartagee = (type, fiche) => {
  if (type !== "sms" || !fiche || !fiche.pieces) return fiche;
  const { pieces: _p, ...reste } = fiche;
  return reste;
};

/** JSON à clés triées : deux fiches identiques donnent le même texte, quel que soit l'ordre des champs. */
export function jsonStable(v) {
  if (Array.isArray(v)) return `[${v.map(jsonStable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jsonStable(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** Empreinte SHA-256 (hexadécimal) d'une fiche partagée. */
export async function empreinteFiche(type, fiche) {
  const o = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jsonStable(fichePartagee(type, fiche)))));
  return Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** État vide d'un appareil qui n'a jamais synchronisé. */
export const etatVide = (appareil) => ({ appareil, seq: 0, empreintes: {}, maj: {}, sup: {} });

/** Date de modification d'une fiche encore jamais envoyée : sa propre date si elle en a une (journal, SMS), sinon le début des temps (toute vraie modification ultérieure l'emporte). */
export const dateInitiale = (fiche) => new Date(Number(fiche?.quand) > 0 ? Number(fiche.quand) : 0).toISOString();

/**
 * Compare les données de cet appareil à l'état déjà envoyé.
 * `donnees` : { journal: [...], carnet: [...], sms: [...], budget: [...] } (chaque fiche a un `id`).
 * Rend { changements: [{ t, id, maj, d? , sup? }], etat } : l'état à mémoriser APRÈS l'envoi réussi (rien n'est modifié ici).
 */
export async function calculerChangements(donnees, etat, maintenant = new Date()) {
  const quand = maintenant.toISOString();
  const nouvelEtat = { ...etat, empreintes: { ...etat.empreintes }, maj: { ...etat.maj }, sup: { ...etat.sup } };
  const changements = [];
  const presentes = new Set();
  for (const type of TYPES) {
    for (const fiche of donnees[type] || []) {
      if (!fiche?.id) continue;
      const cle = cleFiche(type, fiche.id);
      presentes.add(cle);
      const h = await empreinteFiche(type, fiche);
      if (etat.empreintes[cle] === h) continue;                           // inchangée depuis le dernier envoi
      const jamaisEnvoyee = etat.empreintes[cle] === undefined && etat.maj[cle] === undefined;
      const maj = jamaisEnvoyee ? dateInitiale(fiche) : quand;
      changements.push({ t: type, id: fiche.id, maj, d: fichePartagee(type, fiche) });
      nouvelEtat.empreintes[cle] = h; nouvelEtat.maj[cle] = maj; delete nouvelEtat.sup[cle];
    }
  }
  for (const cle of Object.keys(etat.empreintes)) {
    if (presentes.has(cle)) continue;
    const [type, ...reste] = cle.split(":");
    const id = reste.join(":");
    if (type === "budget") continue;                                      // le budget ne se supprime pas : seul « désactivé » est un réglage
    changements.push({ t: type, id, maj: quand, sup: true });
    delete nouvelEtat.empreintes[cle]; delete nouvelEtat.maj[cle]; nouvelEtat.sup[cle] = quand;
  }
  return { changements, etat: nouvelEtat };
}

/** Le changement reçu est-il plus récent que ce que cet appareil sait de la fiche ? (égalité : appareil de plus grand identifiant) */
export function plusRecent(changement, appareilDuChangement, etat, appareilLocal) {
  const cle = cleFiche(changement.t, changement.id);
  const connue = [etat.maj[cle], etat.sup[cle]].filter(Boolean).sort().pop();
  if (!connue) return true;
  if (changement.maj !== connue) return changement.maj > connue;
  return String(appareilDuChangement) > String(appareilLocal);
}

/**
 * Rejoue UN changement reçu sur cet appareil. `adaptateurs[type]` = { ecrire(fiche), supprimer(id) } (asynchrones).
 * Rend { applique: bool, etat } (l'état est modifié sur place et rendu).
 */
export async function appliquerChangement(changement, appareilDuChangement, etat, adaptateurs) {
  if (!changement || !TYPES.includes(changement.t) || !changement.id) return { applique: false, etat };
  if (!plusRecent(changement, appareilDuChangement, etat, etat.appareil)) return { applique: false, etat };
  const cle = cleFiche(changement.t, changement.id);
  const ad = adaptateurs[changement.t];
  if (changement.sup) {
    if (!(await ad.supprimer(changement.id))) return { applique: false, etat };
    delete etat.empreintes[cle]; delete etat.maj[cle]; etat.sup[cle] = changement.maj;
    return { applique: true, etat };
  }
  if (!changement.d || changement.d.id !== changement.id) return { applique: false, etat };
  if (!(await ad.ecrire(changement.d))) return { applique: false, etat };
  etat.empreintes[cle] = await empreinteFiche(changement.t, changement.d);
  etat.maj[cle] = changement.maj; delete etat.sup[cle];
  return { applique: true, etat };
}

/** Signature RAPIDE (sans rien déchiffrer) d'un ensemble de textes stockés : sert à savoir si quelque chose a bougé avant de refaire la comparaison complète. */
export function signatureTextes(textes) {
  let h = 5381;
  for (const t of textes) {
    const s = String(t ?? "");
    h = ((h * 33) ^ s.length) >>> 0;
    const pas = Math.max(1, Math.floor(s.length / 4000));                  // échantillon régulier de très gros textes
    for (let i = 0; i < s.length; i += pas) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return `${textes.length}:${h}`;
}
