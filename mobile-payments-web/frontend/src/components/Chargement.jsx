// Indicateur de chargement (cercle qui tourne)
export default function Chargement({ texte = "Chargement…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
      {texte}
    </div>
  );
}
