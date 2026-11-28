import assert from "node:assert/strict";
import { trierLignes, sensSuivant, titreMenu } from "../src/lib/tri.js";

const l = [{ n: "Éclair" }, { n: "" }, { n: "abc" }, { n: "Zèbre" }];
assert.deepEqual(trierLignes(l, (x) => x.n, "asc").map((x) => x.n), ["abc", "Éclair", "Zèbre", ""]);   // accents ignorés, vide en dernier
assert.deepEqual(trierLignes(l, (x) => x.n, "desc").map((x) => x.n), ["Zèbre", "Éclair", "abc", ""]);  // vide en dernier aussi en décroissant
assert.equal(trierLignes(l, (x) => x.n, null), l);                                                      // 3e clic : ordre d'origine
assert.deepEqual(trierLignes([{ v: 10 }, { v: 9 }, { v: 100 }], (x) => x.v, "asc").map((x) => x.v), [9, 10, 100]); // nombres, pas du texte
assert.deepEqual(trierLignes([{ d: "2026-11-02" }, { d: "2026-01-15" }], (x) => x.d, "asc").map((x) => x.d), ["2026-01-15", "2026-11-02"]);
assert.deepEqual([null, "asc", "desc"].map(sensSuivant), ["asc", "desc", null]);
assert.equal(titreMenu("gestion des contacts"), "Gestion Des Contacts");
assert.equal(titreMenu("Tableau de bord WhatsApp"), "Tableau De Bord WhatsApp");
console.log("tri.test.mjs : OK");
