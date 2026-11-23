// Niveau du budget (lot 217) : barre de progression + phrase claire, avec ou sans le paiement qu'on s'apprête à faire.
// Affiché au-dessus du bouton de paiement (Payer.jsx), dans la fenêtre d'alerte de dépassement et dans le Profil.
// Jamais la couleur seule : un pictogramme et un texte disent aussi l'état (règle d'accessibilité du propriétaire).
import { libellePeriode } from "@/lib/budget";

const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
const STYLES = {
  ok: { fond: "bg-green-50 border-green-200 text-green-900", barre: "bg-green-600", icone: "✅" },
  attention: { fond: "bg-amber-50 border-amber-300 text-amber-900", barre: "bg-amber-500", icone: "⚠️" },
  depasse: { fond: "bg-red-50 border-red-300 text-red-900", barre: "bg-red-600", icone: "⛔" },
};

/** `n` = résultat de niveauBudget() (non nul). `detail` : montre aussi la part de chaque portefeuille (opérateur). */
export default function NiveauBudget({ n, detail = false }) {
  if (!n) return null;
  const s = STYLES[n.niveau];
  const p = libellePeriode(n.periode);
  const largeur = Math.min(100, n.pctApres);
  return (
    <div className={`space-y-2 rounded-xl border p-3 text-sm ${s.fond}`} data-testid="niveau-budget" role="status">
      <p className="font-semibold">
        {s.icone} Budget {p.libelle.replace("par ", "")} : <span className="tabular-nums">{fcfa(n.depense)}</span> dépensés sur <span className="tabular-nums">{fcfa(n.montant)}</span> ({n.pct} %)
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/70" aria-hidden="true"><div className={`h-full ${s.barre}`} style={{ width: `${largeur}%` }} /></div>
      {n.prepare > 0 ? (
        <p>Avec ce paiement de <b className="tabular-nums">{fcfa(n.prepare)}</b> : <b className="tabular-nums">{fcfa(n.apres)}</b> ({n.pctApres} %)
          {n.depasse ? <> — <b>dépassement de {fcfa(n.exces)}</b>.</> : <> — il vous resterait <b className="tabular-nums">{fcfa(n.montant - n.apres)}</b>.</>}</p>
      ) : (
        <p>{n.deja ? <b>Budget dépassé de {fcfa(n.depense - n.montant)}.</b> : <>Il vous reste <b className="tabular-nums">{fcfa(n.reste)}</b> {p.court}.</>}</p>
      )}
      {/* Limites par bénéficiaire (lot 220) : une barre par bénéficiaire qui a sa limite ; celui du paiement préparé montre l'effet de ce paiement */}
      {n.beneficiaires?.length > 0 && (
        <ul className="space-y-1.5 border-t border-black/10 pt-2 text-xs" data-testid="budget-beneficiaires">
          {n.beneficiaires.map((x) => (
            <li key={x.libelle} className={x.depasse || x.deja ? "font-semibold text-red-800" : ""}>
              <div className="flex flex-wrap justify-between gap-2"><span>{STYLES[x.niveau].icone} 👤 {x.libelle}</span>
                <span className="tabular-nums">{fcfa(x.prepare > 0 ? x.apres : x.depense)} / {fcfa(x.montant)} ({x.prepare > 0 ? x.pctApres : x.pct} %)</span></div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/70" aria-hidden="true"><div className={`h-full ${STYLES[x.niveau].barre}`} style={{ width: `${Math.min(100, x.prepare > 0 ? x.pctApres : x.pct)}%` }} /></div>
              {x.depasse && <p>Ce paiement dépasserait la limite de {x.libelle} de {fcfa(x.exces)}.</p>}
              {!x.depasse && x.deja && <p>Limite de {x.libelle} dépassée de {fcfa(x.depense - x.montant)}.</p>}
            </li>
          ))}
        </ul>
      )}
      {detail && n.parOperateur.length > 0 && (
        <ul className="space-y-0.5 text-xs" data-testid="budget-portefeuilles">
          {n.parOperateur.map((o) => <li key={o.adresse} className="flex justify-between gap-2"><span>💼 {o.adresse}</span><span className="tabular-nums">{fcfa(o.total)} ({Math.round((o.total / n.montant) * 100)} % du budget)</span></li>)}
        </ul>
      )}
    </div>
  );
}
