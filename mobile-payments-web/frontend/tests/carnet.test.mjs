// Test du carnet de contacts (logique pure). Lancer : cd frontend && node tests/carnet.test.mjs (Node 20+). Données FICTIVES.
import { nouvelleCle, pourUtilisateur } from "../src/lib/journalIntime.js";
import { normaliserNumero, operateurDeAdresse, trouverContact, filtrerContacts, trierContacts, lienPayer, corpsRappel, chargerContacts, enregistrerContact, supprimerContact } from "../src/lib/carnet.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const faux = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

ok("numéro 8 chiffres", normaliserNumero("54144722") === "54 14 47 22" && normaliserNumero("54 14 47 22") === "54 14 47 22");
ok("indicatif retiré", normaliserNumero("+226 54 14 47 22") === "54 14 47 22" && normaliserNumero("0022654144722") === "54 14 47 22");
ok("numéro invalide", normaliserNumero("1234") === null && normaliserNumero("abc") === null && normaliserNumero("") === null);
ok("opérateur d'après l'expéditeur", operateurDeAdresse("OrangeMoney") === "Orange" && operateurDeAdresse("Moov Money") === "Moov Africa" && operateurDeAdresse("75000") === "");

const A = { id: "1", nom: "Abibou", tel: "54 14 47 22", operateur: "Orange", montant: 25000, note: "Frère" };
const B = { id: "2", nom: "Élodie Sawadogo", tel: "70 12 34 56", operateur: "Moov Africa", montant: 0, note: "" };
ok("trouver par numéro (indicatif ignoré)", trouverContact([A, B], "+22654144722")?.id === "1" && trouverContact([A, B], "99999999") === undefined && trouverContact([A], "123") === undefined);
ok("recherche nom sans accents", filtrerContacts([A, B], "elodie").length === 1 && filtrerContacts([A, B], "ABIB").length === 1 && filtrerContacts([A, B], "frere").length === 1);
ok("recherche numéro", filtrerContacts([A, B], "70 12").length === 1 && filtrerContacts([A, B], "").length === 2);
ok("tri par nom", trierContacts([B, A]).map((c) => c.id).join() === "1,2");
ok("lien de paiement prérempli", lienPayer(A) === "/?transfert=1&phone=54144722&operateur=Orange&montant=25000" && lienPayer({ ...B }) === "/?transfert=1&phone=70123456&operateur=Moov+Africa");
const r = corpsRappel(A, { frequence: "mensuel", echeance: "2026-12-01" });
ok("rappel : libellé + montant, jamais le numéro", r.libelle === "Envoyer à Abibou" && r.montant === 25000 && r.operateur === "Orange" && !JSON.stringify(r).includes("5414") && r.frequence === "mensuel");
ok("rappel Moov", corpsRappel(B, { frequence: "unique", echeance: "2026-12-01" }).operateur === "Moov");

// Stockage chiffré, propre au compte
const cle = await nouvelleCle(), st = faux();
pourUtilisateur("compte-A");
const id = await enregistrerContact(cle, { nom: "Abibou", tel: "54 14 47 22", operateur: "Orange", montant: 25000, note: "" }, st);
ok("contact chiffré", !(st.getItem("mpw_carnet_compte-A") || "").includes("Abibou") && !(st.getItem("mpw_carnet_compte-A") || "").includes("5414"));
await enregistrerContact(cle, { id, nom: "Abibou K.", tel: "54 14 47 22", operateur: "Orange", montant: 30000, note: "" }, st);
let l = await chargerContacts(cle, st);
ok("modification sans doublon", l.length === 1 && l[0].nom === "Abibou K." && l[0].montant === 30000);
pourUtilisateur("compte-B");
ok("autre compte : carnet vide", (await chargerContacts(cle, st)).length === 0);
pourUtilisateur("compte-A");
supprimerContact(id, st);
ok("suppression", (await chargerContacts(cle, st)).length === 0);
