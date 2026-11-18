// Réglage de Liluvine dans le profil : présente / silencieuse pendant une période / désactivée, et son effet sur le bonjour du matin.
// Lancer : cd frontend && node tests/liluvineReglage.test.mjs   (utilise Vite ; aucun navigateur)
import { createServer } from "vite";
import assert from "node:assert/strict";

const memoire = new Map();
globalThis.localStorage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k) };
const serveur = await createServer({ root: new URL("..", import.meta.url).pathname, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const R = await serveur.ssrLoadModule("/src/lib/liluvineReglage.js");
  const S = await serveur.ssrLoadModule("/src/lib/liluvineStore.js");
  const J = await serveur.ssrLoadModule("/src/lib/journalIntime.js");
  const lundi8h = new Date(2026, 10, 16, 8, 0);

  // 1. Par défaut : présente
  assert.deepEqual(R.lireReglage("u1"), { mode: "active", jusqua: null });
  assert.equal(R.etatLiluvine(R.lireReglage("u1"), lundi8h.getTime()), "active");

  // 2. Fin de silence : demain 5 h, 1 semaine, 1 mois, date choisie (invalide ou passée = null)
  assert.equal(new Date(R.finDuSilence("demain", lundi8h)).getHours(), 5);
  assert.equal(new Date(R.finDuSilence("demain", lundi8h)).getDate(), 17);
  assert.equal(R.finDuSilence("semaine", lundi8h), lundi8h.getTime() + 7 * 86400000);
  assert.equal(new Date(R.finDuSilence("mois", lundi8h)).getMonth(), 11);
  assert.ok(R.finDuSilence("date", lundi8h, "2026-12-01") > lundi8h.getTime());
  assert.equal(R.finDuSilence("date", lundi8h, "2026-11-01"), null); assert.equal(R.finDuSilence("date", lundi8h, ""), null);

  // 3. Silence : active jusqu'à l'échéance, puis la présence revient seule
  const silence = { mode: "silence", jusqua: R.finDuSilence("semaine", lundi8h) };
  assert.equal(R.etatLiluvine(silence, lundi8h.getTime() + 86400000), "silence");
  assert.equal(R.etatLiluvine(silence, lundi8h.getTime() + 8 * 86400000), "active");
  assert.equal(R.etatLiluvine({ mode: "off", jusqua: null }, 0), "off");

  // 4. Effet sur le bonjour du matin : rien quand silencieuse ou désactivée, bonjour quand présente
  J.pourUtilisateur("u1"); assert.ok(J.donnerAccord("liluvine"));
  assert.ok(R.ecrireReglage("u1", silence));
  S.verifierBonjour("u1", lundi8h);
  assert.equal(S.lireLiluvine().messages.length, 0, "silencieuse : pas de bonjour");
  assert.ok(R.ecrireReglage("u1", { mode: "off", jusqua: null }));
  S.verifierBonjour("u1", lundi8h);
  assert.equal(S.lireLiluvine().messages.length, 0, "désactivée : pas de bonjour");

  // 5. Réactivée : le bonjour du matin revient (et la pastille s'allume)
  assert.ok(R.ecrireReglage("u1", { mode: "active", jusqua: null }));
  S.appliquerReglageLiluvine("u1", lundi8h);            // réactivée : le bonjour du matin revient tout de suite
  S.verifierBonjour("u1", lundi8h);                       // (une seule fois par jour)
  assert.equal(S.lireLiluvine().messages.length, 1); assert.equal(S.lireLiluvine().nonLus, 1);

  // 6. On rend Liluvine silencieuse après son bonjour : pastille, bulle et bonjour en attente disparaissent
  assert.ok(R.ecrireReglage("u1", silence)); S.appliquerReglageLiluvine("u1");
  assert.equal(S.lireLiluvine().nonLus, 0); assert.equal(S.lireLiluvine().bulle, null); assert.equal(localStorage.getItem("mpw_liluvine_bonjour_nonlu_u1"), null);

  // 7. Réglage propre à chaque compte
  assert.equal(R.lireReglage("u2").mode, "active");
  console.log("liluvineReglage : tous les tests passent");
} finally { await serveur.close(); }
