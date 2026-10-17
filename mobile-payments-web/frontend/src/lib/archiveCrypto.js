// ============================================================================
// archiveCrypto.js — chiffrement des archives en ligne (lot 56). Tout se passe DANS le navigateur (API WebCrypto) :
//   - phrase secrète → clé AES-256 par PBKDF2-SHA256 (250 000 tours, sel public gardé chez SAWALI) ; la phrase et la clé ne quittent JAMAIS l'appareil ;
//   - chaque document et ses informations sont chiffrés en AES-256-GCM (vecteur aléatoire de 12 octets placé devant les données) ;
//   - « jeton de contrôle » : un petit texte connu, chiffré avec la clé : il permet de vérifier la phrase saisie sur un autre appareil.
// Phrase perdue = documents en ligne définitivement illisibles : personne (ni Paiement Mobile ni SAWALI) ne peut les récupérer.
// ============================================================================
const TOURS = 250000;
const TEXTE_CONTROLE = "archives-paiement-mobile-v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

let cleActive = null;                                  // clé gardée en mémoire seulement (perdue au rechargement de la page)
export const cleDeverrouillee = () => !!cleActive;
export const verrouiller = () => { cleActive = null; };

export function versBase64(octets) {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}
export function depuisBase64(texte) {
  const s = atob(texte);
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) o[i] = s.charCodeAt(i);
  return o;
}

/** Sel aléatoire public (16 octets en base64) : généré une seule fois, à la création de la phrase secrète. */
export const nouveauSel = () => versBase64(crypto.getRandomValues(new Uint8Array(16)));

async function deriver(phrase, selBase64) {
  const matiere = await crypto.subtle.importKey("raw", enc.encode(phrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: depuisBase64(selBase64), iterations: TOURS, hash: "SHA-256" }, matiere,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Chiffre des octets : renvoie vecteur (12 octets) + données chiffrées. */
export async function chiffrer(octets, cle = cleActive) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, octets));
  const sortie = new Uint8Array(12 + ct.length);
  sortie.set(iv); sortie.set(ct, 12);
  return sortie;
}

/** Déchiffre ce que `chiffrer` a produit ; lève une erreur si la clé ou les données ne conviennent pas. */
export async function dechiffrer(octets, cle = cleActive) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: octets.subarray(0, 12) }, cle, octets.subarray(12)));
}

export async function chiffrerJson(objet, cle = cleActive) { return versBase64(await chiffrer(enc.encode(JSON.stringify(objet)), cle)); }
export async function dechiffrerJson(texte, cle = cleActive) { return JSON.parse(dec.decode(await dechiffrer(depuisBase64(texte), cle))); }

/** Première activation : crée le sel et le jeton de contrôle pour la phrase choisie, et garde la clé en mémoire. */
export async function creerPhrase(phrase) {
  const sel = nouveauSel();
  const cle = await deriver(phrase, sel);
  const verif = versBase64(await chiffrer(enc.encode(TEXTE_CONTROLE), cle));
  cleActive = cle;
  return { sel, verif };
}

/** Déverrouillage : vérifie la phrase avec le jeton de contrôle. Renvoie true et garde la clé en mémoire si la phrase est la bonne. */
export async function deverrouiller(phrase, sel, verif) {
  try {
    const cle = await deriver(phrase, sel);
    const clair = dec.decode(await dechiffrer(depuisBase64(verif), cle));
    if (clair !== TEXTE_CONTROLE) return false;
    cleActive = cle;
    return true;
  } catch { return false; }
}
