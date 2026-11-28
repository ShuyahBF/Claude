import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";

const LIBELLES = { demande: "Demandes", planifiee: "Planifiées", en_cours: "En cours", terminee: "Terminées", annulee: "Annulées" };

export default function TableauDeBord() {
  const [t, setT] = useState(null);
  const [erreur, setErreur] = useState("");
  const charger = useCallback(async () => { setT(await api("/tableau")); setErreur(""); return 1; }, []);
  useEffect(() => { charger().catch((e) => setErreur(e.message)); }, [charger]);
  return (
    <>
      <Entete titre="Tableau De Bord" charger={charger} unite="indicateur(s)" />
      {erreur && <p className="erreur">{erreur}</p>}
      {t && <>
        <div className="kpis">
          {Object.entries(LIBELLES).map(([k, l]) => <div className="kpi" key={k}><b>{t.interventions_par_statut[k] || 0}</b><span>{l}</span></div>)}
          <div className="kpi alerte"><b>{t.urgentes_ouvertes}</b><span>Urgentes ouvertes</span></div>
          <div className="kpi"><b>{t.mttr_heures ?? "—"}</b><span>MTTR (heures)</span></div>
          <div className="kpi"><b>{t.equipements.en_panne}/{t.equipements.total}</b><span>Équipements en panne</span></div>
          <div className="kpi"><b>{t.cout_total.toLocaleString("fr-FR")}</b><span>Coût total (FCFA)</span></div>
          <div className="kpi"><b>{t.preventif_en_retard}</b><span>Préventif en retard</span></div>
        </div>
        <h2>Pièces sous le seuil d'alerte</h2>
        <Tableau vide="Aucune pièce sous le seuil." lignes={t.pieces_sous_seuil} colonnes={[
          { titre: "Code", valeur: (p) => p.code }, { titre: "Pièce", valeur: (p) => p.nom },
          { titre: "Stock", valeur: (p) => p.stock, nombre: true }, { titre: "Seuil", valeur: (p) => p.seuil, nombre: true }]} />
      </>}
    </>
  );
}
