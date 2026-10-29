// Marchands près de vous (lot 102 — auRor) : avec la géolocalisation des paiements activée, la LISTE de tous les marchands connus dans le
// rayon réglé par l'administrateur (50 m par défaut), à choisir d'un geste. Si le marchand n'y est pas — ou si aucune liste n'est disponible —
// le bouton « Mon marchand n'est pas dans la liste » laisse saisir son code puis lui donner un nom (nouveau marchand).
// `operateur` : ne montrer que les marchands de cet opérateur (écran du formulaire) ; vide : tous (début du parcours).
// Le serveur ne garde JAMAIS la position demandée.
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiClient, couleurOperateur } from "@/lib/api";
import { positionActuelle } from "@/lib/geoloc";

export default function MarchandsProches({ operateur = "", onChoisir, onAutre, titre = "📍 Marchands près de vous" }) {
  const { user } = useAuth();
  const actif = !!user?.geoloc;
  const [etat, setEtat] = useState({ chargement: actif, marchands: [], rayon: null, refus: false });
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    if (!actif) return undefined;
    let annule = false;
    (async () => {
      const pos = await positionActuelle({ delaiMs: 6000 });
      if (annule) return;
      if (!pos) { setEtat({ chargement: false, marchands: [], rayon: null, refus: true }); return; }     // position indisponible : saisie du code
      try {
        const { data } = await apiClient.get("/marchands/proches", { params: { lat: pos.lat, lon: pos.lon } });
        if (!annule) setEtat({ chargement: false, marchands: data.marchands || [], rayon: data.rayon_m, refus: false });
      } catch { if (!annule) setEtat({ chargement: false, marchands: [], rayon: null, refus: true }); }
    })();
    return () => { annule = true; };
  }, [actif]);

  if (!actif || masque) return null;
  if (etat.chargement) return <p className="text-sm text-gray-500" data-testid="proches-chargement">📍 Recherche des marchands autour de vous…</p>;
  const liste = etat.marchands.filter((m) => !operateur || m.operateur === operateur);
  const autre = () => { setMasque(true); onAutre?.(); };

  return (
    <section className="card space-y-2" data-testid="marchands-proches" aria-label="Marchands près de vous">
      <h2 className="font-semibold">{titre}{etat.rayon ? <span className="ml-1 text-xs font-normal text-gray-500">(dans un rayon de {etat.rayon} m)</span> : null}</h2>
      {liste.length === 0 ? (
        <p className="text-sm text-gray-600" data-testid="proches-vide">
          {etat.refus ? "Votre position n'est pas disponible." : `Aucun marchand connu dans ce rayon${operateur ? ` pour ${operateur}` : ""}.`}{" "}
          Saisissez le code du marchand : vous pourrez lui donner un nom.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100" data-testid="proches-liste">
          {liste.map((m) => (
            <li key={`${m.operateur}:${m.code}`}>
              <button type="button" className="flex w-full items-center gap-3 py-2 text-left" onClick={() => onChoisir(m)} data-testid={`proche-${m.code}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurOperateur(m.operateur) }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.libelle || `Code ${m.code}`}</span>
                  <span className="block text-xs text-gray-500">{m.operateur} · code {m.code}</span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums text-gray-600">{m.distance_m} m</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-outline btn-sm w-full" onClick={autre} data-testid="proches-autre">
        {liste.length === 0 ? "Saisir le code d'un marchand" : "Mon marchand n'est pas dans la liste"}
      </button>
    </section>
  );
}
