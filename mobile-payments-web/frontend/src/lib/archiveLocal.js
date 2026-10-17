// ============================================================================
// archiveLocal.js — archives gardées SUR L'APPAREIL (lot 56), sans abonnement. Le navigateur n'a pas de « dossier » ouvert au site :
// les documents sont rangés dans sa mémoire privée (IndexedDB), propre à ce site et à cet appareil. On demande au navigateur de ne pas
// les effacer en cas de manque de place (navigator.storage.persist) ; chaque document peut aussi être téléchargé dans le dossier de
// téléchargements du téléphone. Tables : documents (informations), contenus (fichiers), categories (celles ajoutées par l'utilisateur).
// ============================================================================
const NOM = "mpw_archives";

function ouvrir() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NOM, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("documents", { keyPath: "id" });
      db.createObjectStore("contenus", { keyPath: "id" });
      db.createObjectStore("categories", { keyPath: "nom" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function operation(tables, mode, action) {
  const db = await ouvrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(tables, mode);
      let resultat;
      Promise.resolve(action(...tables.map((t) => tx.objectStore(t)))).then((v) => { resultat = v; }, reject);
      tx.oncomplete = () => resolve(resultat);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

const demande = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** Demande au navigateur de garder ces données durablement (réponse sans conséquence si refusée). */
export function demanderStockageDurable() { try { navigator.storage?.persist?.(); } catch { /* sans importance */ } }

export const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const listerLocal = () => operation(["documents"], "readonly", (d) => demande(d.getAll()));
export const lireContenuLocal = (id) => operation(["contenus"], "readonly", (c) => demande(c.get(id))).then((x) => x?.blob || null);
export const ajouterLocal = (meta, blob) => operation(["documents", "contenus"], "readwrite", (d, c) => { d.put(meta); c.put({ id: meta.id, blob }); });
export const modifierLocal = (meta) => operation(["documents"], "readwrite", (d) => { d.put(meta); });
export const supprimerLocal = (id) => operation(["documents", "contenus"], "readwrite", (d, c) => { d.delete(id); c.delete(id); });
export const categoriesPerso = () => operation(["categories"], "readonly", (c) => demande(c.getAll())).then((l) => l.map((x) => x.nom));
export const ajouterCategorie = (nom) => operation(["categories"], "readwrite", (c) => { c.put({ nom }); });
