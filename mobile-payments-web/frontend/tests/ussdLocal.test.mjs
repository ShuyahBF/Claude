// Test du calcul local du code USSD (logique pure). Lancer : cd frontend && node tests/ussdLocal.test.mjs (Node 20+, aucune installation).
// Les attendus viennent du serveur (backend/ussd.py construire_code) : les deux calculs doivent donner EXACTEMENT le même résultat.
import { ErreurSaisie, construireCode, identifiantLocal, placeholders, preparerPaiementLocal } from "../src/lib/ussdLocal.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const refuse = (valeurs, message, champs = CH, gabarit = G) => { try { construireCode(gabarit, champs, valeurs); return false; } catch (e) { return e instanceof ErreurSaisie && e.message === message; } };

const CH = [{ key: "code", label: "Code", type: "numeric" }, { key: "amount", label: "Montant", type: "numeric" }];
const G = "*144*10*{code}*{amount}#";

ok("placeholders dans l'ordre", JSON.stringify(placeholders(G)) === JSON.stringify(["code", "amount"]));
// Mêmes résultats que le serveur
ok("code simple (espaces retirés)", construireCode(G, CH, { code: "6557908", amount: "2 500" }) === "*144*10*6557908*2500#");
ok("zéros de tête retirés du montant", construireCode(G, CH, { code: "6557908", amount: "002500" }) === "*144*10*6557908*2500#");
ok("champ texte alphanumérique", construireCode("*1*{nom}*{amount}#", [{ key: "nom", label: "Nom", type: "text" }, CH[1]], { nom: "Abc12", amount: "7" }) === "*1*Abc12*7#");
// Mêmes refus, mêmes messages
ok("code avec des lettres refusé", refuse({ code: "12ab", amount: "5" }, "« Code » ne doit contenir que des chiffres"));
ok("montant nul refusé", refuse({ code: "1", amount: "0" }, "Le montant doit être supérieur à 0"));
ok("montant trop élevé refusé", refuse({ code: "1", amount: "10000001" }, "Montant trop élevé : vérifiez la saisie"));
ok("champ vide refusé", refuse({ code: "", amount: "5" }, "« Code » est obligatoire"));
ok("texte avec symbole refusé", refuse({ nom: "a-b" }, "« Nom » ne doit contenir que des lettres et des chiffres", [{ key: "nom", label: "Nom", type: "text" }], "*1*{nom}#"));

// Paiement préparé localement : même forme que celui du serveur
const SERVICE = { id: "svc-1", operateur: "Orange", nom: "Paiement marchand", categorie: "merchant_payment", gabarit_ussd: "*144*10*{code}*{amount}*{pin}#",
  champs: [{ key: "code", label: "Code", type: "numeric", isMerchantCode: true }, { key: "amount", label: "Montant", type: "numeric" }, { key: "pin", label: "Code secret", type: "numeric" }] };
const p = preparerPaiementLocal(SERVICE, { code: "6557908", amount: "2 500", pin: "1234" }, { marchandsConnus: [{ code: "6557908", libelle: "La Ménagère" }], maintenant: new Date("2026-11-17T12:00:00Z"), aleatoire: () => "abc" });
ok("code avec le mot PIN (jamais le vrai code secret)", p.code_ussd === "*144*10*6557908*2500*PIN#");
ok("le code secret saisi n'est ni gardé ni dans le code", !JSON.stringify(p).includes("1234") && p.valeurs.pin === undefined);
ok("identifiant « local- »", p.id === "local-abc" && identifiantLocal(() => "x") === "local-x");
ok("marchand retrouvé par son code", p.marchand.code === "6557908" && p.marchand.libelle === "La Ménagère");
ok("montant, statut, date, marque hors ligne", p.montant === 2500 && p.statut === "prepare" && p.cree_le === "2026-11-17T12:00:00.000Z" && p.hors_ligne === true);
ok("marchand inconnu : libellé nul", preparerPaiementLocal(SERVICE, { code: "999", amount: "100" }, { aleatoire: () => "z" }).marchand.libelle === null);
ok("saisie refusée : exception", (() => { try { preparerPaiementLocal(SERVICE, { code: "x", amount: "1" }); return false; } catch (e) { return e instanceof ErreurSaisie; } })());
ok("service sans champ marchand : pas de marchand", preparerPaiementLocal({ ...SERVICE, champs: [CH[1]], gabarit_ussd: "*1*{amount}#" }, { amount: "5" }, { aleatoire: () => "q" }).marchand === null);
