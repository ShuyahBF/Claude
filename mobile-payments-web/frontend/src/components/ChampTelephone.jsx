import { useEffect, useRef, useState } from "react";
import PastilleOperateur from "@/components/PastilleOperateur";
import { grouperPar2 } from "@/lib/operateurs";
import { assembler, AUTRE, libellePays, PAYS, separer, trouverPays } from "@/lib/pays";

/** Liste des pays compacte : drapeau + indicatif seulement ; la vraie liste (invisible, posée par-dessus) s'ouvre au toucher avec le nom complet des pays. */
export function SelecteurPays({ code, indicatif, disabled = false, onChange }) {
  const pays = code === AUTRE ? null : trouverPays(code);
  return (
    <div className="input relative flex w-[6.75rem] shrink-0 items-center gap-1 px-3 focus-within:ring-2 focus-within:ring-primary/40">
      <span aria-hidden="true">{pays ? pays.drapeau : "🌍"}</span>
      <span className="tabular-nums">+{indicatif || "…"}</span>
      <span aria-hidden="true" className="ml-auto text-xs text-gray-500">▾</span>
      <select value={code} disabled={disabled} aria-label="Pays du numéro (indicatif)" title={pays?.nom || "Autre indicatif"}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => onChange(e.target.value)}>
        {PAYS.map((p) => <option key={p.code} value={p.code}>{libellePays(p)}</option>)}
        <option value={AUTRE}>Autre indicatif…</option>
      </select>
    </div>
  );
}

// Champ « numéro de téléphone » avec la liste des pays (lots 55 et 57) : Burkina Faso par défaut, « Autre indicatif… » en fin de liste.
// `valeur` / `onChange` échangent le numéro INTERNATIONAL (« +22670000000 », "" si vide) : le reste du site n'a rien à changer.
// Lot 57 : pays à numéro national de longueur fixe (Burkina Faso : EXACTEMENT 8 chiffres) → vérifié pendant la saisie (message sous le champ,
// envoi du formulaire bloqué) ; chiffres affichés PAR GROUPES DE 2 (07 33 23 13) ; numéro burkinabè complet → pastille du réseau (Orange, Moov, Telecel).
export default function ChampTelephone({ id, valeur, onChange, required = false, disabled = false, ariaLabel = "Numéro de téléphone", classeSaisie = "input" }) {
  const [etat, setEtat] = useState(() => separer(valeur));       // {pays, indicatif, national (chiffres seuls)}
  const champ = useRef(null);
  const pays = etat.pays === AUTRE ? null : trouverPays(etat.pays);
  const longueur = pays?.longueur || null;
  const chiffres = etat.national.replace(/\D/g, "");
  const erreur = longueur && chiffres && chiffres.length !== longueur ? `${longueur} chiffres attendus (${chiffres.length} saisis)` : "";
  useEffect(() => { champ.current?.setCustomValidity(erreur ? `Numéro ${pays.nom} : ${erreur}.` : ""); }, [erreur, pays]);

  const maj = (suite) => {
    const e = { ...etat, ...suite };
    setEtat(e);
    onChange(assembler(e.indicatif, e.national, e.pays !== AUTRE && !!trouverPays(e.pays).zero));
  };
  const choisirPays = (code) => {
    if (code === AUTRE) maj({ pays: AUTRE, indicatif: "" });
    else maj({ pays: code, indicatif: trouverPays(code).indicatif });
  };
  // Saisie : chiffres seuls, plafonnés à la longueur du pays (8 au Burkina)
  const saisir = (texte) => {
    let c = texte.replace(/\D/g, "");
    if (longueur) c = c.slice(0, longueur);
    maj({ national: c });
  };
  const affiche = longueur === 8 ? grouperPar2(chiffres) : etat.national;
  const complet = `+${etat.indicatif}${chiffres}`;

  return (
    <div>
      <div className="flex gap-2">
        <SelecteurPays code={etat.pays} indicatif={etat.indicatif} disabled={disabled} onChange={choisirPays} />
        {etat.pays === AUTRE && (
          <input className="input w-20 shrink-0 px-2" inputMode="numeric" maxLength={4} placeholder="+…" aria-label="Indicatif du pays" disabled={disabled}
            value={etat.indicatif ? `+${etat.indicatif}` : ""} onChange={(e) => maj({ indicatif: e.target.value.replace(/\D/g, "") })} />
        )}
        <input ref={champ} id={id} className={`${classeSaisie} min-w-0 flex-1 tabular-nums`} type="tel" inputMode="tel" autoComplete="tel-national" required={required} disabled={disabled}
          placeholder={longueur === 8 ? "70 12 34 56" : "Numéro"} aria-label={ariaLabel} aria-invalid={erreur ? "true" : undefined}
          aria-describedby={id ? `${id}-aide` : undefined} value={affiche} onChange={(e) => saisir(e.target.value)} />
      </div>
      {/* Message de longueur, sinon réseau du numéro burkinabè complet */}
      {erreur
        ? <p id={id ? `${id}-aide` : undefined} className="mt-1 text-xs font-semibold text-red-600" role="alert">{erreur}</p>
        : etat.pays === "BF" && chiffres.length === 8
          ? <p id={id ? `${id}-aide` : undefined} className="mt-1 text-xs text-gray-500">Réseau <PastilleOperateur telephone={complet} /></p>
          : null}
    </div>
  );
}
