// Test du cache chiffré et de la file d'attente hors connexion (WebCrypto de Node 20, stockage en mémoire).
// Lancer : cd frontend && node tests/horsLigne.test.mjs   (alias « @/ » remplacé par un chargeur minimal ci-dessous)
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Copie temporaire de horsLigne.js + journalIntime.js avec l'import « @/lib/journalIntime » remplacé par un chemin relatif
const dossier = mkdtempSync(join(tmpdir(), "hl-"));
writeFileSync(join(dossier, "journalIntime.js"), readFileSync(new URL("../src/lib/journalIntime.js", import.meta.url), "utf8"));
writeFileSync(join(dossier, "horsLigne.js"), readFileSync(new URL("../src/lib/horsLigne.js", import.meta.url), "utf8").replace('"@/lib/journalIntime"', '"./journalIntime.js"'));
const { cacheEcrire, cacheLire, chargerAvecCache, estErreurReseau, fileAjouterPaiement, fileLire, fileMajStatut, fileNombre, fileSynchroniser } = await import(pathToFileURL(join(dossier, "horsLigne.js")).href);
const { nouvelleCle } = await import(pathToFileURL(join(dossier, "journalIntime.js")).href);

const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const memoire = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
const cle = await nouvelleCle();
const reseau = Object.assign(new Error("Network Error"), {});                 // pas de réponse = réseau perdu
const refus = (code) => Object.assign(new Error("refus"), { response: { status: code } });

// --- Erreurs réseau
ok("sans réponse : erreur réseau", estErreurReseau(reseau));
ok("502 / 503 / 504 : serveur injoignable", [502, 503, 504].every((c) => estErreurReseau(refus(c))));
ok("400 / 401 / 404 : PAS une erreur réseau", [400, 401, 404, 409].every((c) => !estErreurReseau(refus(c))));

// --- Cache chiffré
const st = memoire();
await cacheEcrire("services_Orange", [{ id: "s1", gabarit_ussd: "*144*{code}*{amount}#" }], { stockage: st, cle });
const brut = [...st._m.values()][0];
ok("le cache est illisible en clair", !brut.includes("*144*") && !brut.includes("gabarit"));
ok("relecture identique", JSON.stringify((await cacheLire("services_Orange", { stockage: st, cle })).valeur) === JSON.stringify([{ id: "s1", gabarit_ussd: "*144*{code}*{amount}#" }]));
ok("autre clé : illisible (null)", (await cacheLire("services_Orange", { stockage: st, cle: await nouvelleCle() })) === null);
ok("cache absent : null", (await cacheLire("rien", { stockage: st, cle })) === null);
const [k0] = st._m.keys(); st._m.set(k0, brut.replace(/"d":"./, '"d":"@'));
ok("cache altéré : null (jamais de donnée fausse)", (await cacheLire("services_Orange", { stockage: st, cle })) === null);

// --- Lecture avec repli sur le cache
const o = { stockage: memoire(), cle };
const r1 = await chargerAvecCache("ops", async () => ["Orange", "Moov"], o);
ok("en ligne : données fraîches et copie gardée", r1.horsLigne === false && r1.data.length === 2);
const r2 = await chargerAvecCache("ops", async () => { throw reseau; }, o);
ok("réseau perdu : la copie répond", r2.horsLigne === true && r2.data[1] === "Moov" && r2.depuis > 0);
let levee = null; try { await chargerAvecCache("ops", async () => { throw refus(403); }, o); } catch (e) { levee = e; }
ok("erreur du serveur : jamais masquée par le cache", levee?.response?.status === 403);
let sans = null; try { await chargerAvecCache("inconnu", async () => { throw reseau; }, o); } catch (e) { sans = e; }
ok("réseau perdu et pas de copie : l'erreur remonte", sans === reseau);

// --- File d'attente
const f = { stockage: memoire(), cle };
const P = { id: "local-1", service_id: "s1", valeurs: { code: "123", amount: "500" }, cree_le: "2026-11-17T10:00:00Z", statut: "prepare", code_ussd: "*144*123*500#", marchand: { code: "123" } };
await fileAjouterPaiement(P, f); await fileAjouterPaiement(P, f);
ok("un paiement n'entre qu'une fois", (await fileNombre(f)) === 1);
ok("seuls les champs utiles au serveur sont gardés", !JSON.stringify(await fileLire(f)).includes("code_ussd"));
ok("la file est chiffrée", ![...f.stockage._m.values()].join("").includes("local-1"));
await fileMajStatut("local-1", "effectue", f); await fileMajStatut("local-1", "prepare", f);
ok("le statut avance sans reculer", (await fileLire(f))[0].statut === "effectue");
await fileMajStatut("serveur-9", "effectue", f);
ok("un paiement déjà connu du serveur : mise à jour mise en file", (await fileLire(f)).length === 2 && (await fileLire(f))[1].type === "statut");

// --- Synchronisation
const appels = [];
const api = { post: async (u, c) => { appels.push(["POST", u, c.id, c.statut]); }, put: async (u, c) => { appels.push(["PUT", u, c.statut]); } };
let s = await fileSynchroniser(api, f);
ok("tout est envoyé, la file est vide", s.envoyes === 2 && s.restants === 0 && (await fileNombre(f)) === 0);
ok("le paiement part avec son statut final, puis la mise à jour", appels[0][1] === "/paiements/hors-ligne" && appels[0][3] === "effectue" && appels[1][1] === "/paiements/serveur-9/statut");

await fileAjouterPaiement({ ...P, id: "local-2" }, f); await fileAjouterPaiement({ ...P, id: "local-3" }, f);
const coupe = { post: async (u, c) => { if (c.id === "local-2") throw reseau; }, put: async () => {} };
s = await fileSynchroniser(coupe, f);
ok("réseau perdu : on s'arrête, tout reste en file", s.envoyes === 0 && s.restants === 2);
const mixte = { post: async (u, c) => { if (c.id === "local-2") throw refus(400); }, put: async () => {} };
s = await fileSynchroniser(mixte, f);
ok("refus définitif : abandonné ; le reste part", s.abandonnes === 1 && s.envoyes === 1 && s.restants === 0);
