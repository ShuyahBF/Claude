// Test de la sauvegarde en ligne chiffrée (logique pure : instantané, empreinte, chiffrement, restauration sans écrasement). Node 20+. Données FICTIVES.
// Le module importe apiClient (axios, alias @/) : on teste donc les fonctions pures par une copie légère de leur logique via les modules de données.
import { nouvelleCle, pourUtilisateur, enregistrerEntree, chargerEntrees } from "../src/lib/journalIntime.js";
import { enregistrerContact, chargerContacts } from "../src/lib/carnet.js";
import { fusionner } from "../src/lib/smsPaiements.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const faux = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = faux();

// Les fonctions de sauvegarde.js ne dépendent d'apiClient que pour le réseau : on les charge avec un apiClient factice.
const { register } = await import("node:module");
const charge = `
export async function resolve(s, c, n) { if (s === "@/lib/api") return { url: "data:text/javascript,export const apiClient={}", shortCircuit: true };
  if (s.startsWith("@/lib/")) return { url: new URL("../src/lib/" + s.slice(6) + ".js", "${import.meta.url}").href, shortCircuit: true }; return n(s, c); }`;
register("data:text/javascript," + encodeURIComponent(charge), import.meta.url);
const S = await import("../src/lib/sauvegarde.js");

// Téléphone A : données
pourUtilisateur("compte-A");
const cleLocaleA = await nouvelleCle(), cleCoffre = await nouvelleCle();
const idJ = await enregistrerEntree(cleLocaleA, { quand: 1000, humeur: "serein", texte: "Mon secret très personnel" });
const idC = await enregistrerContact(cleLocaleA, { nom: "Abibou", tel: "54 14 47 22", operateur: "Orange", montant: 25000, note: "" });
localStorage.setItem("auror_sms_lignes", JSON.stringify([{ id: "PP1", adresse: "OrangeMoney", quand: 5, genre: "DEPENSE", montant: 25000, tiers: "ABIBOU", tel: "54 14 47 22" }]));
const inst = await S.construireInstantane(cleLocaleA, new Date("2026-11-16T10:00:00Z"));
ok("instantané : journal, carnet, SMS", inst.journal.length === 1 && inst.carnet.length === 1 && inst.sms.length === 1 && inst.v === 1 && !S.instantaneVide(inst));
const h1 = await S.empreinteInstantane(inst), h2 = await S.empreinteInstantane({ ...inst, le: "autre date" });
ok("empreinte stable (la date n'y compte pas)", h1 === h2 && /^[0-9a-f]{64}$/.test(h1));
ok("empreinte change avec le contenu", (await S.empreinteInstantane({ ...inst, carnet: [] })) !== h1);

// Chiffrement avec la clé du coffre
const paquet = await S.chiffrerInstantane(inst, cleCoffre);
ok("sauvegarde illisible sans la clé", typeof paquet === "string" && !paquet.includes("Abibou") && !atob(paquet).includes("secret"));
const relu = await S.lireInstantane(paquet, cleCoffre);
ok("aller-retour", relu.journal[0].texte === "Mon secret très personnel" && relu.carnet[0].nom === "Abibou");
let refuse = false; try { await S.lireInstantane(paquet, await nouvelleCle()); } catch { refuse = true; }
ok("mauvaise clé : refusée", refuse);
const bad = btoa(atob(paquet).slice(0, -3) + "xyz"); refuse = false; try { await S.lireInstantane(bad, cleCoffre); } catch { refuse = true; }
ok("sauvegarde altérée : refusée", refuse);

// Nouveau téléphone B : restauration sans écrasement
globalThis.localStorage = faux();
pourUtilisateur("compte-A");
const cleLocaleB = await nouvelleCle();
let r = await S.restaurerInstantane(relu, cleLocaleB, localStorage);
ok("restauration : tout revient", r.journal === 1 && r.carnet === 1 && r.sms === 1);
ok("données retrouvées", (await chargerEntrees(cleLocaleB))[0].id === idJ && (await chargerContacts(cleLocaleB))[0].id === idC && JSON.parse(localStorage.getItem("auror_sms_lignes"))[0].id === "PP1");
r = await S.restaurerInstantane(relu, cleLocaleB, localStorage);
ok("restaurer deux fois : aucun doublon", r.journal === 0 && r.carnet === 0 && r.sms === 0 && (await chargerEntrees(cleLocaleB)).length === 1);
await enregistrerEntree(cleLocaleB, { id: idJ, quand: 1000, humeur: "triste", texte: "Version locale plus récente" });
await S.restaurerInstantane(relu, cleLocaleB, localStorage);
ok("la version locale n'est jamais écrasée", (await chargerEntrees(cleLocaleB))[0].texte === "Version locale plus récente");
ok("instantané vide", S.instantaneVide({ journal: [], carnet: [], sms: [] }));
