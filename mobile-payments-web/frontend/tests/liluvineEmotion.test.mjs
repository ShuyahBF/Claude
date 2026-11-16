// Émotion et initiative de Liluvine : node tests/liluvineEmotion.test.mjs
import assert from "node:assert/strict";
import { emotionDeTexte, initiativeDuMoment } from "../src/lib/liluvineEmotion.js";

assert.equal(emotionDeTexte("Bravo, c'est une très bonne nouvelle !"), "joie");
assert.equal(emotionDeTexte("Courage, un pas après l'autre, vous pouvez y arriver."), "encouragement");
assert.equal(emotionDeTexte("Je comprends, ça doit être difficile et fatigant. Je suis là."), "empathie");
assert.equal(emotionDeTexte("Voici quelques conseils pratiques."), "calme");
assert.equal(emotionDeTexte("Bravo !", true), "urgence");                      // détresse signalée : toujours « urgence »
assert.equal(emotionDeTexte("Félicitations, c'est génial et formidable"), "joie"); // accents ignorés

const matin = new Date("2026-11-16T08:00:00");
const soir = new Date("2026-11-16T19:30:00");
const nuit = new Date("2026-11-16T23:30:00");
assert.match(initiativeDuMoment({ maintenant: matin, alea: 0.1 }).texte, /Bonjour/);
assert.match(initiativeDuMoment({ maintenant: soir, alea: 0.1 }).texte, /Bonsoir/);
assert.match(initiativeDuMoment({ maintenant: nuit, alea: 0.1 }).texte, /tard/);
assert.equal(initiativeDuMoment({ maintenant: matin, alea: 0.9 }), null);                                        // pas toujours : 60 % des fois
assert.equal(initiativeDuMoment({ maintenant: matin, derniereInitiative: matin.getTime() - 3600 * 1000, alea: 0.1 }), null);   // jamais 2 fois en 8 h
assert.ok(initiativeDuMoment({ maintenant: matin, derniereInitiative: matin.getTime() - 9 * 3600 * 1000, alea: 0.1 }));
assert.match(initiativeDuMoment({ maintenant: matin, derniereEntree: matin.getTime() - 5 * 86400 * 1000, alea: 0.1 }).texte, /quelques jours/);
console.log("liluvineEmotion : tous les tests passent");
