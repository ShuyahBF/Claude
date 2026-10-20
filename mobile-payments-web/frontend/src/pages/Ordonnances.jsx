import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BoutonOcr from "@/components/BoutonOcr";

// OCR sur ordonnances (lot 39) : photo (ou fichier importé : image, lot 83, ou PDF, lot 84) → médicaments, doses et posologies lus par l'IA (réservé aux abonnés de la formule OCR).
// Transcription seulement : aucun conseil médical ; l'utilisateur DOIT relire avec l'ordonnance. Chaque médicament peut
// devenir un rappel de prise (le formulaire des rappels s'ouvre pré-rempli).
export default function Ordonnances() {
  const navigate = useNavigate();
  const [lecture, setLecture] = useState(null);

  const creerRappel = (m) => navigate("/rappels?onglet=medicaments", { state: { prefill: { medicament: m.nom, dose: [m.dose, m.posologie].filter(Boolean).join(" · ").slice(0, 40) } } });
  const dateFr = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">📄 OCR sur ordonnances</h1>
      <p className="text-sm text-gray-600">Photographiez votre ordonnance, bien à plat et de face, ou importez un fichier déjà enregistré (image JPG, PNG, WebP, ou PDF — première page lue) : les médicaments, doses et posologies sont lus automatiquement.</p>
      <BoutonOcr type="ordonnance" libelle="📷 Photographier une ordonnance" className="btn-primary w-full" importer accepterPdf onResultat={(d) => setLecture(d)} />
      <p className="text-xs text-gray-500">Service réservé aux abonnés (<Link to="/abonnement" className="underline">voir l'abonnement</Link>). Transcription seulement : relisez toujours avec l'ordonnance et suivez l'avis de votre médecin ou pharmacien.</p>

      {lecture && (
        <section className="space-y-3" data-testid="ordonnance-lue">
          <div className="card space-y-1 p-4 text-sm">
            {lecture.prescripteur && <p><span className="text-gray-500">Prescripteur : </span><b>{lecture.prescripteur}</b></p>}
            {lecture.date && <p><span className="text-gray-500">Date : </span>{dateFr(lecture.date)}</p>}
            {lecture.patient && <p><span className="text-gray-500">Patient : </span>{lecture.patient}</p>}
            {!lecture.prescripteur && !lecture.date && !lecture.patient && <p className="text-gray-500">Aucune en-tête lisible.</p>}
          </div>
          {lecture.medicaments.length === 0 && <p className="card text-gray-500">Aucun médicament lisible : refaites la photo, bien nette.</p>}
          <ul className="space-y-2">
            {lecture.medicaments.map((m, i) => (
              <li key={i} className="card flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{m.nom}</p>
                  <p className="text-sm text-gray-600">{[m.dose, m.posologie, m.duree].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <button type="button" className="btn-outline btn-sm shrink-0" onClick={() => creerRappel(m)}>⏰ Rappel</button>
              </li>
            ))}
          </ul>
          {lecture.incertains.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Passages incertains : {lecture.incertains.join(", ")}. Vérifiez-les sur l'ordonnance.</p>}
          {lecture.restant_aujourdhui !== null && lecture.restant_aujourdhui !== undefined && <p className="text-xs text-gray-400">Lectures restantes aujourd'hui : {lecture.restant_aujourdhui}</p>}
        </section>
      )}
    </div>
  );
}
