// Test des lignes de paiement des SMS (logique pure). Lancer : cd frontend && node tests/smsPaiements.test.mjs (Node 20+, aucune installation).
// Données FICTIVES : aucun vrai numéro de transaction, nom ni solde.
import { analyserSms, categorieSms, estTransaction, confirmePaiement, fusionner, lireNombre, memeMarchand, montantDe, sansRepetition, telephoneDe } from "../src/lib/smsPaiements.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const T = 1_800_000_000_000;

// --- Nombres
ok("2,150.00 → 2150", lireNombre("2,150.00") === 2150);
ok("15 000 → 15000", lireNombre("15 000") === 15000);
ok("15.000 → 15000", lireNombre("15.000") === 15000);
ok("6403.0202 → 6403", lireNombre("6403.0202") === 6403);
ok("montant hors solde", montantDe("Paiement de 2500 FCFA effectué. Nouveau solde: 82 500 FCFA") === 2500);

// --- Lignes
const depense = analyserSms({ adresse: "OrangeMoney", recu_le: T, corps: "Paiement de 2500 FCFA à BOUTIQUE TEST a ete effectue avec succes. Nouveau solde: 82 500 FCFA. Trans id: MP261113.1339.11111111" });
ok("dépense : sens, montant, solde, numéro", depense?.genre === "DEPENSE" && depense.montant === 2500 && depense.solde === 82500 && depense.reference === "MP261113.1339.11111111");
ok("dépense : bénéficiaire", depense?.tiers === "BOUTIQUE TEST");
ok("la date vient du numéro de transaction", new Date(depense.quand).getFullYear() === 2026 && new Date(depense.quand).getHours() === 13 && new Date(depense.quand).getMinutes() === 39);
const recette = analyserSms({ adresse: "MOOV", recu_le: T, corps: "Vous avez reçu 25.000 F CFA de AWA TEST. Solde: 40 000 F CFA" });
ok("recette : sens et montant", recette?.genre === "RECETTE" && recette.montant === 25000);
const promoMots = analyserSms({ adresse: "X", recu_le: T, corps: "Gagnez 500000 FCFA avec notre jeu concours" });
ok("promotion gardée mais hors décompte", promoMots?.categorie === "promo" && !estTransaction(promoMots));
ok("sans montant ignoré", analyserSms({ adresse: "X", recu_le: T, corps: "Votre forfait internet expire le 15/11/2026" }) === null);

// --- Classement promo / alerte / message / transaction
const promo = "Orange Money: retirez 50 000 FCFA et beneficiez de 0% de frais jusqu'au 31/12. Composez *144#";
ok("promo détectée", categorieSms({ adresse: "OrangeMoney", corps: promo }) === "promo");
const lignePromo = analyserSms({ adresse: "OrangeMoney", recu_le: T, corps: promo });
ok("promo : gardée, hors décompte", lignePromo?.categorie === "promo" && !estTransaction(lignePromo));
ok("promo : ne confirme jamais un paiement", !confirmePaiement({ adresse: "OrangeMoney", recu_le: T, corps: promo }, { montant: 50000, codeMarchand: "", libelle: "X", envoyeLe: 0 }));
ok("alerte de banque", categorieSms({ adresse: "UBA", corps: "DEBIT Montant : XOF600,000.00 Compte : 0123" }) === "alerte");
ok("alerte : gardée, hors décompte", analyserSms({ adresse: "UBA", recu_le: T, corps: "DEBIT Montant : XOF600,000.00 Compte : 0123" })?.categorie === "alerte");
ok("message d'une personne", categorieSms({ adresse: "+22670123456", corps: "Je t'ai envoye 5000 FCFA" }) === "message");
ok("message : gardé, hors décompte", analyserSms({ adresse: "70123456", recu_le: T, corps: "Vous avez reçu 5000 FCFA de ma part" })?.categorie === "message");
ok("vraie transaction", categorieSms({ adresse: "OrangeMoney", corps: "Vous avez paye 15 000 FCFA a SONABEL. Trans id: MP261113.1339.95787510" }) === "transaction");

// --- Fusion sans doublon
const a = fusionner([], [depense, recette]);
ok("2 nouvelles lignes", a.nouvelles === 2 && a.lignes.length === 2);
const b = fusionner(a.lignes, [depense, recette]);
ok("relire ne crée pas de doublon", b.nouvelles === 0 && b.lignes.length === 2);

