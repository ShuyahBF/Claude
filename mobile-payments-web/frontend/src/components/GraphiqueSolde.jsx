// Évolution du solde sur la période du budget (lot 218) : courbe du SOLDE TOTAL (tous portefeuilles) et repérage des ENTRÉES D'ARGENT.
// Le solde vient des soldes annoncés par les SMS des opérateurs (lib/budget.js : serieSolde). Dessin en SVG, sans bibliothèque.
// Les entrées (paiements reçus) sont des points verts ; la liste en dessous donne date, origine et montant. Jamais la couleur seule : légende écrite.
import { serieSolde } from "@/lib/budget";

const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
const jourCourt = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const heure = (ms) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default function GraphiqueSolde({ lignes, debut, fin = Date.now() }) {
  const { points, entrees, aSolde } = serieSolde(lignes, debut, fin);
  const L = 320, H = 150, G = 36, D = 8, HAUT = 10, BAS = 22;                 // zone de dessin : marges gauche / droite / haut / bas
  const pts = aSolde ? [...points, { t: Math.min(fin, Math.max(points.at(-1).t, fin)), total: points.at(-1).total }] : [];   // la courbe se prolonge jusqu'à maintenant
  const mini = aSolde ? Math.min(...pts.map((p) => p.total)) : 0, maxi = aSolde ? Math.max(...pts.map((p) => p.total)) : 1;
  const plage = Math.max(1, maxi - mini);
  const x = (t) => G + ((t - debut) / Math.max(1, fin - debut)) * (L - G - D);
  const y = (v) => HAUT + (1 - (v - mini) / plage) * (H - HAUT - BAS);
  // Courbe en marches : le solde reste le même jusqu'à l'opération suivante
  const chemin = pts.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p.total)}` : `H${x(p.t)}V${y(p.total)}`)).join(" ");
  // Point de solde à la date d'une entrée (pour y poser le repère vert)
  const soldeA = (t) => { let v = pts[0]?.total ?? 0; for (const p of pts) { if (p.t <= t) v = p.total; else break; } return v; };
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-3" data-testid="graphique-solde">
      <h3 className="font-semibold">📈 Évolution de mon solde sur la période</h3>
      {!aSolde ? (
        <p className="text-sm text-gray-600">Pas encore de solde sur cette période : il se lit dans les SMS de vos opérateurs (« nouveau solde… »). Lisez vos SMS pour voir la courbe.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" aria-label={`Solde total de ${fcfa(pts[0].total)} à ${fcfa(pts.at(-1).total)}, ${entrees.length} entrée(s) d'argent`}>
            <line x1={G} y1={y(mini)} x2={L - D} y2={y(mini)} stroke="#cbd5e1" strokeWidth="1" />
            <line x1={G} y1={y(maxi)} x2={L - D} y2={y(maxi)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
            <text x={G - 3} y={y(maxi) + 3} fontSize="8" textAnchor="end" fill="#475569">{Math.round(maxi / 1000)}k</text>
            <text x={G - 3} y={y(mini) + 3} fontSize="8" textAnchor="end" fill="#475569">{Math.round(mini / 1000)}k</text>
            <text x={G} y={H - 6} fontSize="8" fill="#475569">{jourCourt(debut)}</text>
            <text x={L - D} y={H - 6} fontSize="8" textAnchor="end" fill="#475569">{jourCourt(fin)}</text>
            <path d={chemin} fill="none" stroke="#0f1d3d" strokeWidth="2" strokeLinejoin="round" />
            {entrees.map((e) => <circle key={e.id} cx={x(e.quand)} cy={y(soldeA(e.quand))} r="4.5" fill="#16a34a" stroke="#fff" strokeWidth="1.5"><title>{`Entrée de ${fcfa(e.montant)} le ${heure(e.quand)}`}</title></circle>)}
          </svg>
          <p className="flex flex-wrap gap-x-4 text-xs text-gray-600"><span>━ Solde total (tous portefeuilles)</span><span><span className="text-green-600">●</span> Entrée d'argent</span></p>
          <p className="text-sm">Solde : <b className="tabular-nums">{fcfa(pts[0].total)}</b> au début → <b className="tabular-nums">{fcfa(pts.at(-1).total)}</b> maintenant (<span className={pts.at(-1).total >= pts[0].total ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{pts.at(-1).total >= pts[0].total ? "↑ +" : "↓ −"}{fcfa(Math.abs(pts.at(-1).total - pts[0].total))}</span>)</p>
        </>
      )}
      {entrees.length > 0 ? (
        <div className="space-y-1" data-testid="entrees-argent">
          <p className="text-sm font-semibold text-green-800">↓ {entrees.length} entrée(s) d'argent sur la période : <span className="tabular-nums">{fcfa(entrees.reduce((t, e) => t + e.montant, 0))}</span></p>
          <ul className="space-y-0.5 text-xs">
            {entrees.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2"><span>{heure(e.quand)} · {e.adresse}{e.tiers ? ` · ${e.tiers}` : ""}</span><b className="tabular-nums text-green-700">+ {fcfa(e.montant)}</b></li>)}
          </ul>
        </div>
      ) : <p className="text-xs text-gray-500">Aucune entrée d'argent détectée sur cette période.</p>}
    </div>
  );
}
