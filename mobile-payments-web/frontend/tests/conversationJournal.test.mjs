// Test de la lecture d'une conversation gardée dans le journal (partie pure).
const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const { analyserConversation, resumeConversation } = await import("../src/lib/conversationJournal.js");

const un = "[17/11/2026 01:05] Liluvine : Il se fait tard… Un peu de mal à trouver le sommeil ?\n\n[17/11/2026 01:06] Moi : Quelle heure est il?\n\n[17/11/2026 01:06] Liluvine : Je ne peux pas te dire l'heure exacte.\nMais dis-moi 🌸";
const m = analyserConversation(un);
ok("3 messages", m.length === 3);
ok("auteurs", m[0].auteur === "liluvine" && m[1].auteur === "moi" && m[2].auteur === "liluvine");
ok("heures", m[1].quand === "17/11/2026 01:06");
ok("texte du message", m[1].texte === "Quelle heure est il?");
ok("retours à la ligne gardés dans un message", m[2].texte.includes("exacte.\nMais"));

// Texte avec les sauts de ligne écrasés (affichage en une seule ligne)
const ligne = "[17/11/2026 01:05] Liluvine : Bonjour [17/11/2026 01:06] Moi : Salut [17/11/2026 01:07] Liluvine : Comment vas-tu ?";
ok("sauts de ligne écrasés", analyserConversation(ligne).length === 3);

// Un texte libre n'est pas un chat
ok("texte libre", analyserConversation("Aujourd'hui j'ai bien dormi.") === null);
ok("crochets sans motif", analyserConversation("[Note] Moi : test") === null);
ok("texte avant la conversation", analyserConversation("Mon avis : [17/11/2026 01:05] Moi : x") === null);
ok("vide", analyserConversation("") === null && analyserConversation(null) === null);
ok("résumé", resumeConversation(m) === "3 messages" && resumeConversation(m.slice(0, 1)) === "1 message");
