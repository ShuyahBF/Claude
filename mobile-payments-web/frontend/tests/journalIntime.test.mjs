// Test du journal intime (logique pure : chiffrement, accords, filtres). Lancer : cd frontend && node tests/journalIntime.test.mjs (Node 20+). Données FICTIVES.
import { MENTIONS, VERSION_MENTIONS, accordDonne, dateAccord, donnerAccord, retirerAccord, nouvelleCle, chiffrer, dechiffrer, chargerEntrees, enregistrerEntree, supprimerEntree, toutEffacer, filtrerEntrees, echangesPourLiluvine } from "../src/lib/journalIntime.js";
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const faux = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// --- Mentions et accords : rien n'est approuvé tant que l'utilisateur ne l'a pas fait lui-même
const st = faux();
ok("mentions : 3 pour le journal, 4 pour Liluvine", MENTIONS.journal.length === 3 && MENTIONS.liluvine.length === 4);
ok("aucun accord au départ", !accordDonne("journal", st) && !accordDonne("liluvine", st));
ok("accord du journal seul", donnerAccord("journal", st, new Date("2026-11-15T10:00:00Z")) && accordDonne("journal", st) && !accordDonne("liluvine", st) && dateAccord("journal", st) === "2026-11-15T10:00:00.000Z");
st.setItem("mpw_journal_accord_liluvine", JSON.stringify({ version: "0", le: "2026-01-01" }));
ok("accord d'une ancienne version : à redonner", !accordDonne("liluvine", st) && dateAccord("liluvine", st) === null);
ok("retrait de l'accord", retirerAccord("journal", st) && !accordDonne("journal", st));
ok("version des mentions = 1 (même valeur que le serveur)", VERSION_MENTIONS === "1");

// --- Chiffrement : aller-retour, clé différente, altération
const cle = await nouvelleCle(), autre = await nouvelleCle();
const paquet = await chiffrer(cle, { texte: "Je doute de mon mariage", humeur: "inquiet", quand: 1 });
ok("le texte n'apparaît pas en clair", !JSON.stringify(paquet).includes("mariage") && paquet.iv && paquet.d);
ok("aller-retour", (await dechiffrer(cle, paquet)).texte === "Je doute de mon mariage");
ok("autre clé : illisible", (await dechiffrer(autre, paquet)) === null);
ok("donnée altérée : illisible", (await dechiffrer(cle, { ...paquet, d: paquet.d.slice(0, -4) + "AAAA" })) === null);
const p2 = await chiffrer(cle, { texte: "Je doute de mon mariage", humeur: "inquiet", quand: 1 });
ok("vecteur différent à chaque chiffrement", p2.iv !== paquet.iv && p2.d !== paquet.d);

// --- Entrées : enregistrer, relire, modifier, filtrer, supprimer, tout effacer
const s2 = faux();
const T = (j) => new Date(`2026-11-${j}T12:00:00`).getTime();
const a = await enregistrerEntree(cle, { quand: T("10"), humeur: "joyeux", texte: "Belle journée au marché, j'ai vendu tous mes légumes." }, s2);
const b = await enregistrerEntree(cle, { quand: T("12"), humeur: "triste", texte: "Une dispute avec ma sœur." }, s2);
let lues = await chargerEntrees(cle, s2);
ok("deux entrées, les plus récentes d'abord", lues.length === 2 && lues[0].id === b && lues[1].id === a);
ok("stockage chiffré", !(s2.getItem("mpw_journal_entrees") || "").includes("marché") && !(s2.getItem("mpw_journal_entrees") || "").includes("sœur"));
await enregistrerEntree(cle, { id: a, quand: T("10"), humeur: "serein", texte: "Belle journée au marché, très calme." }, s2);
lues = await chargerEntrees(cle, s2);
ok("modification sans doublon", lues.length === 2 && lues.find((e) => e.id === a).humeur === "serein");
ok("filtre texte sans accents", filtrerEntrees(lues, { texte: "SOEUR" }).length === 0 && filtrerEntrees(lues, { texte: "soeur".replace("oe", "œ") }).length === 1 && filtrerEntrees(lues, { texte: "marche" }).length === 1);
ok("filtre humeur et dates", filtrerEntrees(lues, { humeur: "triste" }).length === 1 && filtrerEntrees(lues, { du: "2026-11-11" }).length === 1 && filtrerEntrees(lues, { au: "2026-11-10" }).length === 1);
ok("clé différente : entrées illisibles, pas de plantage", (await chargerEntrees(autre, s2)).length === 0);
supprimerEntree(a, s2);
ok("suppression d'une entrée", (await chargerEntrees(cle, s2)).length === 1);
toutEffacer(s2);
ok("tout effacer", (await chargerEntrees(cle, s2)).length === 0);

// --- Échanges envoyés à Liluvine
const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
const e = echangesPourLiluvine([...long, { role: "user", content: "x".repeat(5000) }]);
ok("16 au plus, commence et finit par l'utilisateur, texte borné", e.length <= 16 && e[0].role === "user" && e[e.length - 1].role === "user" && e[e.length - 1].content.length === 2000);
ok("dernier message de Liluvine : rien à envoyer", echangesPourLiluvine([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]).length === 0);
ok("messages vides ignorés", echangesPourLiluvine([{ role: "user", content: "  " }]).length === 0);

// --- Un téléphone, plusieurs comptes : chaque compte a son journal et ses accords
import { pourUtilisateur } from "../src/lib/journalIntime.js";
const s3 = faux();
pourUtilisateur("compte-A");
await enregistrerEntree(cle, { quand: 5, humeur: "joyeux", texte: "Journal du compte A" }, s3);
donnerAccord("journal", s3);
pourUtilisateur("compte-B");
ok("autre compte : ni accord ni entrées du compte A", !accordDonne("journal", s3) && (await chargerEntrees(cle, s3)).length === 0);
pourUtilisateur("compte-A");
ok("retour au compte A : accord et entrées retrouvés", accordDonne("journal", s3) && (await chargerEntrees(cle, s3)).length === 1);
pourUtilisateur("");
