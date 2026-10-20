// Courbe d'évolution des deux portefeuilles (lot 86) : solde de FIN DE JOURNÉE de l'électronique (trait plein bleu) et du personnel
// (traits tirés vert) — deux styles de trait, pas seulement deux couleurs. Dessinée en SVG (aucune bibliothèque). Toucher ou survoler
// la courbe affiche les soldes du jour visé. Les jours sans relevé (avant le premier) ne sont pas tracés.
import { useMemo, useState } from "react";
import { fcfa } from "@/lib/api";

const L = 640, H = 240, MG = { g: 62, d: 14, h: 14, b: 30 };           // largeur, hauteur, marges (gauche, droite, haut, bas)
const SERIES = [
  { cle: "electronique", nom: "Électronique", couleur: "#006bf7", trait: undefined },
  { cle: "personnel", nom: "Personnel", couleur: "#0ba957", trait: "7 5" },
];
const jourCourt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
// Arrondi lisible des graduations : 12 345 → « 12 k », 1 250 000 → « 1,3 M »
const court = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)} k` : String(Math.round(n)));

export default function GraphePortefeuilles({ serie }) {
  const [survol, setSurvol] = useState(null);                        // indice du jour visé
  const g = useMemo(() => {
    const valeurs = serie.flatMap((p) => SERIES.map((s) => p[s.cle]).filter((v) => v !== null && v !== undefined));
    if (serie.length < 2 || valeurs.length === 0) return null;
    // Échelle à graduations rondes (1, 2, 5 × 10ⁿ) : 0, 20 k, 40 k… plutôt que 23 k, 60 k, 97 k
    let min = Math.min(0, ...valeurs), max = Math.max(...valeurs);
    if (max === min) max = min + 1;
    const brut = (max - min) / 3, puissance = 10 ** Math.floor(Math.log10(brut));
    const pas = [1, 2, 5, 10].map((f) => f * puissance).find((v) => v >= brut);
    min = Math.floor(min / pas) * pas;
    max = Math.ceil(max / pas) * pas;
    const nb = Math.round((max - min) / pas);
    const x = (i) => MG.g + (i / (serie.length - 1)) * (L - MG.g - MG.d);
    const y = (v) => MG.h + (1 - (v - min) / (max - min)) * (H - MG.h - MG.b);
    // Un tracé par série ; un jour sans valeur interrompt le trait (nouvelle commande « M »)
    const trace = (cle) => {
      let d = "", coupe = true;
      serie.forEach((p, i) => {
        const v = p[cle];
        if (v === null || v === undefined) { coupe = true; return; }
        d += `${coupe ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        coupe = false;
      });
      return d;
    };
    const tracés = SERIES.map((s) => ({ ...s, d: trace(s.cle) }));
    const graduations = Array.from({ length: nb + 1 }, (_, k) => min + pas * k);
    return { x, y, tracés, graduations };
  }, [serie]);

  if (!g) return <p className="text-sm text-gray-500">La courbe apparaît dès le deuxième jour de suivi : indiquez vos soldes d'aujourd'hui, puis revenez demain.</p>;

  const viser = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    setSurvol(Math.max(0, Math.min(serie.length - 1, Math.round(((px - MG.g) / (L - MG.g - MG.d)) * (serie.length - 1)))));
  };
  const point = serie[survol ?? serie.length - 1];
  const dernier = serie[serie.length - 1];
  return (
    <figure data-testid="graphe-portefeuilles">
      <figcaption className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold">{jourCourt(point.jour)}</span>
        {SERIES.map((s) => (
          <span key={s.cle} className="flex items-center gap-1">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={s.couleur} strokeWidth="3" strokeDasharray={s.trait} /></svg>
            {s.nom} : <b className="tabular-nums">{point[s.cle] === null || point[s.cle] === undefined ? "—" : fcfa(point[s.cle])}</b>
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full touch-pan-y select-none" role="img"
        aria-label={`Évolution des portefeuilles du ${jourCourt(serie[0].jour)} au ${jourCourt(dernier.jour)} : électronique ${dernier.electronique === null ? "non renseigné" : fcfa(dernier.electronique)}, personnel ${dernier.personnel === null ? "non renseigné" : fcfa(dernier.personnel)}`}
        onPointerMove={viser} onPointerDown={viser} onPointerLeave={() => setSurvol(null)}>
        {g.graduations.map((v) => (
          <g key={v}>
            <line x1={MG.g} x2={L - MG.d} y1={g.y(v)} y2={g.y(v)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={MG.g - 6} y={g.y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{court(v)}</text>
          </g>
        ))}
        {[0, Math.floor((serie.length - 1) / 2), serie.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={g.x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"} fontSize="11" fill="#64748b">{jourCourt(serie[i].jour)}</text>
        ))}
        {g.tracés.map((s) => <path key={s.cle} d={s.d} fill="none" stroke={s.couleur} strokeWidth="2.5" strokeDasharray={s.trait} strokeLinejoin="round" strokeLinecap="round" />)}
        {survol !== null && (
          <g>
            <line x1={g.x(survol)} x2={g.x(survol)} y1={MG.h} y2={H - MG.b} stroke="#94a3b8" strokeWidth="1" />
            {SERIES.map((s) => serie[survol][s.cle] !== null && serie[survol][s.cle] !== undefined && <circle key={s.cle} cx={g.x(survol)} cy={g.y(serie[survol][s.cle])} r="4.5" fill="#fff" stroke={s.couleur} strokeWidth="2.5" />)}
          </g>
        )}
      </svg>
    </figure>
  );
}
