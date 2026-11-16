// ============================================================================
// journalIntime.js — Journal intime (lot 166) : stockage CHIFFRÉ sur le téléphone, mentions à approuver, accords de l'utilisateur.
//
// Décisions du propriétaire (15/11/2026) :
//  - les confidences restent SUR LE TÉLÉPHONE, chiffrées (AES-256-GCM, WebCrypto) ; la clé est un objet NON EXTRACTIBLE gardé dans IndexedDB :
//    ni le texte du journal ni la clé ne quittent l'appareil, et aucun serveur n'en garde de copie ;
//  - l'utilisateur doit APPROUVER LUI-MÊME les mentions avant tout usage : deux accords distincts (le journal, puis Liluvine) gardés avec la version
//    des mentions et la date ; si le texte des mentions change (VERSION_MENTIONS), l'accord est redemandé ;
//  - Liluvine (IA via SAWALI) ne reçoit que les derniers échanges de la conversation en cours, jamais les entrées du journal.
//
// Pour un développeur WinDev : les fonctions « pures » (chiffrer, déchiffrer, filtrer, mentions) se testent sur ordinateur sans téléphone
// (frontend/tests/journalIntime.test.mjs) ; les fonctions de stockage utilisent IndexedDB / localStorage du navigateur.
// ============================================================================

/** Version du texte des mentions : même valeur que backend/routes/journal_intime.py (VERSION_MENTIONS). Changer les deux ensemble. */
export const VERSION_MENTIONS = "1";

/** Mentions affichées AVANT toute utilisation. `journal` : accord n° 1 ; `liluvine` : accord n° 2 (envoi des messages à l'IA, abonnement). */
export const MENTIONS = {
  journal: [
    { icone: "🔒", titre: "Un journal rien qu'à vous", texte: "Ce que vous écrivez est gardé uniquement sur ce téléphone, chiffré. Ni auRor ni SAWALI n'en gardent de copie : personne d'autre ne peut le lire, et personne ne peut le retrouver pour vous." },
    { icone: "⚠️", titre: "Attention à la perte", texte: "Si vous désinstallez l'application, effacez ses données ou changez de téléphone, votre journal est perdu définitivement. Aucune sauvegarde n'existe ailleurs." },
    { icone: "🗑️", titre: "Vous gardez la main", texte: "Vous pouvez effacer une entrée, la conversation ou tout le journal à tout moment, et retirer votre accord quand vous voulez. Le verrou de l'application (empreinte), si vous l'avez activé, protège aussi le journal." },
  ],
  liluvine: [
    { icone: "🤖", titre: "Liluvine est une assistante par intelligence artificielle", texte: "Ce n'est pas une personne. Elle écoute, donne des conseils de vie et son avis. Elle n'est ni médecin, ni psychologue, ni avocate, ni conseillère financière et ne remplace aucun d'eux." },
    { icone: "📤", titre: "Ce qui est envoyé", texte: "Pour qu'elle réponde, les derniers messages que vous lui écrivez sont envoyés à SAWALI et à son service d'intelligence artificielle, seulement pour obtenir la réponse. Ils ne sont pas conservés. Vos entrées de journal ne lui sont jamais envoyées, sauf ce que vous choisissez d'écrire dans la conversation. N'y écrivez jamais de mot de passe, de code PIN ni de numéro de carte." },
    { icone: "🆘", titre: "En cas de détresse", texte: "Si vous pensez à vous faire du mal ou à mettre fin à vos jours, contactez tout de suite les secours ou une personne proche : Liluvine ne peut pas intervenir à votre place." },
    { icone: "🎟️", titre: "Essai puis abonnement", texte: "Quelques échanges sont offerts pour essayer, puis un abonnement payant est nécessaire. Le prix vous est toujours montré avant tout paiement." },
  ],
};

// ---- Utilisateur du téléphone : un téléphone peut servir à plusieurs comptes auRor ; journal, accords et clé sont PROPRES à chaque compte (règle 21 : usage détourné) ----
let SUFFIXE = "";
/** À appeler avec l'identifiant du compte connecté AVANT tout accès au journal ou au carnet. */
export const pourUtilisateur = (id) => { SUFFIXE = id ? `_${String(id).replace(/[^\w-]/g, "")}` : ""; };
export const suffixeUtilisateur = () => SUFFIXE;

