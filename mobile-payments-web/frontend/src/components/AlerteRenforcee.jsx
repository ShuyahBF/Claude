import { useCallback, useEffect, useRef, useState } from "react";
import { jouerSon, lirePreferences, parler, vibrerFort } from "@/lib/alertes";

// Alerte RENFORCÉE pour les malvoyants (lot 52), montée une seule fois dans la mise en page :
//   - tout l'écran clignote en JAUNE et NOIR (contraste maximal) avec le rappel en très gros caractères ;
//   - vibration longue répétée toutes les 4 s, son répété toutes les 8 s, et lecture à voix haute du rappel (si activée) ;
//   - dure jusqu'au toucher du grand bouton « J'ai compris » (ou 3 minutes au plus) ;
//   - clignotement de 2 fois par seconde au plus (sécurité des personnes sensibles aux lumières clignotantes), 1 fois si l'appareil demande moins d'animations.
// Réglage : Profil → « Alerte renforcée » (désactivée au départ). Ne s'ouvre que sur un rappel NOUVEAU (jamais deux fois le même).
const DUREE_MAX_MS = 3 * 60 * 1000;

export default function AlerteRenforcee() {
  const [evenements, setEvenements] = useState(null);     // rappels affichés, null = fermé
  const minuteries = useRef([]);

  const arreter = useCallback(() => {
    minuteries.current.forEach(clearInterval);
    minuteries.current = [];
    try { navigator.vibrate?.(0); window.speechSynthesis?.cancel(); } catch { /* sans importance */ }
    setEvenements(null);
  }, []);

  // Une alerte arrive : on affiche et on lance les répétitions
  useEffect(() => {
    const surAlerte = (e) => {
      const liste = e.detail || [];
      if (!liste.length) return;
      minuteries.current.forEach(clearInterval);
      minuteries.current = [];
      setEvenements(liste);
      const dire = () => { if (lirePreferences().lecture) parler(liste.map((x) => `${x.titre}. ${x.texte}`).join(". ")); };
      const type = liste[0].type;
      vibrerFort(); jouerSon(type, { maximum: true }); dire();
      minuteries.current.push(setInterval(vibrerFort, 4000));
      minuteries.current.push(setInterval(() => jouerSon(type, { maximum: true }), 8000));
      minuteries.current.push(setInterval(dire, 20000));
      minuteries.current.push(setTimeout(arreter, DUREE_MAX_MS));
    };
    window.addEventListener("mpw:alerte-renforcee", surAlerte);
    return () => { window.removeEventListener("mpw:alerte-renforcee", surAlerte); minuteries.current.forEach(clearInterval); };
  }, [arreter]);

  // Le bouton prend le focus (lecteurs d'écran et clavier)
  const bouton = useRef(null);
  useEffect(() => { if (evenements) bouton.current?.focus(); }, [evenements]);

  if (!evenements) return null;
  return (
    <div className="alerte-renforcee fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-6 p-6 text-center" role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby="alerte-titre">
      <p className="text-2xl font-extrabold uppercase tracking-widest">⚠ Rappel</p>
      <div id="alerte-titre" className="space-y-4">
        {evenements.map((e) => (
          <div key={e.cle}>
            <p className="text-4xl font-extrabold leading-tight">{e.titre}</p>
            <p className="mt-1 text-3xl font-bold leading-snug">{e.texte}</p>
          </div>
        ))}
      </div>
      <button ref={bouton} type="button" onClick={arreter}
        className="w-full max-w-sm rounded-3xl border-8 border-current bg-white px-6 py-8 text-3xl font-extrabold text-black">J'ai compris</button>
    </div>
  );
}
