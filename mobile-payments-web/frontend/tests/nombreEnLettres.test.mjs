// Test du montant en lettres. Lancer : cd frontend && node tests/nombreEnLettres.test.mjs (Node 20+, aucune installation).
import { enLettres as L } from "../src/lib/nombreEnLettres.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n + (v ? "" : " → " + n)); if (!v) process.exitCode = 1; };
const cas = [
  [0, "zéro"], [1, "un"], [16, "seize"], [21, "vingt et un"], [71, "soixante et onze"], [77, "soixante-dix-sept"], [80, "quatre-vingts"], [81, "quatre-vingt-un"], [91, "quatre-vingt-onze"],
  [100, "cent"], [200, "deux cents"], [250, "deux cent cinquante"], [1000, "mille"], [2500, "deux mille cinq cents"], [20000, "vingt mille"], [200000, "deux cent mille"],
  [80000, "quatre-vingt mille"], [1_000_000, "un million"], [2_000_000, "deux millions"], [1_250_000, "un million deux cent cinquante mille"], [3_000_000_000, "trois milliards"],
];
for (const [n, attendu] of cas) { const r = L(n); console.log((r === attendu ? "OK  " : "ECHEC ") + `${n} → ${r}` + (r === attendu ? "" : ` (attendu : ${attendu})`)); if (r !== attendu) process.exitCode = 1; }
ok("20 000 et 200 000 se lisent différemment", L(20000) !== L(200000));
ok("valeur invalide", L("abc") === "" && L(-5) === "");
