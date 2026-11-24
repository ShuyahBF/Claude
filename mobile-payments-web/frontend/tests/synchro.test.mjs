// Test de la synchronisation (partie pure) : changements, règle « le plus récent l'emporte », suppressions, deux appareils. Node 20+. Données FICTIVES.
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const S = await import("../src/lib/synchro.js");

// --- Un appareil fictif : des fiches en mémoire et des adaptateurs
const appareil = (nom) => {
  const stock = { journal: new Map(), carnet: new Map(), sms: new Map(), budget: new Map() };
  const adaptateurs = Object.fromEntries(S.TYPES.map((t) => [t, {
    ecrire: async (f) => { stock[t].set(f.id, JSON.parse(JSON.stringify(f))); return true; },
    supprimer: async (id) => stock[t].delete(id) || true,
  }]));
  return { nom, stock, etat: S.etatVide(nom), adaptateurs, donnees: () => Object.fromEntries(S.TYPES.map((t) => [t, [...stock[t].values()]])) };
};
// Un cycle complet : envoyer ce qui a changé, puis rejouer ce que les autres ont envoyé (journal du serveur simulé : liste partagée)
const serveur = [];
async function cycle(a, maintenant) {
  const { changements, etat } = await S.calculerChangements(a.donnees(), a.etat, maintenant);
  for (const c of changements) serveur.push({ appareil: a.nom, c });
  a.etat = etat;
  for (let i = a.etat.seq; i < serveur.length; i++) {
    const { appareil: de, c } = serveur[i];
    if (de !== a.nom) await S.appliquerChangement(c, de, a.etat, a.adaptateurs);
    a.etat.seq = i + 1;
  }
}
const t = (min) => new Date(Date.UTC(2026, 10, 24, 10, min, 0));

const A = appareil("aaaa-1"), B = appareil("bbbb-2");
A.stock.journal.set("j1", { id: "j1", quand: Date.UTC(2026, 10, 20), humeur: "joyeux", texte: "Bonjour" });
A.stock.sms.set("s1", { id: "s1", quand: Date.UTC(2026, 10, 21), genre: "DEPENSE", montant: 5000, pieces: [{ id: "photo-locale" }] });
B.stock.carnet.set("c1", { id: "c1", nom: "AWA" });
await cycle(A, t(0)); await cycle(B, t(1)); await cycle(A, t(2));
ok("deux appareils s'unissent : chacun reçoit les fiches de l'autre", B.stock.journal.has("j1") && B.stock.sms.has("s1") && A.stock.carnet.has("c1"));
ok("les photos restent sur leur appareil", !("pieces" in B.stock.sms.get("s1")) && A.stock.sms.get("s1").pieces.length === 1);

// Modification : le plus récent l'emporte
A.stock.journal.get("j1").texte = "Bonjour A";
await cycle(A, t(10));
B.stock.journal.get("j1").texte = "Bonjour B (plus tard)";
await cycle(B, t(11)); await cycle(A, t(12));
ok("modifications concurrentes : la plus récente l'emporte partout", A.stock.journal.get("j1").texte === "Bonjour B (plus tard)" && B.stock.journal.get("j1").texte === "Bonjour B (plus tard)");

// Suppression propagée, sans résurrection
A.stock.carnet.delete("c1");
await cycle(A, t(20)); await cycle(B, t(21));
ok("une suppression se propage", !B.stock.carnet.has("c1"));
await cycle(B, t(22)); await cycle(A, t(23));
ok("une fiche supprimée ne ressuscite pas", !A.stock.carnet.has("c1") && !B.stock.carnet.has("c1"));

// Un changement plus ancien que la fiche locale est ignoré
const vieux = { t: "journal", id: "j1", maj: t(5).toISOString(), d: { id: "j1", texte: "très vieux" } };
const r = await S.appliquerChangement(vieux, "cccc-3", A.etat, A.adaptateurs);
ok("un changement plus ancien est ignoré", r.applique === false && A.stock.journal.get("j1").texte !== "très vieux");

// Rien à envoyer quand rien n'a changé
const vide = await S.calculerChangements(A.donnees(), A.etat, t(30));
ok("sans modification : aucun changement", vide.changements.length === 0);

// Égalité parfaite de date : l'appareil de plus grand identifiant gagne (même décision partout)
const e = S.etatVide("aaaa-1"); e.maj["journal:x"] = "2026-11-24T10:00:00.000Z";
ok("égalité : plus grand identifiant d'appareil", S.plusRecent({ t: "journal", id: "x", maj: "2026-11-24T10:00:00.000Z" }, "zzzz", e, "aaaa-1") && !S.plusRecent({ t: "journal", id: "x", maj: "2026-11-24T10:00:00.000Z" }, "0000", e, "aaaa-1"));

// Première synchronisation : la date d'une fiche ancienne est la sienne (une vraie modification récente l'emporte)
const N = appareil("nnnn-4");
N.stock.journal.set("j9", { id: "j9", quand: Date.UTC(2026, 0, 1), texte: "ancien" });
const prem = await S.calculerChangements(N.donnees(), N.etat, t(40));
ok("fiche jamais envoyée : date propre à la fiche", prem.changements[0].maj === new Date(Date.UTC(2026, 0, 1)).toISOString());

// Budget : synchronisé, jamais supprimé
const Bu = appareil("bbbb-9"); Bu.stock.budget.set(S.ID_BUDGET, { id: S.ID_BUDGET, actif: true, montant: 65000, periode: "mois" });
await cycle(Bu, t(50)); Bu.stock.budget.delete(S.ID_BUDGET);
const sb = await S.calculerChangements(Bu.donnees(), Bu.etat, t(51));
ok("le budget voyage et n'est jamais supprimé à distance", serveur.some((x) => x.c.t === "budget") && sb.changements.length === 0);

// Signature rapide
ok("signature : change quand un texte change", S.signatureTextes(["a", "b"]) !== S.signatureTextes(["a", "c"]) && S.signatureTextes(["x"]) === S.signatureTextes(["x"]));
ok("empreinte indépendante de l'ordre des champs", (await S.empreinteFiche("carnet", { id: 1, a: 1, b: 2 })) === (await S.empreinteFiche("carnet", { b: 2, id: 1, a: 1 })));
