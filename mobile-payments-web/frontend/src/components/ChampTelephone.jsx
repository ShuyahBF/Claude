import { useState } from "react";
import { assembler, AUTRE, libellePays, PAYS, separer, trouverPays } from "@/lib/pays";

// Champ « numéro de téléphone » avec la liste des pays (lot 55) : Burkina Faso par défaut, « Autre indicatif… » en fin de liste.
// `valeur` / `onChange` échangent le numéro INTERNATIONAL (« +22670000000 », "" si vide) : le reste du site n'a rien à changer.
// Un numéro déjà enregistré s'affiche avec son pays reconnu automatiquement.
export default function ChampTelephone({ id, valeur, onChange, required = false, disabled = false, placeholder = "70 00 00 00", ariaLabel = "Numéro de téléphone", classeSaisie = "input" }) {
  const [etat, setEtat] = useState(() => separer(valeur));       // {pays, indicatif, national}
  const pays = etat.pays === AUTRE ? null : trouverPays(etat.pays);

  const maj = (suite) => {
    const e = { ...etat, ...suite };
    setEtat(e);
    onChange(assembler(e.indicatif, e.national, e.pays !== AUTRE && !!trouverPays(e.pays).zero));
  };
  const choisirPays = (code) => {
    if (code === AUTRE) maj({ pays: AUTRE, indicatif: "" });
    else maj({ pays: code, indicatif: trouverPays(code).indicatif });
  };

  return (
    <div className="flex gap-2">
      <select className="input w-auto max-w-[60%] shrink-0 px-2 text-sm" value={etat.pays} disabled={disabled} aria-label="Pays du numéro" onChange={(e) => choisirPays(e.target.value)}>
        {PAYS.map((p) => <option key={p.code} value={p.code}>{libellePays(p)}</option>)}
        <option value={AUTRE}>Autre indicatif…</option>
      </select>
      {etat.pays === AUTRE && (
        <input className="input w-20 shrink-0 px-2" inputMode="numeric" maxLength={4} placeholder="+…" aria-label="Indicatif du pays" disabled={disabled}
          value={etat.indicatif ? `+${etat.indicatif}` : ""} onChange={(e) => maj({ indicatif: e.target.value.replace(/\D/g, "") })} />
      )}
      <input id={id} className={`${classeSaisie} min-w-0 flex-1`} type="tel" inputMode="tel" autoComplete="tel-national" required={required} disabled={disabled} maxLength={20}
        placeholder={placeholder} aria-label={ariaLabel} value={etat.national} onChange={(e) => maj({ national: e.target.value })} />
      {pays && <span className="sr-only">{pays.nom}</span>}
    </div>
  );
}
