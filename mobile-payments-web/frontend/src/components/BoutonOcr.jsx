import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Patientez from "@/components/Patientez";
import { apiClient, messageErreur } from "@/lib/api";
import { reduireImage } from "@/lib/image";
import { estPdf, pdfPremierePage } from "@/lib/pdf";   // lot 84 : ordonnance au format PDF

// Bouton « photo → lecture OCR » (lot 39), partagé par la page Marchands (plaques) et la page Ordonnances.
//   - ouvre l'appareil photo (téléphone) ou le choix d'un fichier (ordinateur) ;
//   - réduit la photo puis l'envoie à /api/ocr (SAWALI contrôle l'abonnement et lit l'image) ;
//   - SANS abonnement actif : la lecture est refusée et le message donne le nom et le PRIX de la formule, avec un lien vers l'Abonnement ;
//   - onResultat(données, fichierOriginal) reçoit la lecture nettoyée.
// Props : type = "plaque_marchand" | "ordonnance" ; libelle ; className du bouton ;
// accepterPdf (lot 84) : l'import accepte aussi un PDF (première page lue) ;
// importer (lot 83) : ajoute « Importer un fichier » (image déjà enregistrée : galerie, téléchargements…) à côté de la prise de photo.
export default function BoutonOcr({ type, libelle, className = "btn-outline", onResultat, importer = false, accepterPdf = false }) {
  const champ = useRef(null);
  const champFichier = useRef(null);   // import d'un fichier existant (sans appareil photo)
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState(null);   // { message, formule } si abonnement requis
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");      // lot 84 : PDF de plusieurs pages (seule la première est lue)

  const choisi = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";                      // permet de reprendre la même photo
    if (!fichier) return;
    setEnvoi(true); setRefus(null); setErreur(""); setInfo("");
    try {
      let image;
      if (estPdf(fichier)) {
        // PDF : la première page est dessinée en image (bibliothèque chargée seulement à ce moment)
        const pdf = await pdfPremierePage(fichier);
        image = pdf.image;
        if (pdf.pages > 1) setInfo(`Ce PDF a ${pdf.pages} pages : seule la première page est lue. Importez les autres pages une à une si besoin.`);
      } else image = await reduireImage(fichier);
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
      <input ref={champFichier} type="file" accept={accepterPdf ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp"} className="hidden" onChange={choisi} data-testid="ocr-import" />
      <button type="button" className={className} disabled={envoi} onClick={() => champ.current?.click()}>
        {envoi ? "Patientez… lecture en cours" : libelle}
      </button>
      {importer && !envoi && (
        <button type="button" className="btn-outline w-full" onClick={() => champFichier.current?.click()}>📁 {accepterPdf ? "Importer un fichier (image ou PDF)" : "Importer un fichier (image)"}</button>
      )}
      {refus && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="ocr-refus">
          <p>{refus.message}</p>
          {refus.formule && <Link to="/abonnement" className="mt-1 inline-block font-semibold text-primary underline">Voir l'abonnement</Link>}
        </div>
      )}
      {info && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900" data-testid="ocr-info">{info}</p>}
      {erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erreur}</p>}
    </div>
  );
}
