// Liste de choix d'opérateurs AVEC LEURS LOGOS (lot 89). Une liste déroulante du navigateur ne peut pas afficher d'images : ce composant
// dessine une liste « bouton + menu » accessible (rôles listbox / option, flèches, Entrée, Échap, clic à l'extérieur).
// Utilisation : <SelecteurOperateur valeur={op} onChange={setOp} options={["Orange", "Moov"]} />
// `options` : des noms d'opérateurs, ou des objets { valeur, libelle, operateur?, emoji? } (ex. « Personnel » avec un emoji, sans logo).
// `vide` : libellé d'une première ligne sans opérateur (valeur "") — « Tous les opérateurs », « — »…
import { useEffect, useMemo, useRef, useState } from "react";
import LogoOperateur from "@/components/LogoOperateur";

export default function SelecteurOperateur({ id, valeur, onChange, options, vide, placeholder = "Choisir un opérateur…", disabled = false, ariaLabel, className = "", compact = false }) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef(null);
  const lignes = useMemo(() => [
    ...(vide !== undefined ? [{ valeur: "", libelle: vide }] : []),
    ...options.map((o) => (typeof o === "string" ? { valeur: o, libelle: o, operateur: o } : { operateur: o.operateur, ...o })),
  ], [options, vide]);
  const courante = lignes.find((l) => l.valeur === valeur);

  // Fermeture au clic à l'extérieur
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  const ouvrir = () => { setActif(Math.max(0, lignes.findIndex((l) => l.valeur === valeur))); setOuvert(true); };
  const choisir = (l) => { setOuvert(false); onChange(l.valeur); };
  const clavier = (e) => {
    if (disabled) return;
    if (!ouvert && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); ouvrir(); return; }
    if (!ouvert) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(lignes.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (lignes[actif]) choisir(lignes[actif]); }
    else if (e.key === "Escape" || e.key === "Tab") setOuvert(false);
  };
  const contenu = (l) => (
    <>
      {l.operateur ? <LogoOperateur operateur={l.operateur} taille={compact ? 20 : 26} /> : l.emoji ? <span className="grid w-[26px] shrink-0 place-items-center text-lg" aria-hidden="true">{l.emoji}</span> : null}
      <span className="min-w-0 flex-1 truncate">{l.libelle}</span>
    </>
  );
  return (
    <div ref={racine} className={`relative ${className}`} onKeyDown={clavier} data-testid={id ? `sel-${id}` : undefined}>
      <button type="button" id={id} className="input flex w-full items-center gap-2 text-left" disabled={disabled} aria-haspopup="listbox" aria-expanded={ouvert}
        aria-label={ariaLabel} onClick={() => (ouvert ? setOuvert(false) : ouvrir())}>
        {courante ? contenu(courante) : <span className="min-w-0 flex-1 truncate text-gray-400">{placeholder}</span>}
        <span aria-hidden="true" className="shrink-0 text-gray-400">▾</span>
      </button>
      {ouvert && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-64 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {lignes.map((l, i) => (
            <li key={l.valeur || "vide"} role="option" aria-selected={l.valeur === valeur}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${i === actif ? "bg-primary/10" : ""} ${l.valeur === valeur ? "font-semibold" : ""}`}
              onMouseEnter={() => setActif(i)} onClick={() => choisir(l)}>{contenu(l)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
