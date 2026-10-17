import { useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";
import { useToast } from "@/components/Toast";

// Résumés de la presse (lot 62) : un bloc par média, avec pour chaque article un court résumé et le lien pour tout lire chez le média.
// Les médias sont choisis par l'administrateur ; la collecte a lieu une fois par jour (6 h par défaut), jamais à l'ouverture de la page.
export default function Presse() {
  const toast = useToast();
  const [d, setD] = useState(null);
  useEffect(() => {
    apiClient.get("/presse").then((r) => setD(r.data)).catch((err) => { toast.erreur(messageErreur(err, "Presse indisponible")); setD({ medias: [] }); });
  }, [toast]);
  if (!d) return <Chargement />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🗞️ Résumés de la presse</h1>
        {d.maj_le && <p className="text-sm text-gray-500">Mis à jour le {dateHeure(d.maj_le)}</p>}
      </div>
      {d.medias.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Les résumés du jour ne sont pas encore prêts : revenez après la mise à jour du matin.</p>}
      {d.medias.map((m) => (
        <section key={m.id} className="card space-y-3">
          <h2 className="text-lg font-semibold"><a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.nom}</a></h2>
          <ul className="space-y-3">
            {m.articles.map((a) => (
              <li key={a.lien} className="space-y-1">
                <p className="font-medium">{a.titre}</p>
                {a.resume && <p className="text-sm text-gray-700">{a.resume}{!a.ia && <span className="ml-1 text-xs text-gray-400">(début de l'article)</span>}</p>}
                <a href={a.lien} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline">Lire l'article complet chez {m.nom} →</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
