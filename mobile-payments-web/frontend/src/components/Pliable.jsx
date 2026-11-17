import { useState } from "react";

// Bloc repliable : REPLIÉ à l'affichage de la page (règle du propriétaire, 17/11/2026), un clic sur le titre le déplie.
// Le contenu n'est construit qu'à la première ouverture (la page se charge plus vite), puis gardé.
export default function Pliable({ titre, pictogramme = "", resume = null, ouvertAuDepart = false, children, testid }) {
  const [ouvert, setOuvert] = useState(ouvertAuDepart);
  const [vu, setVu] = useState(ouvertAuDepart);
  const basculer = () => { setOuvert((o) => !o); setVu(true); };
  return (
    <section className="card p-0" data-testid={testid}>
      <button type="button" onClick={basculer} aria-expanded={ouvert}
        className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="text-lg font-bold">{pictogramme} {titre}</span>
        {resume && <span className="text-sm font-normal text-gray-500">{resume}</span>}
        <span className="ml-auto text-gray-500" aria-hidden="true">{ouvert ? "▲" : "▼"}</span>
        <span className="sr-only">{ouvert ? "Replier" : "Déplier"}</span>
      </button>
      {/* Masqué (et non démonté) après la première ouverture : un graphique ne se recalcule pas à chaque clic */}
      {vu && <div className={`space-y-3 border-t border-gray-100 p-4 ${ouvert ? "" : "hidden"}`}>{children}</div>}
    </section>
  );
}
