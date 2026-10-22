// ============================================================================
// archiveCrypto.js — chiffrement des archives en ligne (lot 56). Tout se passe DANS le navigateur (API WebCrypto) :
//   - phrase secrète → clé AES-256 par PBKDF2-SHA256 (250 000 tours, sel public gardé chez SAWALI) ; la phrase et la clé ne quittent JAMAIS l'appareil ;
//   - chaque document et ses informations sont chiffrés en AES-256-GCM (vecteur aléatoire de 12 octets placé devant les données) ;
//   - « jeton de contrôle » : un petit texte connu, chiffré avec la clé : il permet de vérifier la phrase saisie sur un autre appareil.
// Lot 92 — DEUX façons d'ouvrir la clé des documents (jamais la phrase seule) :
//   - la clé des documents est un nombre aléatoire (256 bits) ; elle est gardée chez SAWALI sous deux formes CHIFFRÉES : « enveloppe »
//     (chiffrée par la phrase secrète) et « secours » (chiffrée par un CODE DE SECOURS remis à l'activation) : le serveur ne peut ouvrir ni l'une ni l'autre ;
//   - phrase oubliée : le code de secours rouvre la clé et permet de choisir une nouvelle phrase, sans toucher aux documents ;
//   - anciennes archives (avant le lot 92) : la clé était dérivée de la phrase ; elle est mise à niveau avec une enveloppe et un secours.
// Phrase ET code perdus = documents en ligne définitivement illisibles : personne (ni auRor ni SAWALI) ne peut les récupérer.
// ============================================================================
const TOURS = 250000;
const TEXTE_CONTROLE = "archives-paiement-mobile-v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

let cleActive = null;                                  // clé gardée en mémoire seulement (perdue au rechargement de la page)
let octetsActifs = null;                               // lot 92 : octets de la clé (pour fabriquer enveloppe et secours), en mémoire seulement
export const cleDeverrouillee = () => !!cleActive;
export const verrouiller = () => { cleActive = null; octetsActifs = null; };

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

/** Octets (256 bits) dérivés d'une phrase ou d'un code par PBKDF2-SHA256. */
async function deriverOctets(secret, selBase64) {
  const matiere = await crypto.subtle.importKey("raw", enc.encode(secret.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: depuisBase64(selBase64), iterations: TOURS, hash: "SHA-256" }, matiere, 256));
}
const importerCle = (octets) => crypto.subtle.importKey("raw", octets, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const cleDepuis = async (secret, sel) => importerCle(await deriverOctets(secret, sel));

// ---- Code de secours : 20 octets aléatoires, écrits en 32 caractères (alphabet de Crockford, sans I L O U) par groupes de 4 ----
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function octetsVersCode(octets) {
  let bits = 0, valeur = 0, sortie = "";
  octets.forEach((o) => {
    valeur = (valeur << 8) | o; bits += 8;
    while (bits >= 5) { sortie += ALPHABET[(valeur >>> (bits - 5)) & 31]; bits -= 5; }
    valeur &= (1 << bits) - 1;
  });
  return sortie.match(/.{1,4}/g).join("-");
}
/** Écriture canonique d'un code saisi : majuscules, sans tirets ni espaces, O→0, I/L→1 (erreurs de lecture courantes). */
export const normaliserCode = (code) => String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
export const nouveauCodeSecours = () => octetsVersCode(crypto.getRandomValues(new Uint8Array(20)));

async function envelopper(octets, secret, sel) { return versBase64(await chiffrer(octets, await cleDepuis(secret, sel))); }

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

/** Première activation (lot 92) : clé aléatoire, enveloppe (phrase) et secours (code). Renvoie ce qu'il faut enregistrer, plus le code À MONTRER
 *  UNE SEULE FOIS à l'utilisateur. La clé reste en mémoire. */
export async function creerPhrase(phrase) {
  const sel = nouveauSel();
  const octets = crypto.getRandomValues(new Uint8Array(32));
  const cle = await importerCle(octets);
  const code = nouveauCodeSecours();
  const verif = versBase64(await chiffrer(enc.encode(TEXTE_CONTROLE), cle));
  const enveloppe = await envelopper(octets, phrase, sel);
  const secours = await envelopper(octets, normaliserCode(code), sel);
  cleActive = cle; octetsActifs = octets;
  return { sel, verif, enveloppe, secours, code };
}

/** Déverrouillage : ouvre la clé avec la phrase. `enveloppe` absente = ancienne clé (dérivée de la phrase). Renvoie
 *  { ok, ancienne } : `ancienne` = true pour une archive d'avant le lot 92, à mettre à niveau (voir `preparerSecours`). */
export async function deverrouiller(phrase, sel, verif, enveloppe = null) {
  try {
    const octets = enveloppe ? await dechiffrer(depuisBase64(enveloppe), await cleDepuis(phrase, sel)) : await deriverOctets(phrase, sel);
    const cle = await importerCle(octets);
    const clair = dec.decode(await dechiffrer(depuisBase64(verif), cle));
    if (clair !== TEXTE_CONTROLE) return { ok: false, ancienne: false };
    cleActive = cle; octetsActifs = octets;
    return { ok: true, ancienne: !enveloppe };
  } catch { return { ok: false, ancienne: false }; }
}

/** Ancienne clé déverrouillée avec la phrase : fabrique l'enveloppe et un secours (la clé ne change pas, donc les documents non plus). */
export async function preparerSecours(phrase, sel) {
  if (!octetsActifs) throw new Error("Archives verrouillées");
  const code = nouveauCodeSecours();
  return { enveloppe: await envelopper(octetsActifs, phrase, sel), secours: await envelopper(octetsActifs, normaliserCode(code), sel), code };
}

/** Phrase oubliée : ouvre la clé avec le CODE DE SECOURS. Renvoie true et garde la clé en mémoire si le code est le bon. */
export async function deverrouillerAvecCode(code, sel, verif, secours) {
  try {
    const octets = await dechiffrer(depuisBase64(secours), await cleDepuis(normaliserCode(code), sel));
    const cle = await importerCle(octets);
    if (dec.decode(await dechiffrer(depuisBase64(verif), cle)) !== TEXTE_CONTROLE) return false;
    cleActive = cle; octetsActifs = octets;
    return true;
  } catch { return false; }
}

/** Clé ouverte (par code de secours) : nouvelle enveloppe pour la nouvelle phrase choisie. */
export async function nouvelleEnveloppe(phrase, sel) {
  if (!octetsActifs) throw new Error("Archives verrouillées");
  return envelopper(octetsActifs, phrase, sel);
}
