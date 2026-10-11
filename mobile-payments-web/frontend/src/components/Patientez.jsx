// Attente longue (connexion, inscription…) : jauge circulaire transparente
// (un arc qui tourne) au centre de l'écran + toast « Patientez… » en bas,
// comme sur SAWALI. Affiché tant que `actif` est vrai.
export default function Patientez({ actif, texte = "Patientez…" }) {
  if (!actif) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-nuit-900/20" role="status" aria-live="polite">
      {/* Jauge circulaire : cercle de fond pâle + arc bleu qui tourne */}
      <svg viewBox="0 0 50 50" className="h-16 w-16 animate-spin" aria-hidden="true">
        <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="5" />
        <circle cx="25" cy="25" r="20" fill="none" stroke="#1e90ff" strokeWidth="5" strokeLinecap="round"
          strokeDasharray="90 126" />
      </svg>
      {/* Toast « Patientez… » */}
      <div className="fixed inset-x-0 bottom-6 flex justify-center px-4">
        <div className="animate-slide-up rounded-xl bg-gray-800 px-4 py-3 text-sm font-medium text-white shadow-lg">{texte}</div>
      </div>
    </div>
  );
}
