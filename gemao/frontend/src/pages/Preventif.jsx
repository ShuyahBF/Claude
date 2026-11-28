import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";

export default function Preventif() {
  const { lignes, charger, erreur } = useListe("/preventif");
  const toast = useToast();
  const [equipements, setEquipements] = useState([]);
  const [f, setF] = useState({ equipement_id: "", titre: "", periodicite_jours: 30 });
  useEffect(() => { api("/equipements").then(setEquipements).catch(() => {}); }, []);
  const ajouter = async (e) => {
    e.preventDefault();
    try { await api("/preventif", { methode: "POST", corps: { ...f, periodicite_jours: +f.periodicite_jours } }); toast("Plan ajouté.", "ok"); setF({ ...f, titre: "" }); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  const generer = async () => {
    toast("Génération des interventions échues en cours…");
    try { const r = await api("/preventif/generer", { methode: "POST" }); toast(`${r.nombre} intervention(s) créée(s)${r.nombre ? " : " + r.crees.join(", ") : ""}.`, "ok"); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  return (
    <>
      <Entete titre="Maintenance Préventive" charger={charger} unite="plan(s)"><button onClick={generer}>⚙ Générer les échéances</button></Entete>
      {erreur && <p className="erreur">{erreur}</p>}
      <form className="ligne-form" onSubmit={ajouter}>
        <select value={f.equipement_id} onChange={(e) => setF({ ...f, equipement_id: e.target.value })} required>
          <option value="">— Équipement —</option>{equipements.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.nom}</option>)}</select>
        <input placeholder="Opération (ex. Vidange 250 h)" value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} required minLength={3} />
        <input type="number" min="1" value={f.periodicite_jours} onChange={(e) => setF({ ...f, periodicite_jours: e.target.value })} title="Périodicité en jours" />
        <button className="primaire">➕ Ajouter</button>
      </form>
      <Tableau lignes={lignes} vide="Aucun plan préventif." colonnes={[
        { titre: "Équipement", valeur: (p) => p.equipement_nom }, { titre: "Opération", valeur: (p) => p.titre },
        { titre: "Tous les (jours)", valeur: (p) => p.periodicite_jours, nombre: true }, { titre: "Prochaine échéance", valeur: (p) => p.prochaine_date }]} />
    </>
  );
}
