// Calculette de montant (lot 218) : sert à calculer ou estimer un montant (ex. 4 500 × 4 + 2 000), puis « Valider » renvoie le résultat
// (entier, en FCFA) au champ qui l'a ouverte. Clavier tactile + saisie au clavier ; résultat affiché en direct. Calcul sûr : lib/calcul.js (pas d'eval).
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { evaluer, montantEntier } from "@/lib/calcul";

const TOUCHES = [["7", "8", "9", "÷"], ["4", "5", "6", "×"], ["1", "2", "3", "−"], ["0", "000", ",", "+"], ["(", ")", "%", "⌫"]];

export default function CalculetteMontant({ ouvert, initial = "", titre = "Calculette", onValider, onFermer }) {
  const [expr, setExpr] = useState("");
  useEffect(() => { if (ouvert) setExpr(initial ? String(initial) : ""); }, [ouvert, initial]);
  const resultat = evaluer(expr);
  const entier = montantEntier(expr);
  const toucher = (t) => setExpr((e) => (t === "⌫" ? e.slice(0, -1) : e + t));
  return (
    <Modal ouvert={ouvert} titre={`🧮 ${titre}`} onFermer={onFermer}>
      <div className="space-y-3" data-testid="calculette">
        <input className="input text-right text-lg tabular-nums" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="Ex. : 4500 × 4 + 2000" aria-label="Opération" autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && entier !== null) { e.preventDefault(); onValider(entier); } }} />
        <p className="text-right text-2xl font-bold tabular-nums" aria-live="polite">
          {resultat === null ? <span className="text-base font-normal text-gray-400">{expr ? "…" : "0"}</span> : <>= {resultat.toLocaleString("fr-FR")} <span className="text-sm font-normal text-gray-500">FCFA</span></>}
        </p>
        {resultat !== null && entier === null && <p className="text-right text-xs text-red-700">Un montant ne peut pas être négatif.</p>}
        <div className="grid grid-cols-4 gap-2">
          {TOUCHES.flat().map((t) => (
            <button key={t} type="button" onClick={() => toucher(t)} aria-label={t === "⌫" ? "Effacer le dernier caractère" : t}
              className={`rounded-xl border py-3 text-lg font-semibold ${"÷×−+".includes(t) ? "border-primary bg-primary/10 text-primary" : "border-gray-300 bg-white"}`}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={entier === null} onClick={() => onValider(entier)}>✅ Valider {entier !== null && <span className="tabular-nums">({entier.toLocaleString("fr-FR")})</span>}</button>
          <button type="button" className="btn-secondary" onClick={() => setExpr("")}>🧹 Effacer</button>
          <button type="button" className="btn-secondary" onClick={onFermer}>✖ Annuler</button>
        </div>
      </div>
    </Modal>
  );
}
