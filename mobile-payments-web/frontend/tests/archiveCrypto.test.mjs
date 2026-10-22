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
