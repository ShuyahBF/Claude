import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import OngletsAdmin from "@/components/OngletsAdmin";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";

// Administration des résumés de presse (lot 62) : liste des médias (nom + adresse), heure du passage quotidien, passage immédiat.
// Tout se règle ici, avec des boutons : aucun fichier ni commande à manipuler.
export default function AdminPresse() {
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [reglages, setReglages] = useState(null);
  const [heure, setHeure] = useState("06:00");
  const [form, setForm] = useState({ nom: "", url: "https://" });

  const charger = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([apiClient.get("/admin/presse/sources"), apiClient.get("/admin/presse/reglages")]);
      setSources(s.data.sources); setReglages(r.data); setHeure(r.data.heure);
    } catch (err) { toast.erreur(messageErreur(err, "Chargement impossible")); setSources([]); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const agir = async (appel, ok) => {
    try { await appel(); if (ok) toast.succes(ok); await charger(); } catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };
  const ajouter = (e) => { e.preventDefault(); agir(() => apiClient.post("/admin/presse/sources", form), "Média ajouté").then(() => setForm({ nom: "", url: "https://" })); };

  if (!sources) return <Chargement />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <OngletsAdmin />
      <h1 className="text-2xl font-bold">🗞️ Résumés de la presse</h1>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Passage quotidien</h2>
        <p className="text-sm text-gray-600">Une seule collecte par jour, à l'heure choisie (heure du Burkina Faso). Les utilisateurs lisent ensuite les résumés, média par média.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="p-heure">Heure du passage</label><input id="p-heure" className="input" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} /></div>
          <div className="boutons-distincts flex gap-2">
            <button type="button" className="btn-primary" onClick={() => agir(() => apiClient.put("/admin/presse/reglages", { heure }), "Heure enregistrée")}>Enregistrer l'heure</button>
            <button type="button" className="btn-outline" onClick={() => agir(() => apiClient.post("/admin/presse/lancer"), "Passage lancé : actualisez dans une minute")}>Lancer un passage maintenant</button>
          </div>
        </div>
        {reglages?.dernier_passage && <p className="text-sm text-gray-500">Dernier passage : {dateHeure(reglages.dernier_passage)}</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Médias suivis ({sources.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="p-1">Média</th><th>Adresse</th><th>Dernier passage</th><th>Actif</th><th /></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 align-top">
                  <td className="p-1 font-medium">{s.nom}</td>
                  <td className="max-w-[16rem] break-all text-gray-600">{s.url}</td>
                  <td>{s.maj_le ? dateHeure(s.maj_le) : "—"}<span className="block text-xs text-gray-500">{s.erreur ? `⚠ ${s.erreur}` : s.maj_le ? `${s.nb_articles} article(s)` : ""}</span></td>
                  <td><input type="checkbox" checked={s.actif} aria-label={`Média actif : ${s.nom}`} onChange={(e) => agir(() => apiClient.put(`/admin/presse/sources/${s.id}`, { nom: s.nom, url: s.url, actif: e.target.checked }))} /></td>
                  <td><button type="button" className="btn-outline btn-sm" onClick={() => window.confirm(`Retirer « ${s.nom} » ?`) && agir(() => apiClient.delete(`/admin/presse/sources/${s.id}`), "Média retiré")}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sources.length === 0 && <p className="p-2 text-gray-500">Aucun média : ajoutez-en un ci-dessous.</p>}
        </div>
        <form onSubmit={ajouter} className="grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <div><label className="label" htmlFor="p-nom">Nom du média</label><input id="p-nom" className="input" required minLength={2} maxLength={60} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
          <div><label className="label" htmlFor="p-url">Adresse de sa page d'accueil ou d'une rubrique</label><input id="p-url" className="input" type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
          <button type="submit" className="btn-primary">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
