// Recherche plein texte dans les rubriques de dépense (lot 218) : un mot (ou plusieurs) cherché dans les rubriques, catégories, motifs, détails,
// bénéficiaires et opérateurs de TOUS les SMS ; le résultat est un tableau : SMS (opérateur), date et heure, intitulé, catégorie, montant.
// Colonnes triables (▲ ▼), totaux collés dessous ; un clic sur une ligne ouvre les détails du SMS. Tout se passe sur le téléphone.
import { useMemo, useState } from "react";
import { rechercherRubriques } from "@/lib/budget";

const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")}`;
const COLONNES = [["adresse", "SMS"], ["quand", "Date et heure"], ["intitule", "Intitulé"], ["categorie", "Catégorie"], ["montant", "Montant"]];

export default function RechercheRubriques({ lignes, onOuvrir }) {
  const [texte, setTexte] = useState("");
  const [tri, setTri] = useState({ cle: "quand", sens: -1 });          // plus récent d'abord
  const trouvees = useMemo(() => rechercherRubriques(lignes, texte), [lignes, texte]);
  const triees = useMemo(() => {
    const { cle, sens } = tri;
    return [...trouvees].sort((a, b) => {
      const va = a[cle], vb = b[cle];
      if (!va && va !== 0) return 1;                                      // les valeurs vides restent toujours en dernier
      if (!vb && vb !== 0) return -1;
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "fr", { sensitivity: "base" })) * sens;
    });
  }, [trouvees, tri]);
  const changerTri = (cle) => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: 1 }));
  const total = trouvees.reduce((t, r) => t + r.montant, 0);
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-3" data-testid="recherche-rubriques">
      <label className="label" htmlFor="rech-rubriques">🔎 Rechercher dans mes dépenses détaillées</label>
      <input id="rech-rubriques" type="search" className="input" placeholder="Ex. : riz, pharmacie, transport…" value={texte} onChange={(e) => setTexte(e.target.value)} />
      {texte.trim() && trouvees.length === 0 && <p className="text-sm text-gray-600">Aucune rubrique ne correspond. Ajoutez des détails à vos dépenses avec le bouton « 📝 Détails » d'une ligne.</p>}
      {trouvees.length > 0 && (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[30rem] text-xs">
            <thead className="sticky top-0 bg-white"><tr className="text-left text-gray-600">
              {COLONNES.map(([cle, lib]) => (
                <th key={cle} className={`p-1 ${cle === "montant" ? "text-right" : ""}`}>
                  <button type="button" onClick={() => changerTri(cle)} className={`font-semibold ${tri.cle === cle ? "text-orange-600" : ""}`} aria-label={`Trier par ${lib}`}>
                    {lib} {tri.cle === cle ? (tri.sens === 1 ? "▲" : "▼") : <span className="text-gray-400">⇅</span>}</button></th>
              ))}
            </tr></thead>
            <tbody>
              {triees.map((r, i) => (
                <tr key={`${r.id}-${i}`} className="cursor-pointer border-t hover:bg-sky-100/50" onClick={() => onOuvrir?.(r.id)} title="Ouvrir les détails de ce SMS">
                  <td className="p-1 font-semibold text-nuit-900">{r.adresse}<span className="block font-normal text-gray-500">SMS de {fcfa(r.montantSms)}</span></td>
                  <td className="p-1 whitespace-nowrap">{new Date(r.quand).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-1 font-semibold text-blue-800">{r.intitule}</td>
                  <td className="p-1">{r.categorie || "—"}</td>
                  <td className="p-1 text-right font-bold tabular-nums text-red-700">{fcfa(r.montant)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white"><tr className="border-t-2 font-bold"><td className="p-1" colSpan={4}>{trouvees.length} résultat(s)</td><td className="p-1 text-right tabular-nums" data-testid="total-recherche">{fcfa(total)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
