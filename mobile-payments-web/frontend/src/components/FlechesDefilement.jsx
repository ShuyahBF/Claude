// Deux flèches rondes (haut / bas) pour parcourir une longue page (lot 99 — auRor) : l'une remonte tout en haut, l'autre descend tout en bas.
// Posées à GAUCHE, à la hauteur de la bulle « + » (à droite) et au-dessus du menu du bas. Chaque flèche n'apparaît que si elle sert :
// la flèche du haut après un premier défilement, celle du bas tant qu'il reste de la page à parcourir. Défilement doux, sauf si
// l'utilisateur a demandé de réduire les animations (aller direct).
import { useEffect, useState } from "react";

const SEUIL_PX = 200;                    // distance au bord à partir de laquelle une flèche s'affiche

export default function FlechesDefilement() {
  const [haut, setHaut] = useState(false);       // vrai : on n'est plus tout en haut
  const [bas, setBas] = useState(false);         // vrai : il reste du contenu en dessous

  useEffect(() => {
    const mesurer = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const total = document.documentElement.scrollHeight;
      setHaut(y > SEUIL_PX);
      setBas(total - (y + window.innerHeight) > SEUIL_PX);
    };
    mesurer();
    window.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    // La hauteur de la page change quand la liste se charge ou s'allonge : on remesure aussi à chaque changement de contenu
    const observateur = typeof ResizeObserver !== "undefined" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(document.body);
    return () => { window.removeEventListener("scroll", mesurer); window.removeEventListener("resize", mesurer); observateur?.disconnect(); };
  }, []);

  const aller = (versLeHaut) => {
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: versLeHaut ? 0 : document.documentElement.scrollHeight, behavior: doux ? "smooth" : "auto" });
  };

  if (!haut && !bas) return null;
  const classe = "grid h-11 w-11 place-items-center rounded-full border border-gray-200 bg-white/90 text-xl text-primary shadow-lg backdrop-blur transition active:scale-95";
  return (
    <div className="no-print fixed left-4 z-50 flex flex-col gap-2" style={{ bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.25rem)" }} data-testid="fleches-defilement">
      {haut && <button type="button" className={classe} aria-label="Remonter en haut de la page" title="Remonter en haut" onClick={() => aller(true)} data-testid="fleche-haut">↑</button>}
      {bas && <button type="button" className={classe} aria-label="Descendre en bas de la page" title="Descendre en bas" onClick={() => aller(false)} data-testid="fleche-bas">↓</button>}
    </div>
  );
}
