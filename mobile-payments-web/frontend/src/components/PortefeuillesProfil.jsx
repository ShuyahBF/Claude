// « Mes portefeuilles » dans le Profil (lot 88) : on COCHE les opérateurs chez qui on a un compte mobile money. Seuls ceux-là apparaissent
// dans l'Historique (cartes de solde, courbe, listes de saisie). Un portefeuille DÉJÀ UTILISÉ (solde indiqué ou mouvement enregistré) reste
// coché : la case est grisée avec la mention « utilisé ».
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiClient, couleurOperateur, messageErreur } from "@/lib/api";

export default function PortefeuillesProfil() {
  const toast = useToast();
  const [d, setD] = useState(null);          // { catalogue, choisis, verrouilles }
  const [occupe, setOccupe] = useState(false);

  useEffect(() => { apiClient.get("/portefeuille/operateurs").then(({ data }) => setD(data)).catch(() => setD({ catalogue: [], choisis: [], verrouilles: [] })); }, []);

  // Chaque case enregistre tout de suite le nouveau choix
  const basculer = async (operateur) => {
    const choisis = d.choisis.includes(operateur) ? d.choisis.filter((o) => o !== operateur) : [...d.choisis, operateur];
    setOccupe(true);
    try { setD((await apiClient.put("/portefeuille/operateurs", { operateurs: choisis })).data); toast.succes("Enregistré"); }
    catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };

  if (!d || d.catalogue.length === 0) return null;
  return (
    <section className="card space-y-3" data-testid="portefeuilles-profil">
      <h2 className="text-lg font-bold">💼 Mes portefeuilles</h2>
      <p className="text-sm text-gray-600">Cochez les opérateurs chez qui vous avez un compte mobile money : un portefeuille est suivi dans l'Historique pour chacun. Un portefeuille déjà utilisé ne peut plus être désactivé.</p>
      <ul className="space-y-2">
        {d.catalogue.map((o) => {
          const verrou = d.verrouilles.includes(o);
          return (
            <li key={o}>
              <label className={`flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 ${verrou ? "bg-gray-50" : "cursor-pointer hover:bg-gray-50"}`}>
                <input type="checkbox" className="h-5 w-5" checked={d.choisis.includes(o)} disabled={occupe || verrou} onChange={() => basculer(o)} data-testid={`pf-${o}`} />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurOperateur(o) }} />
                <span className="min-w-0 flex-1 font-medium">{o}</span>
                {verrou && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">utilisé</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
