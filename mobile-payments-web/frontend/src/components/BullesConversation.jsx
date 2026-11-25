// ============================================================================
// Conversation avec Liluvine présentée comme un CHAT (web 175, propriétaire 25/11/2026) : les messages de Liluvine à gauche (bulle bleu clair, petite fleur),
// les miens à droite (bulle bleue pleine), l'heure sous chaque bulle ; le texte garde ses retours à la ligne. Lecture seule.
// ============================================================================
export default function BullesConversation({ messages }) {
  return (
    <ol className="space-y-3 rounded-2xl bg-gray-50 p-3" data-testid="bulles-conversation" aria-label="Conversation avec Liluvine">
      {messages.map((m, i) => {
        const moi = m.auteur === "moi";
        return (
          <li key={i} className={`flex items-end gap-2 ${moi ? "justify-end" : "justify-start"}`}>
            {!moi && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pink-100 text-sm" aria-hidden="true">🌸</span>}
            <div className={`max-w-[82%] ${moi ? "text-right" : "text-left"}`}>
              <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm leading-relaxed ${moi ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-sky-100 text-gray-900"}`}>
                <span className="sr-only">{moi ? "Moi : " : "Liluvine : "}</span>{m.texte}
              </p>
              <span className="mt-0.5 block text-[11px] text-gray-500">{moi ? "Moi" : "Liluvine"} · {m.quand}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
