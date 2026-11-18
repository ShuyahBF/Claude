// Bonjour du matin de Liluvine (store) : une fois par jour, pastille « non lu » mémorisée, effacée à la lecture, rien sans accord.
// Lancer : cd frontend && node tests/liluvineBonjour.test.mjs   (utilise Vite ; aucun navigateur)
import { createServer } from "vite";
import assert from "node:assert/strict";

// Faux stockage du téléphone (localStorage), nécessaire hors navigateur
const memoire = new Map();
globalThis.localStorage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k) };
const serveur = await createServer({ root: new URL("..", import.meta.url).pathname, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const S = await serveur.ssrLoadModule("/src/lib/liluvineStore.js");
  const J = await serveur.ssrLoadModule("/src/lib/journalIntime.js");
  const matin = (j, h = 8) => new Date(2026, 10, j, h, 0);

  // 1. Sans accord de l'utilisateur : Liluvine ne dit rien
  S.verifierBonjour("u1", matin(16));
  assert.equal(S.lireLiluvine().messages.length, 0, "pas de bonjour sans accord");

  // 2. Accord donné : bonjour du matin, une pastille, mémorisé
  J.pourUtilisateur("u1"); assert.ok(J.donnerAccord("liluvine"));
  S.verifierBonjour("u1", matin(16));
  let e = S.lireLiluvine();
  assert.equal(e.messages.length, 1); assert.match(e.messages[0].content, /Bonjour/); assert.equal(e.nonLus, 1); assert.ok(e.bulle);
  assert.ok(localStorage.getItem("mpw_liluvine_bonjour_nonlu_u1"));

  // 3. Une seule fois par jour
  S.verifierBonjour("u1", matin(16, 10));
  assert.equal(S.lireLiluvine().messages.length, 1, "un seul bonjour par jour");

  // 4. Application fermée puis rouverte : le bonjour non lu revient avec sa pastille (la conversation est en mémoire seulement)
  S.lierUtilisateur("autre"); S.lierUtilisateur("u1");
  assert.equal(S.lireLiluvine().messages.length, 0);
  S.verifierBonjour("u1", matin(16, 9));
  e = S.lireLiluvine(); assert.equal(e.messages.length, 1); assert.equal(e.nonLus, 1, "bonjour non lu restauré");

  // 5. L'utilisateur ouvre Liluvine : lu, la pastille s'éteint et n'est plus mémorisée
  S.surLiluvine(true);
  assert.equal(S.lireLiluvine().nonLus, 0); assert.equal(localStorage.getItem("mpw_liluvine_bonjour_nonlu_u1"), null);
  S.surLiluvine(false); S.lierUtilisateur("autre"); S.lierUtilisateur("u1");
  S.verifierBonjour("u1", matin(16, 9));
  assert.equal(S.lireLiluvine().messages.length, 0, "bonjour lu : il ne revient pas");

  // 6. Le lendemain matin : un nouveau bonjour
  S.verifierBonjour("u1", matin(17));
  assert.equal(S.lireLiluvine().messages.length, 1); assert.equal(S.lireLiluvine().nonLus, 1);
  console.log("liluvineBonjour : tous les tests passent");
} finally { await serveur.close(); }
