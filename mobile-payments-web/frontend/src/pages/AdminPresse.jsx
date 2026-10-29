import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import OngletsAdmin from "@/components/OngletsAdmin";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";
import { drapeau } from "@/lib/drapeau";          // lot 101 : pays (drapeau) de chaque média

// Administration des actualités (lots 62 et 65) : catégories, médias de chaque catégorie (nom + adresse d'une page ou d'un FLUX RSS),
// heure du passage quotidien, passage immédiat. Des médias PRÉDÉFINIS sont fournis (Presse locale, Tech, Mode, Coaching personnel) ;
// l'administrateur peut en ajouter, désactiver ou retirer, et créer ses propres catégories. Tout se règle avec des boutons.
export default function AdminPresse() {
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [categories, setCategories] = useState([]);
  const [icones, setIcones] = useState(["📰"]);
  const [pays, setPays] = useState({});                 // lot 101 : code ISO → nom du pays (liste déroulante)
  const [reglages, setReglages] = useState(null);
  const [heure, setHeure] = useState("06:00");
  const [form, setForm] = useState({ nom: "", url: "https://", categorie_id: "", pays: "" });
  const [cat, setCat] = useState({ nom: "", icone: "📰", autre: "" });

  const charger = useCallback(async () => {
    try {
      const [c, s, r] = await Promise.all([apiClient.get("/admin/presse/categories"), apiClient.get("/admin/presse/sources"), apiClient.get("/admin/presse/reglages")]);
      setCategories(c.data.categories); setIcones(c.data.icones); setPays(c.data.pays || {}); setSources(s.data.sources); setReglages(r.data); setHeure(r.data.heure);
      setForm((f) => (f.categorie_id || !c.data.categories.length ? f : { ...f, categorie_id: c.data.categories[0].id }));
    } catch (err) { toast.erreur(messageErreur(err, "Chargement impossible")); setSources([]); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const agir = async (appel, ok) => {
    try { await appel(); if (ok) toast.succes(ok); await charger(); return true; } catch (err) { toast.erreur(messageErreur(err, "Action impossible")); return false; }
  };
  const ajouter = async (e) => { e.preventDefault(); if (await agir(() => apiClient.post("/admin/presse/sources", form), "Média ajouté")) setForm((f) => ({ ...f, nom: "", url: "https://" })); };
  const creerCategorie = async (e) => {
    e.preventDefault();
    const icone = cat.icone === "autre" ? (cat.autre.trim() || "📰") : cat.icone;
    if (await agir(() => apiClient.post("/admin/presse/categories", { nom: cat.nom, icone }), "Catégorie créée")) setCat({ nom: "", icone: "📰", autre: "" });
  };
  const retirerCategorie = async (c) => {
    const n = sources.filter((s) => s.categorie_id === c.id).length;
    if (!window.confirm(n ? `Supprimer la catégorie « ${c.nom} » et ses ${n} média(s) ?` : `Supprimer la catégorie « ${c.nom} » ?`)) return;
    agir(() => apiClient.delete(`/admin/presse/categories/${c.id}`, { params: { avec_medias: n > 0 } }), "Catégorie supprimée");
  };

  if (!sources) return <Chargement />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <OngletsAdmin />
      <h1 className="text-2xl font-bold">📰 Actualités</h1>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Passage quotidien</h2>
        <p className="text-sm text-gray-600">Une seule collecte par jour, à l'heure choisie (heure du Burkina Faso), pour tous les médias de toutes les catégories. Les utilisateurs lisent ensuite les résumés, catégorie par catégorie.</p>
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
        <h2 className="text-lg font-semibold">Catégories ({categories.length})</h2>
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-sm">
              <span>{c.icone} {c.nom} <span className="text-gray-500">({sources.filter((s) => s.categorie_id === c.id).length})</span></span>
              <button type="button" className="rounded-full px-2 text-gray-500 hover:bg-gray-200" aria-label={`Supprimer la catégorie ${c.nom}`} onClick={() => retirerCategorie(c)}>×</button>
            </li>
          ))}
        </ul>
        <form onSubmit={creerCategorie} className="grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="c-nom">Nouvelle catégorie</label><input id="c-nom" className="input" required minLength={2} maxLength={40} placeholder="ex. Sport, Cuisine, Santé…" value={cat.nom} onChange={(e) => setCat({ ...cat, nom: e.target.value })} /></div>
          <div><label className="label" htmlFor="c-icone">Pictogramme</label>
            <select id="c-icone" className="input" value={cat.icone} onChange={(e) => setCat({ ...cat, icone: e.target.value })}>
              {icones.map((i) => <option key={i} value={i}>{i}</option>)}<option value="autre">Autre…</option>
            </select>
            {cat.icone === "autre" && <input className="input mt-1" maxLength={8} placeholder="Collez un pictogramme" value={cat.autre} onChange={(e) => setCat({ ...cat, autre: e.target.value })} aria-label="Pictogramme personnalisé" />}
          </div>
          <button type="submit" className="btn-primary">Créer</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Médias suivis ({sources.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="p-1">Média</th><th>Pays</th><th>Catégorie</th><th>Adresse</th><th>Dernier passage</th><th>Actif</th><th /></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 align-top">
                  <td className="p-1 font-medium">{s.nom}{s.predefini && <span className="block text-xs font-normal text-gray-400">prédéfini</span>}</td>
                  <td>
                    {/* Lot 101 : pays du média ; « d'après l'adresse » = on le devine (s.pays_effectif), sinon aucun drapeau */}
                    <select className="input py-1 text-sm" aria-label={`Pays de ${s.nom}`} value={s.pays || ""}
                      onChange={(e) => agir(() => apiClient.put(`/admin/presse/sources/${s.id}`, { nom: s.nom, url: s.url, actif: s.actif, categorie_id: s.categorie_id, pays: e.target.value }))}>
                      <option value="">{s.pays_effectif ? `${drapeau(s.pays_effectif)} ${pays[s.pays_effectif] || s.pays_effectif} (d'après l'adresse)` : "— Aucun —"}</option>
                      {Object.entries(pays).map(([code, nom]) => <option key={code} value={code}>{drapeau(code)} {nom}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="input py-1 text-sm" aria-label={`Catégorie de ${s.nom}`} value={s.categorie_id || ""}
                      onChange={(e) => agir(() => apiClient.put(`/admin/presse/sources/${s.id}`, { nom: s.nom, url: s.url, actif: s.actif, categorie_id: e.target.value }))}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nom}</option>)}
                    </select>
                  </td>
                  <td className="max-w-[14rem] break-all text-gray-600">{s.url}</td>
                  <td>{s.maj_le ? dateHeure(s.maj_le) : "—"}<span className="block text-xs text-gray-500">{s.erreur ? `⚠ ${s.erreur}` : s.maj_le ? `${s.nb_articles} article(s) · ${s.nb_images} image(s)` : ""}</span></td>
                  <td><input type="checkbox" checked={s.actif} aria-label={`Média actif : ${s.nom}`} onChange={(e) => agir(() => apiClient.put(`/admin/presse/sources/${s.id}`, { nom: s.nom, url: s.url, actif: e.target.checked, categorie_id: s.categorie_id }))} /></td>
                  <td><button type="button" className="btn-outline btn-sm" onClick={() => window.confirm(`Retirer « ${s.nom} » ?`) && agir(() => apiClient.delete(`/admin/presse/sources/${s.id}`), "Média retiré")}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sources.length === 0 && <p className="p-2 text-gray-500">Aucun média : ajoutez-en un ci-dessous.</p>}
        </div>
        <form onSubmit={ajouter} className="grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[1fr_1fr_1fr_2fr_auto] sm:items-end">
          <div><label className="label" htmlFor="p-nom">Nom du média</label><input id="p-nom" className="input" required minLength={2} maxLength={60} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
          <div><label className="label" htmlFor="p-cat">Catégorie</label>
            <select id="p-cat" className="input" required value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nom}</option>)}
            </select></div>
          <div><label className="label" htmlFor="p-pays">Pays</label>
            <select id="p-pays" className="input" value={form.pays} onChange={(e) => setForm({ ...form, pays: e.target.value })}>
              <option value="">D'après l'adresse</option>
              {Object.entries(pays).map(([code, nom]) => <option key={code} value={code}>{drapeau(code)} {nom}</option>)}
            </select></div>
          <div><label className="label" htmlFor="p-url">Adresse d'une page ou d'un flux RSS</label><input id="p-url" className="input" type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
          <button type="submit" className="btn-primary">Ajouter</button>
        </form>
        <p className="text-xs text-gray-500">Astuce : un flux RSS (adresse se terminant souvent par /feed ou /rss) est plus fiable qu'une page d'accueil et fournit les images.</p>
      </section>
    </div>
  );
}
