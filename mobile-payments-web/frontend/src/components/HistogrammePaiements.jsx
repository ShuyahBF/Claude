// Histogramme des paiements (lot 98 — auRor) : par JOUR ou par MOIS, en MONTANT ou en NOMBRE de paiements.
// Avant le lot 98 l'histogramme ne comptait que le nombre de paiements par jour : avec un historique importé (un paiement par jour, le plus
// souvent) toutes les barres avaient la même hauteur. Le montant est maintenant la mesure par défaut, avec une échelle graduée.
import { useMemo, useState } from "react";
import { fcfa } from "@/lib/api";

const H = 120;                                                      // hauteur du tracé en pixels
const court = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const libelleMois = (m) => `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const libelleJour = (j) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;

export default function HistogrammePaiements({ parJour, parMois }) {
  // Historique long (plus de 3 mois d'activité) : on commence par le mois, plus lisible que 90 jours dispersés sur plusieurs années.
  // Le choix de l'utilisateur est gardé dans `choixEchelle` ; tant qu'il n'a rien choisi, l'échelle se déduit des DONNÉES du moment
  // (au premier affichage la liste est encore vide : un état fixé à ce moment-là restait à tort sur « jour »).
  const [choixEchelle, setEchelle] = useState(null);
  const echelle = choixEchelle || (parMois.length > 3 ? "mois" : "jour");
  const [mesure, setMesure] = useState("montant");
  const lignes = useMemo(() => (echelle === "mois"
    ? parMois.map((m) => ({ cle: m.mois, ...m, nom: libelleMois(m.mois) }))
    : parJour.map((j) => ({ cle: j.jour, ...j, nom: libelleJour(j.jour) }))), [echelle, parJour, parMois]);
  const max = Math.max(1, ...lignes.map((l) => l[mesure]));
  if (lignes.length < 2 && parJour.length < 2) return null;

  const bouton = (valeur, actuel, set, texte) => (
    <button type="button" aria-pressed={actuel === valeur} onClick={() => set(valeur)}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${actuel === valeur ? "bg-primary text-white" : "bg-gray-100 text-gray-700"}`}>{texte}</button>
  );
  return (
    <section className="card space-y-2" data-testid="histogramme">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Paiements par {echelle === "mois" ? "mois" : "jour"}</h2>
        <div className="flex flex-wrap gap-1">
          {bouton("montant", mesure, setMesure, "Montant")}
          {bouton("nombre", mesure, setMesure, "Nombre")}
          <span className="mx-1 w-px bg-gray-200" />
          {bouton("jour", echelle, setEchelle, "Jours")}
          {bouton("mois", echelle, setEchelle, "Mois")}
        </div>
      </div>
      <div className="flex gap-2">
        {/* Échelle : valeur maximale en haut, zéro en bas */}
        <div className="flex flex-col justify-between text-right text-[10px] tabular-nums text-gray-500" style={{ height: H }}>
          <span>{mesure === "montant" ? court(max) : max}</span><span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-px overflow-hidden border-b border-l border-gray-200" style={{ height: H }} data-testid="graphique-jours">
          {lignes.map((l) => (
            <div key={l.cle} className="flex h-full min-w-0 flex-1 flex-col justify-end px-px" title={`${l.nom} : ${l.nombre} paiement(s), ${fcfa(l.montant)}`}>
              <div className="rounded-t bg-primary/80" style={{ height: `${Math.max(2, (l[mesure] / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <p className="flex justify-between text-xs text-gray-500"><span>{lignes[0]?.nom}</span><span>{lignes[lignes.length - 1]?.nom}</span></p>
      <p className="text-xs text-gray-500">Touchez ou survolez une barre pour voir le détail. Maximum : {mesure === "montant" ? fcfa(max) : `${max} paiement(s)`}.</p>
    </section>
  );
}
