// Camembert (lot 98 — auRor) : répartition des bénéficiaires d'un opérateur, en montant. Dessiné en SVG (aucune bibliothèque).
// parts = [{ libelle, montant, nombre }], total = somme des montants. Les couleurs sont des teintes d'une même famille (celle de l'opérateur)
// avec un ordre de luminosité distinct, et la légende donne le nom, le montant et le pourcentage : le graphique ne dépend jamais de la couleur seule.
import { fcfa } from "@/lib/api";

const R = 70, C = 80;                                              // rayon et centre du disque (zone 160 × 160)
// Palette de 7 teintes bien distinctes (6 bénéficiaires + « Autres » en gris)
const COULEURS = ["#2563eb", "#f97316", "#16a34a", "#9333ea", "#e11d48", "#0891b2", "#94a3b8"];

// Chemin SVG d'une part : de l'angle a0 à l'angle a1 (en radians, départ en haut, sens horaire)
function chemin(a0, a1) {
  const p = (a) => [C + R * Math.sin(a), C - R * Math.cos(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

export default function Camembert({ parts, total, titre }) {
  if (!parts?.length || !total) return null;
  let angle = 0;
  const tranches = parts.map((p, i) => {
    const part = p.montant / total;
    const a0 = angle;
    angle += part * 2 * Math.PI;
    return { ...p, part, a0, a1: angle, couleur: p.libelle.startsWith("Autres") ? COULEURS[6] : COULEURS[i % 6] };
  });
  return (
    <div className="space-y-2" data-testid="camembert">
      <svg viewBox="0 0 160 160" className="mx-auto h-40 w-40" role="img" aria-label={`${titre} : ${tranches.map((t) => `${t.libelle} ${Math.round(t.part * 100)} %`).join(", ")}`}>
        {tranches.length === 1
          ? <circle cx={C} cy={C} r={R} fill={tranches[0].couleur} />
          : tranches.map((t) => <path key={t.libelle} d={chemin(t.a0, t.a1)} fill={t.couleur} stroke="#fff" strokeWidth="1.5"><title>{`${t.libelle} : ${fcfa(t.montant)} (${Math.round(t.part * 100)} %)`}</title></path>)}
      </svg>
      <table className="w-full text-xs">
        <tbody>
          {tranches.map((t) => (
            <tr key={t.libelle}>
              <td className="py-0.5 pr-2"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: t.couleur }} />{t.libelle}</td>
              <td className="whitespace-nowrap py-0.5 text-right tabular-nums">{fcfa(t.montant)}</td>
              <td className="w-10 py-0.5 text-right tabular-nums text-gray-500">{Math.round(t.part * 100)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
