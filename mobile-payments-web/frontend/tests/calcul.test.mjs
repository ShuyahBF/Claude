// Test de la calculette (partie pure). Node 20+.
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const { evaluer, montantEntier } = await import("../src/lib/calcul.js");
ok("addition", evaluer("1500+2500") === 4000);
ok("priorité de la multiplication", evaluer("1000+500*3") === 2500);
ok("× ÷ et virgule décimale", evaluer("2,5×4") === 10 && evaluer("9000÷4") === 2250);
ok("parenthèses", evaluer("(1000+500)*2") === 3000);
ok("espaces dans les milliers", evaluer("65 000 - 4 500") === 60500);
ok("pourcentage seul", evaluer("20%") === 0.2);
ok("a + b% = a augmenté de b %", evaluer("5000+10%") === 5500 && evaluer("5000-10%") === 4500);
ok("moins unaire", evaluer("-5+10") === 5);
ok("division par zéro", evaluer("5/0") === null);
ok("expression incomplète ou inconnue", evaluer("5+") === null && evaluer("") === null && evaluer("abc") === null);
ok("parenthèse non fermée", evaluer("(5+3") === null);
ok("aucun code exécuté", evaluer("alert(1)") === null);
ok("montant entier arrondi", montantEntier("10/3") === 3 && montantEntier("1000*1,5") === 1500);
ok("montant négatif refusé", montantEntier("5-10") === null);
