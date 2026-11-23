// Test de la copie de sécurité en fichier (partie pure : nom, en-tête, lecture du texte). Node 20+. Données FICTIVES.
const { register } = await import("node:module");
const charge = `
export async function resolve(s, c, n) { if (s === "@/lib/api") return { url: "data:text/javascript,export const apiClient={}", shortCircuit: true };
  if (s.startsWith("@/lib/")) return { url: new URL("../src/lib/" + s.slice(6) + ".js", "${import.meta.url}").href, shortCircuit: true }; return n(s, c); }`;
register("data:text/javascript," + encodeURIComponent(charge), import.meta.url);
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const C = await import("../src/lib/copieLocale.js");
ok("nom du fichier daté", C.nomFichier(new Date(2026, 10, 23, 9, 5)) === "auror-2026-11-23-0905.aursauv");
ok("en-tête + contenu", C.texteFichier("ABC") === "AURSAUV1\nABC" && C.contenuDuTexte("AURSAUV1\nABC\n") === "ABC");
let erreur = ""; try { C.contenuDuTexte("n'importe quoi"); } catch (e) { erreur = e.message; }
ok("un autre fichier est refusé avec un message clair", erreur.startsWith("Ce fichier n'est pas une copie"));
erreur = ""; try { C.contenuDuTexte("AURSAUV1\n   "); } catch (e) { erreur = e.message; }
ok("une copie vide est refusée", erreur.startsWith("Cette copie"));
