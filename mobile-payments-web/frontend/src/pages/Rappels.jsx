import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import Anniversaires from "@/pages/Anniversaires";
import Medicaments from "@/pages/Medicaments";
import RappelsPaiements from "@/pages/RappelsPaiements";

// Rappels (lots 62-63) : UN SEUL menu « Rappels » avec trois sous-menus — paiements récurrents, prise de médicaments, anniversaires.
// Le type est mémorisé dans l'adresse (?onglet=…) : les anciens liens (/medicaments, /anniversaires, /rappels-paiements),
// les notifications et la carte « Aujourd'hui » y mènent directement.
const ONGLETS = [
  { cle: "paiements", icone: "🔁", libelle: "Paiements", Page: RappelsPaiements },
  { cle: "medicaments", icone: "💊", libelle: "Médicaments", Page: Medicaments },
  { cle: "anniversaires", icone: "🎂", libelle: "Anniversaires", Page: Anniversaires },
];

export default function Rappels() {
  const [params] = useSearchParams();
  const actif = ONGLETS.find((o) => o.cle === params.get("onglet")) || ONGLETS[0];
  // Le choix se fait dans les sous-menus de « Rappels » du menu latéral ; la page affiche seulement le type choisi
  return <actif.Page />;
}

// Anciennes adresses → même contenu dans le menu unique
export const Vers = ({ onglet }) => <Navigate to={`/rappels?onglet=${onglet}`} replace state={useLocation().state} />;
