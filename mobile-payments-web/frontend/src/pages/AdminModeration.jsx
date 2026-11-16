import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import OngletsAdmin from "@/components/OngletsAdmin";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";

// MODÉRATION (super-administrateur) : messages écrits à Liluvine qui sortent du cadre légal ou des règles du service (piratage, fraude,
// contenu sexuel ou pornographique, drogue et armes, violence envers autrui). Chaque ligne porte la catégorie, la date et le compte ;
// JAMAIS le texte du message (les confidences ne sont pas gardées côté serveur). Un indicateur AIDE à décider, il ne sanctionne rien seul.
const COULEUR = { securite: "bg-red-100 text-red-900", sexuel: "bg-purple-100 text-purple-900", illegal: "bg-amber-100 text-amber-900", violence: "bg-rose-100 text-rose-900" };
const ICONE = { securite: "🔐", sexuel: "🔞", illegal: "🚫", violence: "⚠️" };

export default function AdminModeration() {
  const toast = useToast();
  const [d, setD] = useState(null);

  const charger = useCallback(async (annonce = false) => {
    if (annonce) toast.info("Actualisation de la modération en cours…");
    try { const r = await apiClient.get("/moderation"); setD(r.data); if (annonce) toast.succes(`Relu : ${r.data.signalements.length} signalement(s), ${r.data.a_traiter} à traiter`); }
    catch (err) { toast.erreur(messageErreur(err, "Chargement impossible")); setD({ signalements: [], par_categorie: {}, a_traiter: 0 }); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const traiter = async (s) => {
    toast.info("Enregistrement en cours…");
    try { await apiClient.post(`/moderation/${s.id}/traiter`); toast.succes("Signalement marqué comme examiné"); await charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };

  if (!d) return <Chargement />;
  return (
    <div className="space-y-4">
      <OngletsAdmin />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">🛡️ Modération des messages à Liluvine</h1>
        <button type="button" className="btn-secondary" onClick={() => charger(true)}>🔄 Actualiser</button>
      </div>
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Quand un message sort du cadre légal, Liluvine décline poliment et le signalement arrive ici : catégorie, date et compte. Le texte n'est jamais gardé. Une détresse personnelle n'est jamais signalée.</p>
      <div className="flex flex-wrap gap-2" data-testid="totaux-moderation">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">⏳ {d.a_traiter} à traiter</span>
        {Object.entries(d.par_categorie).map(([c, n]) => <span key={c} className={`rounded-full px-3 py-1 text-sm font-semibold ${COULEUR[c] || "bg-gray-100"}`}>{ICONE[c] || "•"} {c} : {n}</span>)}
      </div>
      {d.signalements.length === 0 ? <p className="card text-sm text-gray-600">Aucun signalement. 🎉</p> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600"><tr><th className="p-2">Date</th><th className="p-2">Compte</th><th className="p-2">Catégorie</th><th className="p-2">Indicateur</th><th className="p-2">Action</th></tr></thead>
            <tbody>{d.signalements.map((s) => (
              <tr key={s.id} className={`border-t border-gray-100 ${s.traite ? "opacity-60" : ""}`}>
                <td className="p-2 tabular-nums">{dateHeure(s.cree_le)}</td>
                <td className="p-2"><b className="text-primary">{s.nom || "—"}</b><br /><span className="text-xs text-gray-500">{s.telephone}</span></td>
                <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COULEUR[s.categorie] || "bg-gray-100"}`}>{ICONE[s.categorie] || "•"} {s.libelle}</span></td>
                <td className="p-2">{s.recidive ? <b className="text-red-700">🔁 Récidive (3 en 24 h)</b> : <span className="text-gray-500">—</span>}</td>
                <td className="p-2">{s.traite ? <span className="text-emerald-700">✅ Examiné</span> : <button type="button" className="btn-primary btn-sm" onClick={() => traiter(s)}>✅ Marquer examiné</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>)}
    </div>
  );
}
