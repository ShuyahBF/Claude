import { useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, CATEGORIES, messageErreur } from "@/lib/api";

const VIDE = { operateur: "", pays: "BF", nom: "", categorie: "merchant_payment", gabarit_ussd: "*",
  champs: [{ key: "amount", label: "Montant (FCFA)", type: "numeric", isMerchantCode: false }], description: "", actif: true };

// Administration du catalogue des services USSD (réservée à l'administrateur).
// Le gabarit utilise des {cle} : chaque {cle} doit avoir son champ, et inversement.
export default function Admin() {
  const toast = useToast();
  const [services, setServices] = useState(null);
  const [edition, setEdition] = useState(null); // service en cours d'édition (id absent = nouveau)

  const charger = () => apiClient.get("/admin/services").then(({ data }) => setServices(data)).catch(() => setServices([]));
  useEffect(() => { charger(); }, []);

  const enregistrer = async (e) => {
    e.preventDefault();
    const { id, cree_le, modifie_le, ...corps } = edition; // eslint-disable-line no-unused-vars
    try {
      if (id) await apiClient.put(`/admin/services/${id}`, corps);
      else await apiClient.post("/admin/services", corps);
      toast.succes("Service enregistré");
      setEdition(null);
      charger();
    } catch (err) {
      toast.erreur(messageErreur(err, "Enregistrement impossible : vérifiez le gabarit et les champs"));
    }
  };

  const majChamp = (i, cle, valeur) => setEdition({
    ...edition, champs: edition.champs.map((c, j) => (j === i ? { ...c, [cle]: valeur } : c)) });

  // Aperçu du code avec des valeurs d'exemple
  const apercu = edition ? edition.gabarit_ussd.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (k === "amount" ? "5000" : "1234")) : "";

  if (services === null) return <Chargement />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Catalogue des services USSD</h1>
        <button type="button" className="btn-primary" onClick={() => setEdition({ ...VIDE })}>+ Service</button>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Vérifiez chaque code auprès de l'opérateur avant de l'activer : un code faux enverrait l'utilisateur vers une mauvaise opération.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="table">
          <thead><tr><th>Opérateur</th><th>Service</th><th>Gabarit</th><th>État</th><th /></tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>{s.operateur} <span className="text-xs text-gray-400">{s.pays}</span></td>
                <td>{s.nom}<br /><span className="text-xs text-gray-500">{CATEGORIES[s.categorie]}</span></td>
                <td className="font-mono">{s.gabarit_ussd}</td>
                <td>{s.actif ? <span className="badge bg-green-100 text-green-800">Actif</span> : <span className="badge bg-gray-100 text-gray-500">Désactivé</span>}</td>
                <td><button type="button" className="btn-outline btn-sm" onClick={() => setEdition({ ...s })}>Modifier</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal ouvert={!!edition} titre={edition?.id ? "Modifier le service" : "Nouveau service"} onFermer={() => setEdition(null)} large>
        {edition && (
          <form onSubmit={enregistrer} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="label">Opérateur</label><input className="input" required value={edition.operateur} onChange={(e) => setEdition({ ...edition, operateur: e.target.value })} /></div>
              <div><label className="label">Pays (ISO)</label><input className="input" required maxLength={2} value={edition.pays} onChange={(e) => setEdition({ ...edition, pays: e.target.value.toUpperCase() })} /></div>
              <div><label className="label">Catégorie</label>
                <select className="input" value={edition.categorie} onChange={(e) => setEdition({ ...edition, categorie: e.target.value })}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
            </div>
            <div><label className="label">Nom du service</label><input className="input" required value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} /></div>
            <div>
              <label className="label">Gabarit USSD</label>
              <input className="input font-mono" required value={edition.gabarit_ussd} placeholder="*144*10*{code}*{amount}#"
                onChange={(e) => setEdition({ ...edition, gabarit_ussd: e.target.value.trim() })} />
              <p className="mt-1 text-xs text-gray-500">Aperçu avec des valeurs d'exemple : <span className="font-mono">{apercu}</span></p>
            </div>
            <div className="space-y-2">
              <p className="label">Champs à saisir (clé = nom entre accolades dans le gabarit)</p>
              {edition.champs.map((c, i) => (
                <div key={i} className="grid grid-cols-[6rem_1fr_7rem_auto_auto] items-center gap-2">
                  <input className="input font-mono" placeholder="clé" value={c.key} onChange={(e) => majChamp(i, "key", e.target.value.trim())} />
                  <input className="input" placeholder="Libellé" value={c.label} onChange={(e) => majChamp(i, "label", e.target.value)} />
                  <select className="input" value={c.type} onChange={(e) => majChamp(i, "type", e.target.value)}>
                    <option value="numeric">Chiffres</option><option value="text">Texte</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={c.isMerchantCode} onChange={(e) => majChamp(i, "isMerchantCode", e.target.checked)} /> marchand</label>
                  <button type="button" className="text-red-600" aria-label="Retirer le champ"
                    onClick={() => setEdition({ ...edition, champs: edition.champs.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn-outline btn-sm" onClick={() => setEdition({ ...edition,
                champs: [...edition.champs, { key: "", label: "", type: "numeric", isMerchantCode: false }] })}>+ Champ</button>
            </div>
            <div><label className="label">Description</label><input className="input" value={edition.description} onChange={(e) => setEdition({ ...edition, description: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edition.actif} onChange={(e) => setEdition({ ...edition, actif: e.target.checked })} /> Service actif</label>
            <button type="submit" className="btn-primary w-full">Enregistrer</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
