import { useMemo, useState } from "react";
import { sensSuivant, trierLignes } from "../lib/tri.js";

// Tableau commun : toutes les colonnes de données triables (règle 19), défilement au-delà de 30 lignes (règle 24),
// nombres alignés à droite. colonnes = [{ titre, valeur: (ligne) => …, rendu?: (ligne) => JSX, nombre?, action? }]
export default function Tableau({ colonnes, lignes, vide = "Aucune donnée.", onClic }) {
  const [tri, setTri] = useState({ i: null, sens: null });
  const affichees = useMemo(() => (tri.i === null ? lignes : trierLignes(lignes, colonnes[tri.i].valeur, tri.sens)), [lignes, colonnes, tri]);
  const clic = (i) => setTri({ i, sens: tri.i === i ? sensSuivant(tri.sens) : "asc" });
  if (!lignes.length) return <p className="vide">{vide}</p>;
  return (
    <div className={`cadre-tableau ${lignes.length > 30 ? "defile" : ""}`}>
      <table>
        <thead><tr>{colonnes.map((c, i) => c.action
          ? <th key={i}>{c.titre}</th>
          : <th key={i} className={`triable ${c.nombre ? "nombre" : ""} ${tri.i === i && tri.sens ? "actif" : ""}`} onClick={() => clic(i)}>
              {c.titre} <span aria-hidden>{tri.i === i && tri.sens ? (tri.sens === "asc" ? "▲" : "▼") : "⇅"}</span></th>)}</tr></thead>
        <tbody>{affichees.map((l, k) => (
          <tr key={l.id || k} onClick={onClic ? () => onClic(l) : undefined} className={onClic ? "cliquable" : ""}>
            {colonnes.map((c, i) => <td key={i} className={c.nombre ? "nombre" : ""}>{c.rendu ? c.rendu(l) : (c.valeur(l) ?? "—")}</td>)}
          </tr>))}</tbody>
      </table>
    </div>
  );
}
