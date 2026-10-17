import { useLocation } from "react-router-dom";
import { ENTREES_MENU } from "@/components/MenuLateral";

// Descriptions des services du menu latéral pas encore ouverts (lot 33 : le menu est en place, les services arrivent un par un).
const DESCRIPTIONS = {
  "/pharmacies-de-garde": "La liste des pharmacies de garde de votre ville, mise à jour chaque semaine.",
  "/anniversaires": "Enregistrez les anniversaires de vos proches : un rappel vous est montré pour les souhaiter.",
  "/rappels-paiements": "Programmez vos paiements récurrents (loyer, électricité, abonnement…) : un rappel avant chaque échéance.",
  "/medicaments": "Programmez les heures de prise de vos médicaments et recevez un rappel.",
  "/ordonnances": "Photographiez une ordonnance : le texte est lu automatiquement (service déjà disponible dans SAWALI).",
  "/breves": "Les brèves de l'actualité, en quelques lignes.",
  "/presse": "Le résumé des principaux sites de presse locale.",
};

// Page d'attente d'un service du menu latéral : titre, description, mention « bientôt disponible ».
export default function Bientot() {
  const { pathname } = useLocation();
  const entree = ENTREES_MENU.find((e) => e.to === pathname);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{entree?.icone} {entree?.libelle}</h1>
      <p className="text-gray-700">{DESCRIPTIONS[pathname]}</p>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ce service sera bientôt disponible.</p>
    </div>
  );
}
