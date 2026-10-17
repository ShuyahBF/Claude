import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chargement from "@/components/Chargement";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";
import { useToast } from "@/components/Toast";

// Actualités (lots 62 et 65) : une catégorie à la fois (Presse locale, Tech, Mode, Coaching personnel… et celles créées par l'administrateur),
// puis un bloc par média avec, pour chaque article, son ILLUSTRATION (photo ou dessin, jamais une vidéo), un court résumé et le lien pour tout
// lire chez le média. Les images restent chez le média (adresse seulement, aucune copie) ; la collecte a lieu une fois par jour, jamais à
// l'ouverture de la page.
export default function Presse() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  useEffect(() => {
    apiClient.get("/presse").then((r) => setD(r.data)).catch((err) => { toast.erreur(messageErreur(err, "Actualités indisponibles")); setD({ categories: [] }); });
  }, [toast]);
  if (!d) return <Chargement />;
  const active = d.categories.find((c) => c.id === params.get("categorie")) || d.categories[0];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📰 Actualités</h1>
        {d.maj_le && <p className="text-sm text-gray-500">Mis à jour le {dateHeure(d.maj_le)}</p>}
      </div>
      {d.categories.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Les résumés du jour ne sont pas encore prêts : revenez après la mise à jour du matin.</p>}
      {d.categories.length > 1 && (
        <div role="tablist" aria-label="Catégories d'actualités" className="flex flex-wrap gap-2">
          {d.categories.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === active.id} onClick={() => setParams({ categorie: c.id }, { replace: true })}
              className={`${c.id === active.id ? "btn-primary" : "btn-outline"} btn-sm`}>
              <span aria-hidden="true">{c.icone}</span> {c.nom}
            </button>
          ))}
        </div>
      )}
      {active?.medias.map((m) => (
        <section key={m.id} className="card space-y-3">
          <h2 className="text-lg font-semibold"><a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.nom}</a></h2>
          <ul className="space-y-4">
            {m.articles.map((a) => (
              <li key={a.lien} className="flex gap-3">
                {a.image && (
                  // Illustration hébergée par le média : pas de « referer » envoyé (certains sites refusent sinon), chargement différé,
                  // masquée si elle ne se charge pas
                  <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }}
                    className="h-20 w-28 shrink-0 rounded-lg bg-gray-100 object-cover sm:h-24 sm:w-36" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{a.titre}</p>
                  {a.resume && <p className="text-sm text-gray-700">{a.resume}{!a.ia && <span className="ml-1 text-xs text-gray-400">(début de l'article)</span>}</p>}
                  <a href={a.lien} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline">Lire l'article complet chez {m.nom} →</a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {active && <p className="text-xs text-gray-400">Photos et dessins : © leurs auteurs et médias d'origine, affichés depuis leur site ; les vidéos ne sont pas reprises.</p>}
    </div>
  );
}
