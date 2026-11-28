import { useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";
import { useMoi } from "../App.jsx";

const ETATS = { en_service: "En service", en_panne: "En panne", hors_service: "Hors service" };

export default function Equipements() {
  const { lignes, charger, erreur } = useListe("/equipements");
  const moi = useMoi(); const toast = useToast();
  const [f, setF] = useState({ code: "", nom: "", localisation: "", categorie: "", criticite: "normale" });
  const peutEcrire = moi.role !== "demandeur";
  const ajouter = async (e) => {
    e.preventDefault();
    try { await api("/equipements", { methode: "POST", corps: f }); toast("Équipement ajouté.", "ok"); setF({ ...f, code: "", nom: "" }); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  const changerEtat = async (eq, etat) => { try { await api(`/equipements/${eq.id}`, { methode: "PATCH", corps: { etat } }); charger(); } catch (err) { toast(err.message, "erreur"); } };
  return (
    <>
      <Entete titre="Équipements" charger={charger} unite="équipement(s)" />
      {erreur && <p className="erreur">{erreur}</p>}
      {peutEcrire && <form className="ligne-form" onSubmit={ajouter}>
        <input placeholder="Code (GEN-1)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        <input placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
        <input placeholder="Localisation" value={f.localisation} onChange={(e) => setF({ ...f, localisation: e.target.value })} />
        <input placeholder="Catégorie" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })} />
        <select value={f.criticite} onChange={(e) => setF({ ...f, criticite: e.target.value })}><option value="basse">Criticité basse</option><option value="normale">Criticité normale</option><option value="haute">Criticité haute</option></select>
        <button className="primaire">➕ Ajouter</button>
      </form>}
      <Tableau lignes={lignes} vide="Aucun équipement." colonnes={[
        { titre: "Code", valeur: (e) => e.code }, { titre: "Nom", valeur: (e) => e.nom }, { titre: "Localisation", valeur: (e) => e.localisation },
        { titre: "Catégorie", valeur: (e) => e.categorie }, { titre: "Criticité", valeur: (e) => e.criticite },
        { titre: "État", valeur: (e) => ETATS[e.etat], rendu: (e) => peutEcrire
            ? <select value={e.etat} onChange={(x) => changerEtat(e, x.target.value)}>{Object.entries(ETATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : ETATS[e.etat] }]} />
    </>
  );
}
