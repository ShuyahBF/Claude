// Test du budget de dépenses et des détails de ligne (parties pures). Node 20+. Données FICTIVES.
const { register } = await import("node:module");
const charge = `
export async function resolve(s, c, n) { if (s.startsWith("@/lib/")) return { url: new URL("../src/lib/" + s.slice(6) + ".js", "${import.meta.url}").href, shortCircuit: true }; return n(s, c); }`;
register("data:text/javascript," + encodeURIComponent(charge), import.meta.url);
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const B = await import("../src/lib/budget.js");
const t = (j, h = 10) => new Date(2026, 10, j, h).getTime();                  // novembre 2026 (jeudi 5, lundi 23, etc.)
const maintenant = t(25);                                                      // mercredi 25/11/2026 10 h
ok("début du mois", B.debutPeriode("mois", maintenant) === new Date(2026, 10, 1).getTime());
ok("début de semaine = lundi 23", B.debutPeriode("semaine", maintenant) === new Date(2026, 10, 23).getTime());
ok("début du jour", B.debutPeriode("jour", maintenant) === new Date(2026, 10, 25).getTime());
ok("quinzaine : après le 16", B.debutPeriode("quinzaine", maintenant) === new Date(2026, 10, 16).getTime());
ok("trimestre : 1er octobre", B.debutPeriode("trimestre", maintenant) === new Date(2026, 9, 1).getTime());
ok("année : 1er janvier", B.debutPeriode("annee", maintenant) === new Date(2026, 0, 1).getTime());
const ligne = (id, genre, montant, quand, adresse = "OrangeMoney", extra = {}) => ({ id, genre, montant, quand, adresse, categorie: "transaction", ...extra });
const lignes = [
  ligne("a", "DEPENSE", 20000, t(3)), ligne("b", "DEPENSE", 15000, t(24), "Moov Money"), ligne("c", "RECETTE", 90000, t(24)),
  ligne("d", "DEPENSE", 5000, t(25, 8)), ligne("e", "DEPENSE", 9999, t(25, 9), "OrangeMoney", { doublon: true }), ligne("f", "DEPENSE", 700, t(25, 9), "OrangeMoney", { categorie: "promo" }),
  ligne("g", "DEPENSE", 99999, t(26)),                                         // dans le futur : ignorée
];
const b = { actif: true, montant: 65000, periode: "mois", depuis: 0 };
const d = B.depensesDeLaPeriode(lignes, b, maintenant);
ok("dépenses du mois : payées seulement, sans recette, doublon, promo ni futur", d.total === 40000 && d.nb === 3);
ok("détail par opérateur, du plus gros au plus petit", d.parOperateur[0].adresse === "OrangeMoney" && d.parOperateur[0].total === 25000 && d.parOperateur[1].total === 15000);
ok("semaine : seulement depuis lundi", B.depensesDeLaPeriode(lignes, { ...b, periode: "semaine" }, maintenant).total === 20000);
const n = B.niveauBudget(lignes, b, 0, maintenant);
ok("niveau : reste, pourcentage, ok", n.reste === 25000 && n.pct === 62 && n.niveau === "ok" && !n.depasse);
const n2 = B.niveauBudget(lignes, b, 30000, maintenant);
ok("un paiement qui fait dépasser est détecté, avec l'excès", n2.depasse && n2.exces === 5000 && n2.apres === 70000 && n2.niveau === "depasse");
ok("exactement au budget : pas de dépassement", !B.niveauBudget(lignes, b, 25000, maintenant).depasse);
ok("à 80 % ou plus : attention", B.niveauBudget(lignes, b, 15000, maintenant).niveau === "attention");
ok("budget désactivé : aucun niveau", B.niveauBudget(lignes, { ...b, actif: false }, 10, maintenant) === null);
ok("montant 0 : désactivé d'office", B.normaliser({ actif: true, montant: 0 }).actif === false);
const r = B.reinitialiser(b, t(25, 9, 30));
ok("réinitialisation : le décompte repart de zéro", B.depensesDeLaPeriode(lignes, r, maintenant).total === 0 && B.depensesDeLaPeriode(lignes, r, maintenant).nb === 0);
ok("réinitialisation : un paiement ensuite compte", B.depensesDeLaPeriode([...lignes, ligne("h", "DEPENSE", 1000, t(25, 9) + 60_000)], r, maintenant).total === 1000);
ok("budget déjà dépassé signalé", B.niveauBudget(lignes, { ...b, montant: 30000 }, 0, maintenant).deja === true);
ok("période inconnue → mois", B.normaliser({ montant: 5, periode: "x" }).periode === "mois");
// Stockage simulé
const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
ok("enregistrement puis relecture", B.enregistrerBudget(b, st) && B.chargerBudget(st).montant === 65000 && B.chargerBudget(st).actif);
ok("stockage vide : budget désactivé", B.chargerBudget({ getItem: () => null }).actif === false);
// Détails de ligne
const l = B.avecDetails({ id: "x", montant: 1 }, { motif: "  Transport ", details: "", pieces: ["p1", "p2", "p3", "p4"] });
ok("détails : motif nettoyé, vide retiré, 3 pièces au plus", l.motif === "Transport" && !("details" in l) && l.pieces.length === 3);
ok("détails vides : tout est retiré", !B.aDesDetails(B.avecDetails({ id: "x", motif: "a", pieces: ["p"] }, { pieces: [] })));
ok("remplacer une ligne", B.remplacerLigne([{ id: 1 }, { id: 2 }], 2, (x) => ({ ...x, motif: "m" }))[1].motif === "m");
// ---- Lot 218 : rubriques en tableau, recherche, évolution du solde ----
const arts = B.normaliserArticles([{ rubrique: " Riz 25 kg ", montant: "12000", categorie: "Courses / alimentation" }, { rubrique: "", montant: 0 }, { rubrique: "Taxi", montant: 1500.4, categorie: "Transport" }]);
ok("rubriques nettoyées (ligne vide retirée, montant entier)", arts.length === 2 && arts[0].rubrique === "Riz 25 kg" && arts[1].montant === 1500);
ok("total des rubriques", B.totalArticles(arts) === 13500);
const l1 = B.avecDetails(ligne("r1", "DEPENSE", 14000, t(20), "OrangeMoney", { tiers: "MARCHE SANDAGA" }), { motif: "Courses / alimentation", articles: arts });
ok("rubriques gardées dans la ligne", l1.articles.length === 2 && B.aDesDetails(l1));
const base = [l1, ligne("r2", "DEPENSE", 3000, t(21), "Moov Money", { tiers: "PHARMACIE NOUVELLE" }), ligne("r3", "RECETTE", 50000, t(22), "OrangeMoney", { tiers: "22670123456" })];
const rr = B.rechercherRubriques(base, "RIZ");
ok("recherche : sans casse, une ligne par rubrique", rr.length === 1 && rr[0].intitule === "Riz 25 kg" && rr[0].montant === 12000 && rr[0].montantSms === 14000);
ok("recherche : sans accents et plusieurs mots", B.rechercherRubriques(base, "alimentation riz").length === 1 && B.rechercherRubriques(base, "pharmacie").length === 1);
ok("recherche : un mot absent ne trouve rien", B.rechercherRubriques(base, "riz voiture").length === 0);
ok("recherche vide : rien", B.rechercherRubriques(base, "  ").length === 0);
const sol = (id, g, m, q, a, s) => ({ ...ligne(id, g, m, q, a), solde: s });
const hist = [sol("s0", "DEPENSE", 1000, t(2), "Moov Money", 8000), sol("s1", "DEPENSE", 2000, t(5), "OrangeMoney", 30000), sol("s2", "RECETTE", 20000, t(10), "OrangeMoney", 50000), sol("s3", "DEPENSE", 5000, t(12), "Moov Money", 3000)];
const sr = B.serieSolde(hist, new Date(2026, 10, 1).getTime(), t(25));
ok("solde total : premier point = solde du premier SMS, puis somme des derniers soldes de chaque portefeuille", sr.points[0].total === 8000 && sr.points[1].total === 38000 && sr.points[2].total === 58000);
ok("dernier point : 50 000 (Orange) + 3 000 (Moov)", sr.points.at(-1).total === 53000);
ok("entrée d'argent repérée", sr.entrees.length === 1 && sr.entrees[0].montant === 20000);
ok("sans solde dans les SMS : pas de courbe", B.serieSolde([ligne("z", "DEPENSE", 1, t(3))], 0, t(25)).aSolde === false);
