import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";
import { useMoi } from "../App.jsx";
import Modal from "../components/Modal.jsx";

const STATUTS = { demande: "Demande", planifiee: "Planifiée", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée" };

export default function Interventions() {
  const { lignes, charger, erreur } = useListe("/interventions");
  const moi = useMoi(); const toast = useToast();
  const [equipements, setEquipements] = useState([]);
  const [techniciens, setTechniciens] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [f, setF] = useState({ equipement_id: "", titre: "", priorite: "normale", arret_production: false });
  const [cloture, setCloture] = useState(null);   // intervention en cours de clôture
  const technique = moi.role !== "demandeur";

  useEffect(() => {
    api("/equipements").then(setEquipements).catch(() => {});
    if (technique) {
      api("/utilisateurs").then((u) => setTechniciens(u.filter((x) => x.role !== "demandeur"))).catch(() => {});
      api("/pieces").then(setPieces).catch(() => {});
    }
  }, [technique]);

  const agir = async (ot, action, corps) => {
    try { await api(`/interventions/${ot.id}/${action}`, { methode: "POST", corps }); toast(`${ot.numero} : ${action} effectué.`, "ok"); setCloture(null); charger(); }
    catch (e) { toast(e.message, "erreur"); }
  };
  const demander = async (e) => {
    e.preventDefault();
    try { await api("/interventions", { methode: "POST", corps: f }); toast("Demande enregistrée.", "ok"); setF({ ...f, titre: "" }); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  return (
    <>
      <Entete titre="Interventions" charger={charger} unite="intervention(s)" />
      {erreur && <p className="erreur">{erreur}</p>}
      <form className="ligne-form" onSubmit={demander}>
        <select value={f.equipement_id} onChange={(e) => setF({ ...f, equipement_id: e.target.value })} required>
          <option value="">— Équipement —</option>{equipements.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.nom}</option>)}</select>
        <input placeholder="Panne ou travail à faire" value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} required minLength={3} />
        <select value={f.priorite} onChange={(e) => setF({ ...f, priorite: e.target.value })}>
          {["basse", "normale", "haute", "urgente"].map((p) => <option key={p} value={p}>Priorité {p}</option>)}</select>
        <label><input type="checkbox" checked={f.arret_production} onChange={(e) => setF({ ...f, arret_production: e.target.checked })} /> Arrêt de production</label>
        <button className="primaire">➕ Déclarer</button>
      </form>
      <Tableau lignes={lignes} vide="Aucune intervention." colonnes={[
        { titre: "N°", valeur: (o) => o.numero, rendu: (o) => <b className="ref">{o.numero}</b> }, { titre: "Équipement", valeur: (o) => o.equipement_code },
        { titre: "Titre", valeur: (o) => o.titre }, { titre: "Priorité", valeur: (o) => o.priorite, rendu: (o) => <span className={`badge p-${o.priorite}`}>{o.priorite === "urgente" ? "🔥 " : ""}{o.priorite}</span> },
        { titre: "Statut", valeur: (o) => STATUTS[o.statut], rendu: (o) => <span className={`badge s-${o.statut}`}>{STATUTS[o.statut]}</span> }, { titre: "Créée le", valeur: (o) => o.cree_le, rendu: (o) => o.cree_le.slice(0, 10) },
        { titre: "Coût (FCFA)", valeur: (o) => o.cout_total, nombre: true, rendu: (o) => o.cout_total != null ? <span className="ok-texte">{o.cout_total.toLocaleString("fr-FR")}</span> : "—" },
        { titre: "Actions", action: true, valeur: () => null, rendu: (o) => !technique ? null : (
          <span className="actions">
            {o.statut === "demande" && <select defaultValue="" onChange={(e) => e.target.value && agir(o, "planifier", { technicien_id: e.target.value })}>
              <option value="">Affecter à…</option>{techniciens.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}</select>}
            {["demande", "planifiee"].includes(o.statut) && <button onClick={() => agir(o, "demarrer")}>▶ Démarrer</button>}
            {o.statut === "en_cours" && <button onClick={() => setCloture({ ot: o, rapport: "", main_oeuvre: 0, piece_id: "", quantite: 1, pieces: [] })}>✅ Clôturer</button>}
            {["demande", "planifiee", "en_cours"].includes(o.statut) && <button onClick={() => agir(o, "annuler")}>✖</button>}
          </span>) }]} />
      {cloture && (
        <Modal onFermer={() => setCloture(null)}><form className="carte" onSubmit={(e) => { e.preventDefault(); agir(cloture.ot, "cloturer", { rapport: cloture.rapport, cout_main_oeuvre: Number(cloture.main_oeuvre) || 0, pieces: cloture.pieces }); }}>
          <h2>Clôturer {cloture.ot.numero}</h2>
          <textarea placeholder="Rapport d'intervention" value={cloture.rapport} onChange={(e) => setCloture({ ...cloture, rapport: e.target.value })} required minLength={3} />
          <div className="ligne-form">
            <select value={cloture.piece_id} onChange={(e) => setCloture({ ...cloture, piece_id: e.target.value })}>
              <option value="">— Pièce utilisée —</option>{pieces.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.nom} (stock {p.stock})</option>)}</select>
            <input type="number" min="0.01" step="any" value={cloture.quantite} onChange={(e) => setCloture({ ...cloture, quantite: e.target.value })} />
            <button type="button" onClick={() => cloture.piece_id && setCloture({ ...cloture, pieces: [...cloture.pieces, { piece_id: cloture.piece_id, quantite: Number(cloture.quantite) }], piece_id: "" })}>Ajouter</button>
          </div>
          {cloture.pieces.map((p, i) => <div key={i} className="puce">{pieces.find((x) => x.id === p.piece_id)?.nom} × {p.quantite}</div>)}
          <input type="number" min="0" placeholder="Main d'œuvre (FCFA)" value={cloture.main_oeuvre} onChange={(e) => setCloture({ ...cloture, main_oeuvre: e.target.value })} />
          <div className="actions"><button className="primaire">Valider la clôture</button><button type="button" onClick={() => setCloture(null)}>Annuler</button></div>
        </form></Modal>)}
    </>
  );
}