// ---- Accords (gardés sur le téléphone : version des mentions + date) ----
const CLE_ACCORD = (qui) => `mpw_journal_accord_${qui}${SUFFIXE}`;

/** Vrai si l'utilisateur a approuvé les mentions EN VIGUEUR (qui = "journal" ou "liluvine"). */
export function accordDonne(qui, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { return JSON.parse(stockage?.getItem(CLE_ACCORD(qui)) || "null")?.version === VERSION_MENTIONS; } catch { return false; }
}
/** Date (ISO) de l'accord, ou null. */
export function dateAccord(qui, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { const a = JSON.parse(stockage?.getItem(CLE_ACCORD(qui)) || "null"); return a?.version === VERSION_MENTIONS ? a.le : null; } catch { return null; }
}
/** Enregistre l'accord (appelé SEULEMENT par le bouton d'approbation de l'utilisateur). Faux si le stockage est indisponible. */
export function donnerAccord(qui, stockage = (typeof localStorage !== "undefined" ? localStorage : null), maintenant = new Date()) {
  try { stockage.setItem(CLE_ACCORD(qui), JSON.stringify({ version: VERSION_MENTIONS, le: maintenant.toISOString() })); return true; } catch { return false; }
}
/** Retire l'accord (le journal déjà écrit reste sur le téléphone, mais n'est plus accessible tant que l'accord n'est pas redonné). */
export function retirerAccord(qui, stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  try { stockage.removeItem(CLE_ACCORD(qui)); return true; } catch { return false; }
}

// ---- Chiffrement (pur, testable) : AES-256-GCM, vecteur aléatoire de 12 octets propre à chaque entrée ----
const enc = new TextEncoder();
const dec = new TextDecoder();
const versB64 = (o) => { let s = ""; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000)); return btoa(s); };
const depuisB64 = (t) => { const s = atob(t); const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) o[i] = s.charCodeAt(i); return o; };

/** Nouvelle clé AES-256 NON EXTRACTIBLE (jamais lisible par le code, même par une faille de la page). */
export const nouvelleCle = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/** Chiffre un objet (entrée du journal) → { iv, d } en base64. */
export async function chiffrer(cle, objet) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const d = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, enc.encode(JSON.stringify(objet))));
  return { iv: versB64(iv), d: versB64(d) };
}
/** Déchiffre → objet, ou null si la clé ne correspond pas / les données sont altérées. */
export async function dechiffrer(cle, paquet) {
  try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: depuisB64(paquet.iv) }, cle, depuisB64(paquet.d)))); } catch { return null; }
}

// ---- Clé gardée dans IndexedDB (objet CryptoKey non extractible, copié tel quel par le navigateur) ----
const BASE = "mpw_journal", MAGASIN = "cle";
function ouvrirBase() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
const demande = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
/** Clé du journal de CET appareil : lue, ou créée à la première utilisation. */
export async function cleDuJournal() {
  const base = await ouvrirBase();
  const nom = `principale${SUFFIXE}`;
  const lue = await demande(base.transaction(MAGASIN).objectStore(MAGASIN).get(nom));
  if (lue) return lue;
  const neuve = await nouvelleCle();
  await demande(base.transaction(MAGASIN, "readwrite").objectStore(MAGASIN).put(neuve, nom));
  return neuve;
}

/** Mémorise sur CET appareil la clé du coffre (CryptoKey non extractible) pour les sauvegardes automatiques ; une phrase n'est alors plus redemandée ici (nouveau téléphone : toujours redemandée). */
export async function memoriserCleCoffre(cle) {
  const base = await ouvrirBase();
  await demande(base.transaction(MAGASIN, "readwrite").objectStore(MAGASIN).put(cle, `coffre${SUFFIXE}`));
}
/** Clé du coffre mémorisée sur cet appareil, ou null. */
export async function lireCleCoffre() {
  try { return (await demande((await ouvrirBase()).transaction(MAGASIN).objectStore(MAGASIN).get(`coffre${SUFFIXE}`))) || null; } catch { return null; }
}
/** Oublie la clé du coffre sur cet appareil (la sauvegarde automatique s'arrête ici ; la phrase redevient nécessaire). */
export async function oublierCleCoffre() {
  try { await demande((await ouvrirBase()).transaction(MAGASIN, "readwrite").objectStore(MAGASIN).delete(`coffre${SUFFIXE}`)); } catch { /* sans importance */ }
}

