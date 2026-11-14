// Test des lignes de paiement des SMS (logique pure). Lancer : cd frontend && node tests/smsPaiements.test.mjs (Node 20+, aucune installation).
// Données FICTIVES : aucun vrai numéro de transaction, nom ni solde.
import { analyserSms, confirmePaiement, fusionner, lireNombre, montantDe } from "../src/lib/smsPaiements.js";
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
ok("recette : sens, montant, expéditeur", recette?.genre === "RECETTE" && recette.montant === 25000 && recette.tiers === "AWA TEST");
ok("promotion ignorée", analyserSms({ adresse: "X", recu_le: T, corps: "Gagnez 500000 FCFA avec notre jeu concours" }) === null);
ok("sans montant ignoré", analyserSms({ adresse: "X", recu_le: T, corps: "Votre forfait internet expire le 15/11/2026" }) === null);

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
