// Test du montant prononcé. Lancer : cd frontend && node tests/montantParle.test.mjs (Node 20+, aucune installation).
import { montantParle as M, montantsParles } from "../src/lib/montantParle.js";
import { enLettres } from "../src/lib/nombreEnLettres.js";
let echecs = 0;
const verifie = (nom, ok, detail = "") => { console.log((ok ? "OK  " : "ECHEC ") + nom + (ok ? "" : " " + detail)); if (!ok) { echecs++; process.exitCode = 1; } };
const cas = [
  ["huit mille", 8000], ["quatre mille sept cents francs", 4700], ["douze mille cinq cents", 12500], ["mille", 1000], ["cent", 100], ["deux cents", 200],
  ["quatre-vingt-dix-sept", 97], ["quatre vingts", 80], ["soixante et onze", 71], ["soixante-dix mille", 70000], ["vingt et un mille", 21000], ["nonante mille", 90000],
  ["un million deux cent mille", 1_200_000], ["deux millions", 2_000_000], ["Le montant est de huit mille francs CFA", 8000], ["cinq mille FCFA s'il vous plaît", 5000],
  ["4700", 4700], ["4 700 FCFA", 4700], ["4.700", 4700], ["4,700 francs", 4700], ["12 500", 12500], ["8 mille", 8000], ["4 mille 700", 4700], ["trois cent cinquante mille", 350000],
  ["bonjour", null], ["", null], ["zéro", null],
];
for (const [t, attendu] of cas) { const r = M(t); verifie(`« ${t} » → ${r}`, r === attendu, `(attendu : ${attendu})`); }
// Aller-retour : tout montant écrit en lettres par l'application doit être relu à l'identique (échantillon large)
let faux = 0;
for (let n = 1; n <= 200000; n += (n < 5000 ? 1 : 37)) { if (M(enLettres(n)) !== n) { faux++; if (faux < 5) console.log("  aller-retour faux :", n, enLettres(n), "→", M(enLettres(n))); } }
verifie("aller-retour montant → lettres → montant", faux === 0, `(${faux} écarts)`);
verifie("plusieurs transcriptions, valeurs distinctes", JSON.stringify(montantsParles(["huit mille", "8000", "huit mille cinq cents", "bonjour"]).map((x) => x.valeur)) === "[8000,8500]");
console.log(echecs === 0 ? "\nTous les tests passent." : `\n${echecs} échec(s).`);
