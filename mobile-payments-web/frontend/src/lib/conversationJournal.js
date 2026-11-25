// ============================================================================
// Conversation avec Liluvine gardée dans le journal (web 175, propriétaire 25/11/2026 : « afficher ça sous forme de chat bien formaté et présenté »).
// « Garder dans mon journal » enregistre la conversation en UN texte : « [17/11/2026 01:05] Liluvine : … [17/11/2026 01:06] Moi : … ».
// `analyserConversation` relit ce texte et rend la liste des messages { quand, auteur ("moi" | "liluvine"), texte } ; rend null si l'entrée n'est PAS une conversation
// (un texte libre de l'utilisateur ne doit jamais être pris pour un chat). Fonction pure, testée (tests/conversationJournal.test.mjs).
// ============================================================================
const MOTIF = /\[(\d{1,2}\/\d{1,2}\/\d{2,4})[ ,]+(\d{1,2}[:h]\d{2})\]\s*(Moi|Liluvine)\s*:\s*/gi;

export function analyserConversation(texte) {
  const brut = String(texte || "");
  if (!brut.trimStart().startsWith("[")) return null;
  const reperes = [...brut.matchAll(MOTIF)];
  if (reperes.length === 0 || reperes[0].index !== brut.length - brut.trimStart().length) return null;
  return reperes.map((m, i) => {
    const fin = i + 1 < reperes.length ? reperes[i + 1].index : brut.length;
    return { quand: `${m[1]} ${m[2].replace("h", ":")}`, auteur: m[3].toLowerCase() === "moi" ? "moi" : "liluvine", texte: brut.slice(m.index + m[0].length, fin).trim() };
  }).filter((m) => m.texte);
}

/** Résumé court pour l'en-tête repliable : « 6 messages · du 17/11/2026 01:05 au 17/11/2026 01:09 ». */
export function resumeConversation(messages) {
  if (!messages?.length) return "";
  const n = messages.length;
  return `${n} message${n > 1 ? "s" : ""}`;
}