// --- Confirmation : montant ET marchand (le montant seul ne suffit jamais)
const sms = { adresse: "OrangeMoney", recu_le: T, corps: "Paiement de 50 FCFA a LA MENAGERE (6557908) effectue. Trans id: MP261113.1400.22222222" };
const p = { montant: 50, codeMarchand: "6557908", libelle: "La Ménagère", envoyeLe: T - 1000 };
ok("montant + code marchand : confirmé", confirmePaiement(sms, p));
ok("montant seul : PAS confirmé", !confirmePaiement({ ...sms, corps: "Paiement de 50 FCFA a AUTRE BOUTIQUE effectue." }, p));
ok("bon code, mauvais montant : PAS confirmé", !confirmePaiement({ ...sms, corps: "Paiement de 75 FCFA a LA MENAGERE (6557908) effectue." }, p));
ok("à défaut du code, le nom du marchand suffit avec le montant", confirmePaiement({ ...sms, corps: "Paiement de 50 FCFA a LA MENAGERE effectue." }, p));
ok("argent reçu : PAS confirmé", !confirmePaiement({ ...sms, corps: "Vous avez reçu 50 FCFA de LA MENAGERE (6557908)." }, p));
ok("SMS antérieur à l'envoi : PAS confirmé", !confirmePaiement({ ...sms, recu_le: T - 3_600_000 }, p));
ok("code plus long (65579089) : PAS confirmé", !confirmePaiement({ ...sms, corps: "Paiement de 50 FCFA a XYZ (65579089) effectue." }, p));

// --- Argent REÇU : le SMS donne le NUMÉRO de téléphone ; PAIEMENT : le NOM du marchand seul, souvent en double
const recu = analyserSms({ adresse: "OrangeMoney", recu_le: T, corps: "Vous avez recu 5000 FCFA du 70 12 34 56. Nouveau solde: 12 000 FCFA. Trans id: MP261113.1500.33333333" });
ok("reçu : le tiers est le numéro de téléphone", recu?.genre === "RECETTE" && recu.tiers === "70 12 34 56" && recu.solde === 12000);
ok("reçu avec indicatif", telephoneDe("Vous avez reçu 5000 FCFA de +226 70123456 ref MP261113.1500.33333333") === "+226 70 12 34 56");
ok("les montants et numéros de transaction ne sont pas pris pour un téléphone", telephoneDe("Vous avez recu 12345678 FCFA. Solde 87654321 FCFA. MP261113.1500.33333333") === "");
ok("nom répété dédoublonné", sansRepetition("ALIMENTATION LA MENAGERE ALIMENTATION LA MENAGERE") === "ALIMENTATION LA MENAGERE" && sansRepetition("BOUTIQUE TEST") === "BOUTIQUE TEST");
const double = analyserSms({ adresse: "OrangeMoney", recu_le: T, corps: "Votre paiement de 50 FCFA a ALIMENTATION LA MENAGERE ALIMENTATION LA MENAGERE a ete effectue avec succes. Nouveau solde: 9 950 FCFA. Trans id: MP261113.1600.44444444" });
ok("paiement : nom du marchand seul, dédoublonné", double?.genre === "DEPENSE" && double.tiers === "ALIMENTATION LA MENAGERE" && double.montant === 50);
ok("noms : accents, casse, mot en plus", memeMarchand("ALIMENTATION LA MENAGERE", "La Ménagère") && memeMarchand("LA MENAGERE", "alimentation la menagere"));
ok("noms différents", !memeMarchand("PHARMACIE DU MARCHE", "La Ménagère") && !memeMarchand("AB", "AB"));

// --- Confirmation par le NOM (le SMS d'un paiement ne donne pas le code marchand)
const pn = { montant: 50, codeMarchand: "6557908", libelle: "La Ménagère", envoyeLe: T - 1000 };
ok("montant + nom du marchand (en double) : confirmé", confirmePaiement({ adresse: "OrangeMoney", recu_le: T, corps: double ? "Votre paiement de 50 FCFA a ALIMENTATION LA MENAGERE ALIMENTATION LA MENAGERE a ete effectue avec succes. Trans id: MP261113.1600.44444444" : "" }, pn));
ok("montant seul avec un AUTRE marchand : PAS confirmé", !confirmePaiement({ adresse: "OrangeMoney", recu_le: T, corps: "Votre paiement de 50 FCFA a PHARMACIE DU MARCHE a ete effectue avec succes." }, pn));
ok("marchand sans nom enregistré : pas de confirmation automatique", !confirmePaiement({ adresse: "OrangeMoney", recu_le: T, corps: "Votre paiement de 50 FCFA a ALIMENTATION LA MENAGERE a ete effectue avec succes." }, { ...pn, libelle: "" }));

