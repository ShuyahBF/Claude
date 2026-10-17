import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import Anniversaires from "@/pages/Anniversaires";
import Medicaments from "@/pages/Medicaments";
import RappelsPaiements from "@/pages/RappelsPaiements";

// Rappels (lot 62) : UN SEUL menu pour tous les rappels — paiements récurrents, prise de médicaments, anniversaires.
// L'onglet est mémorisé dans l'adresse (?onglet=…) : les anciens liens (/medicaments, /anniversaires, /rappels-paiements),
// les notifications et la carte « Aujourd'hui » y mènent directement.
const ONGLETS = [
  { cle: "paiements", icone: "🔁", libelle: "Paiements", Page: RappelsPaiements },
  { cle: "medicaments", icone: "💊", libelle: "Médicaments", Page: Medicaments },
  { cle: "anniversaires", icone: "🎂", libelle: "Anniversaires", Page: Anniversaires },
];

export default function Rappels() {
  const [params, setParams] = useSearchParams();
  const actif = ONGLETS.find((o) => o.cle === params.get("onglet")) || ONGLETS[0];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Types de rappels" className="boutons-distincts flex flex-wrap gap-2">
        {ONGLETS.map((o) => (
          <button key={o.cle} type="button" role="tab" aria-selected={o.cle === actif.cle}
            className={`${o.cle === actif.cle ? "btn-primary" : "btn-outline"} btn-sm`} onClick={() => setParams({ onglet: o.cle }, { replace: true })}>
            <span aria-hidden="true">{o.icone}</span> {o.libelle}
          </button>
        ))}
      </div>
      <actif.Page />
    </div>
  );
}

// Anciennes adresses → même contenu dans le menu unique
export const Vers = ({ onglet }) => <Navigate to={`/rappels?onglet=${onglet}`} replace state={useLocation().state} />;
