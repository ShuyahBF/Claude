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
