// Test du verrou d'écran : drapeau effacé à la connexion / déconnexion, tolérance pendant l'empreinte (logique pure).
// Lancer : cd frontend && node tests/verrouEtat.test.mjs (Node 20+, aucune installation).
import { CLE_VERROU, avecTolerance, effacerVerrou, ecrireDrapeau, lireDrapeau } from "../src/lib/verrouEtat.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };

// Faux « sessionStorage » (un tableau clé / valeur)
const faux = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

// --- Drapeau
const s = faux();
ok("au départ : pas verrouillé", lireDrapeau(s) === false);
ecrireDrapeau(true, s);
ok("verrou posé (survit au rechargement)", lireDrapeau(s) === true && s._m.get(CLE_VERROU) === "1");
// Cas du signalement : la session expire PENDANT le verrou, puis nouvelle connexion
effacerVerrou(s);
ok("connexion / perte de session : le verrou ne reste pas", lireDrapeau(s) === false);
ecrireDrapeau(false, s);
ok("effacer deux fois est sans effet", lireDrapeau(s) === false);
ok("stockage absent ou en panne : jamais d'erreur", lireDrapeau(null) === false && (ecrireDrapeau(true, null), true) && (effacerVerrou(undefined) || true));
const casse = { getItem() { throw new Error("bloqué"); }, setItem() { throw new Error("bloqué"); }, removeItem() { throw new Error("bloqué"); } };
ok("stockage qui lève une erreur : ignoré", lireDrapeau(casse) === false && (ecrireDrapeau(true, casse), true));

// --- Tolérance pendant la fenêtre d'empreinte
let t = 1_000_000; const maintenant = () => t;
const cible = {};
let resoudre; const promesse = new Promise((r) => { resoudre = r; });
const rendue = avecTolerance(promesse, cible, maintenant);
ok("la même promesse est rendue", rendue === promesse);
ok("pendant l'attente : tolérance de 120 s", cible.__mpwTolerance === t + 120000);
t += 7000; resoudre({ secret: "x" }); await promesse; await Promise.resolve();
ok("après la réponse : encore 2 s de tolérance (retour du focus)", cible.__mpwTolerance === t + 2000);
// Annulation / échec de l'empreinte : la tolérance se referme aussi
const c2 = {}; const refus = Promise.reject(new Error("annulé"));
avecTolerance(refus, c2, maintenant).catch(() => {});
await refus.catch(() => {}); await Promise.resolve();
ok("empreinte refusée : tolérance refermée à 2 s", c2.__mpwTolerance === t + 2000);
