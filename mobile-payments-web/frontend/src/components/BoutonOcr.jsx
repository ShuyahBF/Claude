import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Patientez from "@/components/Patientez";
import { apiClient, messageErreur } from "@/lib/api";
import { reduireImage } from "@/lib/image";

// Bouton « photo → lecture OCR » (lot 39), partagé par la page Marchands (plaques) et la page Ordonnances.
//   - ouvre l'appareil photo (téléphone) ou le choix d'un fichier (ordinateur) ;
//   - réduit la photo puis l'envoie à /api/ocr (SAWALI contrôle l'abonnement et lit l'image) ;
//   - SANS abonnement actif : la lecture est refusée et le message donne le nom et le PRIX de la formule, avec un lien vers l'Abonnement ;
//   - onResultat(données, fichierOriginal) reçoit la lecture nettoyée.
// Props : type = "plaque_marchand" | "ordonnance" ; libelle ; className du bouton.
export default function BoutonOcr({ type, libelle, className = "btn-outline", onResultat }) {
  const champ = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState(null);   // { message, formule } si abonnement requis
  const [erreur, setErreur] = useState("");

  const choisi = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";                      // permet de reprendre la même photo
    if (!fichier) return;
    setEnvoi(true); setRefus(null); setErreur("");
    try {
      const image = await reduireImage(fichier);
      const { data } = await apiClient.post("/ocr", { type, image }, { timeout: 120000 });
      await onResultat(data, fichier);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object") setRefus(detail);   // abonnement requis
      else setErreur(messageErreur(err, "Lecture impossible : refaites la photo, bien nette et de face."));
    } finally { setEnvoi(false); }
  };

  return (
    <div className="space-y-2">
      <Patientez actif={envoi} />
      <input ref={champ} type="file" accept="image/*" capture="environment" className="hidden" onChange={choisi} />
      <button type="button" className={className} disabled={envoi} onClick={() => champ.current?.click()}>
        {envoi ? "Patientez… lecture en cours" : libelle}
      </button>
      {refus && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="ocr-refus">
          <p>{refus.message}</p>
          {refus.formule && <Link to="/abonnement" className="mt-1 inline-block font-semibold text-primary underline">Voir l'abonnement</Link>}
        </div>
      )}
      {erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erreur}</p>}
    </div>
  );
}
