import { operateurBf } from "@/lib/operateurs";

// Petite pastille « Orange » / « Moov » / « Telecel » à côté d'un numéro burkinabè (lot 57, comme sur ZandGo). Rien pour un numéro étranger ou mal formé.
// Utilisation : <PastilleOperateur telephone="+22607332313" />
const STYLES = {
  Orange: "bg-orange-50 text-orange-700 ring-orange-200",
  Moov: "bg-sky-50 text-sky-800 ring-sky-200",
  Telecel: "bg-violet-50 text-violet-800 ring-violet-200",
};

export default function PastilleOperateur({ telephone, className = "" }) {
  const op = operateurBf(telephone);
  if (!op) return null;
  return (
    <span title={`Réseau ${op}`} className={`ml-1 inline-flex items-center rounded-full px-1.5 py-px align-middle text-[0.65rem] font-bold leading-4 ring-1 ${STYLES[op]} ${className}`}>{op}</span>
  );
}
