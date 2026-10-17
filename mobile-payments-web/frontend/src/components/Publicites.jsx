// ============================================================================
// Publicites.jsx — carrousel des annonces de la régie publicitaire de SAWALI (lot 30).
//
// Affiché en haut de l'écran Payer. Les annonces viennent de CE serveur (/api/publicites), qui les lit chez
// SAWALI en arrière-plan : le navigateur ne parle jamais à SAWALI.
//   - une seule annonce : bannière fixe ; plusieurs : carrousel qui défile toutes les 5 s (pause au toucher),
//     avec des points et des flèches ;
//   - image ou vidéo (muette, en boucle) ; mention « Annonce » + nom de l'annonceur ;
//   - impression comptée quand l'annonce s'affiche (une fois par annonce et par ouverture de l'écran) ;
//   - clic : le serveur compte le clic et renvoie l'adresse à ouvrir (nouvel onglet) ;
//   - aucune annonce ou serveur injoignable : rien n'est affiché (l'écran Payer n'est jamais gêné).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";

const DEFILEMENT_MS = 5000;

export default function Publicites() {
  const [annonces, setAnnonces] = useState([]);
  const [indice, setIndice] = useState(0);
  const [pause, setPause] = useState(false);
  const vues = useRef(new Set());   // annonces dont l'impression a déjà été signalée pendant cette ouverture

  // Lecture de la liste : si le serveur ne l'a pas encore reçue de SAWALI (en_cours), on réessaie 2 fois
  useEffect(() => {
    let fini = false;
    const lire = async (essai) => {
      try {
        const { data } = await apiClient.get("/publicites");
        if (fini) return;
        setAnnonces(data.annonces || []);
        if (data.en_cours && essai < 2) setTimeout(() => lire(essai + 1), 2500);
      } catch { /* silencieux : pas d'annonce */ }
    };
    lire(0);
    return () => { fini = true; };
  }, []);

  const total = annonces.length;
  const courante = total ? annonces[indice % total] : null;

  // Défilement automatique (sauf une seule annonce ou pause)
  useEffect(() => {
    if (total < 2 || pause) return undefined;
    const t = setInterval(() => setIndice((i) => (i + 1) % total), DEFILEMENT_MS);
    return () => clearInterval(t);
  }, [total, pause]);

  // Impression : à l'affichage de chaque annonce, une seule fois par ouverture de l'écran
  useEffect(() => {
    if (!courante || vues.current.has(courante.id)) return;
    vues.current.add(courante.id);
    apiClient.post(`/publicites/${courante.id}/impression`).catch(() => {});
  }, [courante]);

  // Clic : le serveur compte et donne l'adresse à ouvrir
  const ouvrir = useCallback(async () => {
    if (!courante) return;
    try {
      const { data } = await apiClient.post(`/publicites/${courante.id}/clic`);
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch { /* sans importance */ }
  }, [courante]);

  if (!courante) return null;
  const aller = (delta) => setIndice((i) => (i + delta + total) % total);

  return (
    <section aria-label="Annonce" className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
      onPointerEnter={() => setPause(true)} onPointerLeave={() => setPause(false)}>
      <button type="button" onClick={ouvrir} className="block w-full text-left" disabled={!courante.url}
        aria-label={`Annonce ${courante.nom || courante.annonceur || ""}`.trim()}>
        {courante.video ? (
          <video key={courante.id} src={courante.image} className="aspect-[16/6] w-full object-cover" autoPlay muted loop playsInline />
        ) : (
          <img key={courante.id} src={courante.image} alt={courante.nom || "Annonce"} className="aspect-[16/6] w-full object-cover" loading="lazy" />
        )}
      </button>
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
        Annonce{courante.annonceur ? ` · ${courante.annonceur}` : ""}
      </span>
      {total > 1 && (
        <>
          <button type="button" onClick={() => aller(-1)} aria-label="Annonce précédente"
            className="absolute left-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60">‹</button>
          <button type="button" onClick={() => aller(1)} aria-label="Annonce suivante"
            className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60">›</button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {annonces.map((a, i) => (
              <button key={a.id} type="button" onClick={() => setIndice(i)} aria-label={`Annonce ${i + 1}`}
                className={`h-2 w-2 rounded-full ${i === indice % total ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
