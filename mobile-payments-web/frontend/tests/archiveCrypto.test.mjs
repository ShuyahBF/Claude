// Test du chiffrement des archives (lot 92). Lancer : cd frontend && node tests/archiveCrypto.test.mjs (Node 20+, aucune installation).
// Vérifie : clé aléatoire, phrase, code de secours (saisie approximative), nouvelle phrase, ET compatibilité avec les anciennes archives (avant le lot 92).
import * as c from "../src/lib/archiveCrypto.js";
const ok=(n,v)=>{console.log((v?"OK  ":"ECHEC ")+n); if(!v) process.exitCode=1;};
// activation
const a = await c.creerPhrase("ma phrase secrète");
ok("code 8 groupes de 4", /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/.test(a.code));
const doc = await c.chiffrer(new TextEncoder().encode("passeport"));
c.verrouiller(); ok("verrouillé", !c.cleDeverrouillee());
// déverrouillage phrase
const r = await c.deverrouiller("ma phrase secrète", a.sel, a.verif, a.enveloppe);
ok("phrase ok", r.ok && !r.ancienne);
ok("document relu", new TextDecoder().decode(await c.dechiffrer(doc))==="passeport");
c.verrouiller(); ok("mauvaise phrase refusée", !(await c.deverrouiller("autre phrase", a.sel, a.verif, a.enveloppe)).ok);
// code de secours (avec erreurs de lecture)
const lu = a.code.toLowerCase().replace(/-/g," ").replace(/0/g,"o");
ok("code de secours (saisie approximative)", await c.deverrouillerAvecCode(lu, a.sel, a.verif, a.secours));
ok("document relu via code", new TextDecoder().decode(await c.dechiffrer(doc))==="passeport");
const env2 = await c.nouvelleEnveloppe("nouvelle phrase 2", a.sel);
c.verrouiller();
ok("ancienne phrase ne marche plus avec la nouvelle enveloppe", !(await c.deverrouiller("ma phrase secrète", a.sel, a.verif, env2)).ok);
ok("nouvelle phrase", (await c.deverrouiller("nouvelle phrase 2", a.sel, a.verif, env2)).ok);
ok("document toujours lisible", new TextDecoder().decode(await c.dechiffrer(doc))==="passeport");
ok("mauvais code refusé", !(await c.deverrouillerAvecCode("AAAA-AAAA", a.sel, a.verif, a.secours)));
// ancienne clé (avant lot 92) : clé = dérivée de la phrase, pas d'enveloppe
const sel = c.nouveauSel();
const enc=new TextEncoder();
const mat = await crypto.subtle.importKey("raw", enc.encode("vieille phrase".normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
const vieille = await crypto.subtle.deriveKey({name:"PBKDF2",salt:c.depuisBase64(sel),iterations:250000,hash:"SHA-256"}, mat,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const verifV = c.versBase64(await c.chiffrer(enc.encode("archives-paiement-mobile-v1"), vieille));
const docV = await c.chiffrer(enc.encode("ancien doc"), vieille);
const rv = await c.deverrouiller("vieille phrase", sel, verifV, null);
ok("ancienne clé déverrouillée, marquée ancienne", rv.ok && rv.ancienne);
ok("ancien document lisible", new TextDecoder().decode(await c.dechiffrer(docV))==="ancien doc");
const up = await c.preparerSecours("vieille phrase", sel);
c.verrouiller();
ok("après mise à niveau : phrase via enveloppe", (await c.deverrouiller("vieille phrase", sel, verifV, up.enveloppe)).ok);
ok("après mise à niveau : ancien document lisible", new TextDecoder().decode(await c.dechiffrer(docV))==="ancien doc");
c.verrouiller();
ok("après mise à niveau : code de secours", await c.deverrouillerAvecCode(up.code, sel, verifV, up.secours));
ok("après mise à niveau : ancien document lisible via code", new TextDecoder().decode(await c.dechiffrer(docV))==="ancien doc");

// ---- Lot 93 : code PIN court + poivre du serveur ----
{
  const sel = c.nouveauSel();
  const { preuve, partie } = await c.preuveEtPartie("1234", sel);
  const poivre = c.versBase64(crypto.getRandomValues(new Uint8Array(32)));
  const pin = await c.creerAvecSecret(partie, poivre, sel);
  const docPin = await c.chiffrer(new TextEncoder().encode("carte grise"));
  c.verrouiller();
  const p2 = await c.preuveEtPartie("1234", sel);
  ok("PIN : preuve identique à chaque saisie", p2.preuve === preuve && preuve.length === 44);
  ok("PIN : la preuve ne contient pas le PIN", !preuve.includes("1234"));
  ok("PIN + bon poivre ouvre", await c.deverrouillerAvecPoivre(p2.partie, poivre, pin.verif, pin.enveloppe));
  ok("document lisible", new TextDecoder().decode(await c.dechiffrer(docPin)) === "carte grise");
  c.verrouiller();
  const mauvais = await c.preuveEtPartie("1235", sel);
  ok("mauvais PIN refusé", !(await c.deverrouillerAvecPoivre(mauvais.partie, poivre, pin.verif, pin.enveloppe)));
  const autrePoivre = c.versBase64(crypto.getRandomValues(new Uint8Array(32)));
  ok("bon PIN mais mauvais poivre refusé (la base seule n'ouvre rien)", !(await c.deverrouillerAvecPoivre(p2.partie, autrePoivre, pin.verif, pin.enveloppe)));
  ok("code de secours ouvre aussi la clé", await c.deverrouillerAvecCode(pin.code, sel, pin.verif, pin.secours));
  // nouveau code après récupération : nouvelle preuve, nouveau poivre, mêmes documents
  const n = await c.preuveEtPartie("98765", sel); const poivre2 = c.versBase64(crypto.getRandomValues(new Uint8Array(32)));
  const env2 = await c.nouvelleEnveloppePin(n.partie, poivre2);
  c.verrouiller();
  ok("nouveau PIN ouvre avec le nouveau poivre", await c.deverrouillerAvecPoivre(n.partie, poivre2, pin.verif, env2));
  ok("documents inchangés après changement de PIN", new TextDecoder().decode(await c.dechiffrer(docPin)) === "carte grise");
  c.verrouiller();
  ok("ancien PIN + ancien poivre n'ouvrent plus la nouvelle enveloppe", !(await c.deverrouillerAvecPoivre(p2.partie, poivre, pin.verif, env2)));
  // mise à niveau d'une ancienne protection par phrase vers le code + poivre (sans toucher aux documents)
  const a = await c.creerPhrase("ancienne phrase v2");
  const docV2 = await c.chiffrer(new TextEncoder().encode("doc v2"));
  const up = await c.preuveEtPartie("ancienne phrase v2", a.sel);
  const envUp = await c.nouvelleEnveloppePin(up.partie, poivre);
  c.verrouiller();
  ok("mise à niveau phrase → code + poivre", await c.deverrouillerAvecPoivre(up.partie, poivre, a.verif, envUp));
  ok("document d'avant la mise à niveau lisible", new TextDecoder().decode(await c.dechiffrer(docV2)) === "doc v2");
}