// --- Filtre des SMS (numéro, montant, sens, expéditeur, dates)
import { filtrerLignes, filtreActif } from "../src/lib/smsPaiements.js";
const L = [
  { id: 1, adresse: "OrangeMoney", quand: new Date("2026-11-10T10:00:00").getTime(), montant: 2500, genre: "DEPENSE", tiers: "ALIMENTATION LA MENAGERE", reference: "MP261110.1000.AAAA" },
  { id: 2, adresse: "OrangeMoney", quand: new Date("2026-11-12T09:00:00").getTime(), montant: 10000, genre: "RECETTE", tiers: "+22670123456", reference: "MP261112.0900.BBBB" },
  { id: 3, adresse: "Moov Money", quand: new Date("2026-11-14T18:30:00").getTime(), montant: 500, genre: "DEPENSE", tiers: "Pharmacie du Marché", reference: "CI261114.1830.CCCC" },
  { id: 4, adresse: "Moov Money", quand: new Date("2026-11-14T19:00:00").getTime(), montant: 1000, categorie: "promo", tiers: "", reference: "" },
];
const ids = (f) => filtrerLignes(L, f).map((l) => l.id).join(",");
ok("sans filtre : tout", ids({}) === "1,2,3,4");
ok("numéro avec espaces trouve +226…", ids({ texte: "70 12 34 56" }) === "2");
ok("nom sans accents ni casse", ids({ texte: "marche" }) === "3");
ok("référence", ids({ texte: "mp261110" }) === "1");
ok("montant exact (min = max)", ids({ min: 2500, max: 2500 }) === "1");
ok("montant minimum seul", ids({ min: "2500" }) === "1,2");
ok("montant maximum seul", ids({ max: 1000 }) === "3,4");
ok("sens reçu", ids({ sens: "recu" }) === "2");
ok("sens payé (hors promo)", ids({ sens: "paye" }) === "1,3");
ok("hors décompte", ids({ sens: "hors" }) === "4");
ok("expéditeur", ids({ adresse: "Moov Money" }) === "3,4");
ok("dates incluses", ids({ du: "2026-11-12", au: "2026-11-14" }) === "2,3,4" && ids({ au: "2026-11-10" }) === "1");
ok("critères cumulés", ids({ adresse: "Moov Money", min: 600 }) === "4");
ok("filtreActif", !filtreActif({ texte: " ", min: "", sens: "tous" }) && filtreActif({ max: 0 }) && filtreActif({ sens: "recu" }));
// --- Destinataire d'un transfert Orange (numéro + nom) : retrouvé par la recherche « Abibou » (signalé par le propriétaire le 15/11/2026)
import { destinataireDe } from "../src/lib/smsPaiements.js";
const SMS_TRANSFERT = "Cher client, vous avez transfere 25,000.00 FCFA au numero 54144722,ABIBOU. Votre solde est de  18002.3502 FCFA. ID Trans: PP260407.0042.95787716. Pour toute reclamation contactez par appel le 127 ou whatsapp 07000121. Orange Money BF";
const dest = destinataireDe(SMS_TRANSFERT);
ok("destinataire : numéro et nom", dest?.tel === "54 14 47 22" && dest?.nom === "ABIBOU");
const lt = analyserSms({ adresse: "OrangeMoney", recu_le: T, corps: SMS_TRANSFERT });
ok("ligne : montant, nom, numéro, sens", lt.montant === 25000 && lt.genre === "DEPENSE" && lt.tiers === "ABIBOU" && lt.tel === "54 14 47 22");
ok("recherche par le nom (casse libre)", filtrerLignes([lt], { texte: "abibou" }).length === 1 && filtrerLignes([lt], { texte: "Moussa" }).length === 0);
ok("recherche par le numéro", filtrerLignes([lt], { texte: "54 14 47 22" }).length === 1 && filtrerLignes([lt], { texte: "54144722" }).length === 1);
ok("autre SMS sans destinataire : null", destinataireDe("Paiement de 2500 FCFA a PHARMACIE DU MARCHE effectue.") === null);
const ancienne = { ...lt, tiers: "numero 54144722", tel: undefined };
const fus = fusionner([ancienne], [lt]);
ok("relecture : l'ancienne ligne reçoit le nom, sans doublon", fus.lignes.length === 1 && fus.lignes[0].tiers === "ABIBOU" && fus.nouvelles === 0);

// --- Moov : « vers 70123456 reussi » → le numéro seul (sans « reussi »), isolé comme numéro
const lm = analyserSms({ adresse: "Moov Money", recu_le: T, corps: "Transfert de 5000 FCFA vers 70123456 reussi. Nouveau solde: 9000 FCFA. Trans id: CI260409.1000.33333333" });
ok("Moov : tiers = numéro seul, tel isolé", lm && lm.tiers === "70123456" && lm.tel === "70 12 34 56");
ok("Orange inchangé", analyserSms({ adresse: "OrangeMoney", recu_le: T, corps: SMS_TRANSFERT }).tel === "54 14 47 22");