// ---- Entrées du journal (chiffrées dans localStorage) ----
const CLE_ENTREES_BASE = "mpw_journal_entrees";
const cleEntrees = () => `${CLE_ENTREES_BASE}${SUFFIXE}`;
export const HUMEURS = [
  { id: "joyeux", icone: "😊", libelle: "Joyeux" }, { id: "serein", icone: "😌", libelle: "Serein" }, { id: "fatigue", icone: "😴", libelle: "Fatigué" },
  { id: "inquiet", icone: "😟", libelle: "Inquiet" }, { id: "triste", icone: "😢", libelle: "Triste" }, { id: "en_colere", icone: "😠", libelle: "En colère" },
  { id: "reconnaissant", icone: "🙏", libelle: "Reconnaissant" },
];
const lirePaquets = (st) => { try { return JSON.parse(st.getItem(cleEntrees()) || "[]"); } catch { return []; } };

/** Toutes les entrées déchiffrées, les plus récentes d'abord. */
export async function chargerEntrees(cle, stockage = localStorage) {
  const sortie = [];
  for (const p of lirePaquets(stockage)) { const e = await dechiffrer(cle, p); if (e) sortie.push({ ...e, id: p.id }); }
  return sortie.sort((a, b) => (b.quand || 0) - (a.quand || 0));
}
/** Ajoute ou remplace une entrée { id?, quand, humeur, texte }. Rend l'id, ou null si le stockage est plein / indisponible. */
export async function enregistrerEntree(cle, entree, stockage = localStorage) {
  const id = entree.id || `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { id: _i, ...contenu } = entree;
  const paquets = lirePaquets(stockage).filter((p) => p.id !== id);
  paquets.push({ id, ...(await chiffrer(cle, contenu)) });
  try { stockage.setItem(cleEntrees(), JSON.stringify(paquets)); return id; } catch { return null; }
}
export function supprimerEntree(id, stockage = localStorage) {
  try { stockage.setItem(cleEntrees(), JSON.stringify(lirePaquets(stockage).filter((p) => p.id !== id))); return true; } catch { return false; }
}
/** Efface TOUT le journal (entrées chiffrées). La clé reste : un nouveau journal peut commencer. */
export function toutEffacer(stockage = localStorage) {
  try { stockage.removeItem(cleEntrees()); return true; } catch { return false; }
}

const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Filtre les entrées déchiffrées : texte cherché (sans accents ni casse), humeur, dates « AAAA-MM-JJ » (jours inclus). */
export function filtrerEntrees(entrees, { texte = "", humeur = "", du = "", au = "" } = {}) {
  const t = sansAccents(texte).trim();
  const debut = du ? new Date(`${du}T00:00:00`).getTime() : null;
  const fin = au ? new Date(`${au}T23:59:59.999`).getTime() : null;
  return entrees.filter((e) => (!humeur || e.humeur === humeur) && (debut == null || e.quand >= debut) && (fin == null || e.quand <= fin) && (!t || sansAccents(e.texte).includes(t)));
}

/** Derniers échanges à envoyer à Liluvine : 16 au plus, texte borné, le dernier venant de l'utilisateur. */
export function echangesPourLiluvine(messages) {
  const propres = messages.filter((m) => (m.role === "user" || m.role === "assistant") && String(m.content || "").trim()).map((m) => ({ role: m.role, content: String(m.content).trim().slice(0, 2000) })).slice(-16);
  while (propres.length && propres[0].role !== "user") propres.shift();
  return propres.length && propres[propres.length - 1].role === "user" ? propres : [];
}
