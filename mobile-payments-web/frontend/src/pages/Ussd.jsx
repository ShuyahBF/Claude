import { useEffect, useMemo, useState } from "react";
import Chargement from "@/components/Chargement";
import SelecteurOperateur from "@/components/SelecteurOperateur";   // lot 89 : listes d'opérateurs avec logos
import { apiClient, messageErreur } from "@/lib/api";
import { useToast } from "@/components/Toast";

// Carnet de codes USSD (lot 66) : les codes pratiques de chaque opérateur (connaître son numéro, solde, recharges Internet, Mobile Money…).
// L'utilisateur choisit son opérateur, peut chercher un mot, COPIER le code ou le COMPOSER d'un geste (lien « tel: »).
// Les codes sont saisis / importés par l'administrateur : cet écran ne fait que les lire.
export default function Ussd() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [operateur, setOperateur] = useState("");
  const [recherche, setRecherche] = useState("");
  useEffect(() => {
    apiClient.get("/ussd").then((r) => { setD(r.data); setOperateur(r.data.operateurs[0]?.nom || ""); })
      .catch((err) => { toast.erreur(messageErreur(err, "Carnet indisponible")); setD({ operateurs: [] }); });
  }, [toast]);

  const actif = d?.operateurs.find((o) => o.nom === operateur);
  // Filtre par mot (titre, code ou description) dans les catégories de l'opérateur choisi
  const categories = useMemo(() => {
    if (!actif) return [];
    const mot = recherche.trim().toLowerCase();
    return actif.categories
      .map((c) => ({ ...c, codes: c.codes.filter((x) => !mot || `${x.titre} ${x.code} ${x.description}`.toLowerCase().includes(mot)) }))
      .filter((c) => c.codes.length);
  }, [actif, recherche]);

  const copier = async (code) => {
    try { await navigator.clipboard.writeText(code); toast.succes(`Code ${code} copié`); } catch { toast.erreur("Copie impossible : recopiez le code à la main"); }
  };

  if (!d) return <Chargement />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">📞 Codes USSD pratiques</h1>
      {d.operateurs.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Le carnet est en cours de préparation : revenez bientôt.</p>}
      {d.operateurs.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
          <div><label className="label" htmlFor="u-op">Mon opérateur</label>
            <SelecteurOperateur id="u-op" valeur={operateur} onChange={setOperateur} options={d.operateurs.map((o) => o.nom)} /></div>
          <div><label className="label" htmlFor="u-q">Chercher</label>
            <input id="u-q" className="input" type="search" placeholder="ex. numéro, internet, solde…" value={recherche} onChange={(e) => setRecherche(e.target.value)} /></div>
        </div>
      )}
      {categories.map((c) => (
        <section key={c.nom} className="card space-y-2">
          <h2 className="text-lg font-semibold">{c.nom}</h2>
          <ul className="divide-y divide-gray-100">
            {c.codes.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{x.titre}</p>
                  {x.description && <p className="text-sm text-gray-600">{x.description}</p>}
                  <p className="font-mono text-base tracking-wide">{x.code}</p>
                </div>
                <div className="boutons-distincts flex gap-2">
                  <button type="button" className="btn-outline btn-sm" onClick={() => copier(x.code)}>Copier</button>
                  {/* Composer : seulement si le code est complet (pas de modèle à compléter comme *555*NUMERO#) ; « # » s'écrit %23 dans un lien tel: */}
                  {x.appelable && <a className="btn-primary btn-sm" href={`tel:${x.code.replace(/#/g, "%23")}`}>Composer</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {actif && categories.length === 0 && <p className="text-gray-500">Aucun code ne correspond à « {recherche} ».</p>}
      <p className="text-xs text-gray-500">Certains codes peuvent changer ou être payants selon votre forfait : vérifiez auprès de votre opérateur.</p>
    </div>
  );
}
