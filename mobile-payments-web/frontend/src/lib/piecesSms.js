// piecesSms.js — photos de tickets / factures rattachées à une ligne de SMS (lot 217).
// Gardées SUR LE TÉLÉPHONE (IndexedDB « auror_pieces_sms »), réduites avant l'enregistrement ; jamais envoyées au serveur.
// Elles ne sont pas dans la sauvegarde en ligne (trop lourdes) : seul le texte (motif, détails) l'est, avec la ligne.
import { reduireImage } from "@/lib/archiveMedia";

const BASE = "auror_pieces_sms", MAGASIN = "pieces";

/** Ouvre la base locale (créée au premier usage). */
const ouvrir = () => new Promise((ok, ko) => {
  const r = indexedDB.open(BASE, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN, { keyPath: "id" });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
});
const transaction = async (mode, f) => {
  const db = await ouvrir();
  return new Promise((ok, ko) => { const tx = db.transaction(MAGASIN, mode); const req = f(tx.objectStore(MAGASIN)); tx.oncomplete = () => { db.close(); ok(req?.result); }; tx.onerror = () => ko(tx.error); });
};

/** Réduit la photo puis la garde ; rend { id, nom, type } à inscrire dans la ligne. */
export async function ajouterPiece(fichier, nom) {
  const f = await reduireImage(fichier, 1600, 0.82);
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await transaction("readwrite", (m) => m.put({ id, nom, type: f.type, blob: f }));
  return { id, nom, type: f.type };
}
/** Lit une pièce (Blob) ou null. */
export const lirePiece = async (id) => (await transaction("readonly", (m) => m.get(id)))?.blob || null;
export const supprimerPiece = (id) => transaction("readwrite", (m) => m.delete(id));
