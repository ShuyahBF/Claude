// Logo d'un opérateur (lot 89) : image rangée dans /public/operateurs/ ; à défaut (opérateur sans logo, image absente) une pastille ronde
// à la couleur de l'opérateur avec son initiale. L'image est dessinée dans un cadre blanc arrondi, de largeur identique pour tous les
// opérateurs (2,2 × la hauteur) pour que les listes restent alignées, quels que soient les formats des logos (carré pour Orange, large pour
// Moov Africa et Telecel). Les logos sont récupérés sur les sites officiels des opérateurs (marques de leurs propriétaires, affichées ici
// uniquement pour les identifier).
import { useState } from "react";
import { couleurOperateur } from "@/lib/api";

// Fichiers des logos (nom d'opérateur en minuscules → fichier). Ajouter une ligne pour un nouvel opérateur.
const LOGOS = [["orange", "/operateurs/orange.svg"], ["moov", "/operateurs/moov.png"], ["telecel", "/operateurs/telecel.png"]];
const logoDe = (nom) => (LOGOS.find(([cle]) => (nom || "").toLowerCase().includes(cle)) || [])[1] || null;

export default function LogoOperateur({ operateur, taille = 24, className = "" }) {
  const [absent, setAbsent] = useState(false);
  const src = logoDe(operateur);
  const style = { width: taille, height: taille };
  if (src && !absent) {
    return <img src={src} alt="" aria-hidden="true" style={{ width: taille * 2.2, height: taille, padding: 2 }} className={`shrink-0 rounded-md bg-white object-contain ring-1 ring-gray-200 ${className}`} onError={() => setAbsent(true)} draggable={false} />;
  }
  return (
    <span aria-hidden="true" style={{ ...style, background: couleurOperateur(operateur), fontSize: taille * 0.5 }}
      className={`grid shrink-0 place-items-center rounded-full font-bold leading-none text-white ${className}`}>{(operateur || "?").trim().charAt(0).toUpperCase()}</span>
  );
}
