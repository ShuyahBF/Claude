import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import OngletsAdmin from "@/components/OngletsAdmin";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Administration du carnet USSD (lot 66) : ajouter / corriger / désactiver / supprimer un code, ou IMPORTER en bloc un texte collé
// (une ligne par code : Opérateur | Catégorie | Titre | Code | Description). Aucun code n'est prérempli : l'administrateur saisit des codes vérifiés.
const VIDE = { operateur: "Orange", categorie: "Mon numéro", autre: "", titre: "", code: "*", description: "" };

export default function AdminUssd() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(VIDE);
  const [enCours, setEnCours] = useState(null); // id du code en cours de correction
  const [texte, setTexte] = useState("");
  const [bilan, setBilan] = useState(null);

  const charger = useCallback(async () => {
    try { setD((await apiClient.get("/admin/ussd/codes")).data); } catch (err) { toast.erreur(messageErreur(err, "Chargement impossible")); setD({ codes: [], operateurs: [], categories: [] }); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const corps = (c) => ({ operateur: c.operateur, categorie: c.categorie, titre: c.titre, code: c.code, description: c.description || "", actif: c.actif });
  const agir = async (appel, ok) => {
    try { await appel(); if (ok) toast.succes(ok); await charger(); return true; } catch (err) { toast.erreur(messageErreur(err, "Action impossible")); return false; }
  };
  // Enregistre le formulaire : création, ou correction si un code est en cours de modification
  const enregistrer = async (e) => {
    e.preventDefault();
    const categorie = form.categorie === "autre" ? form.autre.trim() : form.categorie;
    const donnees = { operateur: form.operateur, categorie, titre: form.titre, code: form.code, description: form.description, actif: true };
    const ok = enCours ? await agir(() => apiClient.put(`/admin/ussd/codes/${enCours}`, donnees), "Code corrigé") : await agir(() => apiClient.post("/admin/ussd/codes", donnees), "Code ajouté");
    if (ok) { setForm({ ...VIDE, operateur: form.operateur, categorie: form.categorie }); setEnCours(null); }
  };
  const corriger = (c) => {
    // Une catégorie absente de la liste reste sélectionnable via « Autre… » (aucune perte de donnée)
    const connue = d.categories.includes(c.categorie);
    setEnCours(c.id);
    setForm({ operateur: c.operateur, categorie: connue ? c.categorie : "autre", autre: connue ? "" : c.categorie, titre: c.titre, code: c.code, description: c.description || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const importer = async (e) => {
    e.preventDefault();
    try {
      const r = (await apiClient.post("/admin/ussd/importer", { texte })).data;
      setBilan(r); if (r.ajoutes) { setTexte(""); toast.succes(`${r.ajoutes} code(s) ajouté(s)`); } await charger();
    } catch (err) { toast.erreur(messageErreur(err, "Import impossible")); }
  };

  if (!d) return <Chargement />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <OngletsAdmin />
      <h1 className="text-2xl font-bold">📞 Carnet de codes USSD</h1>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{enCours ? "Corriger le code" : "Ajouter un code"}</h2>
        <form onSubmit={enregistrer} className="grid gap-2 sm:grid-cols-2">
          <div><label className="label" htmlFor="x-op">Opérateur</label>
            <select id="x-op" className="input" value={form.operateur} onChange={(e) => setForm({ ...form, operateur: e.target.value })}>{d.operateurs.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className="label" htmlFor="x-cat">Catégorie</label>
            <select id="x-cat" className="input" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
              {d.categories.map((c) => <option key={c} value={c}>{c}</option>)}<option value="autre">Autre…</option></select>
            {form.categorie === "autre" && <input className="input mt-1" required minLength={2} maxLength={40} placeholder="Nom de la nouvelle catégorie" value={form.autre} onChange={(e) => setForm({ ...form, autre: e.target.value })} aria-label="Nouvelle catégorie" />}</div>
          <div><label className="label" htmlFor="x-titre">Titre</label><input id="x-titre" className="input" required minLength={2} maxLength={80} placeholder="ex. Connaître mon numéro" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} /></div>
          <div><label className="label" htmlFor="x-code">Code (commence par * et finit par #)</label><input id="x-code" className="input font-mono" required maxLength={44} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="x-desc">Explication (facultative)</label><input id="x-desc" className="input" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="boutons-distincts flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary">{enCours ? "Enregistrer la correction" : "Ajouter"}</button>
            {enCours && <button type="button" className="btn-outline" onClick={() => { setEnCours(null); setForm(VIDE); }}>Annuler</button>}
          </div>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Importer plusieurs codes d'un coup</h2>
        <p className="text-sm text-gray-600">Collez une ligne par code, sous la forme <span className="font-mono">Opérateur | Catégorie | Titre | Code | Explication</span> (l'explication est facultative). Les codes déjà présents sont ignorés.</p>
        <form onSubmit={importer} className="space-y-2">
          <textarea className="input min-h-32 font-mono text-sm" required minLength={3} aria-label="Texte à importer" placeholder="Orange | Mon numéro | Connaître mon numéro | *123#" value={texte} onChange={(e) => setTexte(e.target.value)} />
          <button type="submit" className="btn-primary">Importer</button>
        </form>
        {bilan && (
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <p>{bilan.ajoutes} ajouté(s) · {bilan.ignores} déjà présent(s) · {bilan.erreurs.length} ligne(s) refusée(s)</p>
            {bilan.erreurs.length > 0 && <ul className="mt-1 list-disc pl-5 text-red-700">{bilan.erreurs.map((x) => <li key={x.ligne}>Ligne {x.ligne} : {x.motif}</li>)}</ul>}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Codes du carnet ({d.codes.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="p-1">Opérateur</th><th>Catégorie</th><th>Titre</th><th>Code</th><th>Actif</th><th /></tr></thead>
            <tbody>
              {d.codes.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 align-top">
                  <td className="p-1">{c.operateur}</td><td>{c.categorie}</td><td className="font-medium">{c.titre}</td><td className="font-mono">{c.code}</td>
                  <td><input type="checkbox" checked={c.actif} aria-label={`Code actif : ${c.titre}`} onChange={(e) => agir(() => apiClient.put(`/admin/ussd/codes/${c.id}`, { ...corps(c), actif: e.target.checked }))} /></td>
                  <td><div className="boutons-distincts flex gap-1">
                    <button type="button" className="btn-outline btn-sm" onClick={() => corriger(c)}>Corriger</button>
                    <button type="button" className="btn-outline btn-sm" onClick={() => window.confirm(`Supprimer « ${c.titre} » (${c.operateur}) ?`) && agir(() => apiClient.delete(`/admin/ussd/codes/${c.id}`), "Code supprimé")}>Supprimer</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.codes.length === 0 && <p className="p-2 text-gray-500">Le carnet est vide : ajoutez des codes vérifiés ou importez-les ci-dessus.</p>}
        </div>
      </section>
    </div>
  );
}
