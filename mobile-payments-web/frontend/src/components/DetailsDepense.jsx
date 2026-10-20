// Détails d'une dépense (lot 85 — auRor outil de budget) : MOTIF détaillé et PIÈCES scannées (ticket de caisse, facture, reçu,
// liste de courses…), pour un paiement payé ou non. Les pièces sont réduites dans le téléphone (photo ou première page d'un PDF) avant
// l'envoi ; 3 au plus par paiement. Affiché dans la fenêtre d'un paiement de l'Historique.
import { useRef, useState } from "react";
import { apiClient, messageErreur } from "@/lib/api";
import { reduireImage } from "@/lib/image";
import { estPdf, pdfPremierePage } from "@/lib/pdf";
import { useToast } from "@/components/Toast";

const MOTIF_MAX = 500;
const PIECES_MAX = 3;
// Types de pièces proposés (liste finie) : le choix devient le nom de la pièce
const TYPES_PIECE = ["Ticket de caisse", "Facture", "Reçu", "Liste de courses", "Autre pièce"];

export default function DetailsDepense({ paiement, onChange }) {
  const toast = useToast();
  const [motif, setMotif] = useState(paiement.motif || "");
  const [type, setType] = useState(TYPES_PIECE[0]);
  const [occupe, setOccupe] = useState(false);
  const photo = useRef(null);
  const fichier = useRef(null);
  const pieces = paiement.pieces || [];

  const enregistrerMotif = async () => {
    setOccupe(true);
    try {
      const { data } = await apiClient.put(`/paiements/${paiement.id}/details`, { motif });
      onChange(data);
      toast.succes("Motif enregistré");
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };

  // Photo ou fichier choisi → image réduite (PDF : première page) → envoyée au serveur
  const ajouter = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setOccupe(true);
    try {
      const image = estPdf(f) ? (await pdfPremierePage(f, 1400, 0.7)).image : await reduireImage(f, 1400, 0.7);
      const { data } = await apiClient.post(`/paiements/${paiement.id}/pieces`, { image, nom: type });
      onChange(data);
      toast.succes("Pièce ajoutée");
    } catch (err) { toast.erreur(messageErreur(err, "Pièce non ajoutée : reprenez la photo, bien nette")); } finally { setOccupe(false); }
  };

  // L'image n'est chargée qu'à l'ouverture (la liste ne contient jamais le contenu)
  const ouvrir = async (p) => {
    try {
      const { data } = await apiClient.get(`/paiements/${paiement.id}/pieces/${p.id}`, { responseType: "blob" });
      window.open(URL.createObjectURL(data), "_blank");
    } catch (err) { toast.erreur(messageErreur(err, "Ouverture impossible")); }
  };
  const retirer = async (p) => {
    if (!window.confirm(`Supprimer la pièce « ${p.nom} » ?`)) return;
    try { const { data } = await apiClient.delete(`/paiements/${paiement.id}/pieces/${p.id}`); onChange(data); }
    catch (err) { toast.erreur(messageErreur(err, "Suppression impossible")); }
  };

  return (
    <section className="mt-4 space-y-3 border-t border-gray-100 pt-3 text-sm" data-testid="details-depense">
      <h3 className="font-semibold">🧾 Budget : motif et pièces</h3>
      <div>
        <label className="label" htmlFor="motif">Motif détaillé</label>
        <textarea id="motif" className="input min-h-[5rem]" maxLength={MOTIF_MAX} value={motif} onChange={(e) => setMotif(e.target.value)}
          placeholder="ex. Courses de la semaine : riz, huile, savon, lait" />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">{motif.length}/{MOTIF_MAX}</span>
          <button type="button" className="btn-outline btn-sm" disabled={occupe || motif === (paiement.motif || "")} onClick={enregistrerMotif}>Enregistrer le motif</button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="label">Pièces ({pieces.length}/{PIECES_MAX})</p>
        {pieces.length === 0 && <p className="text-xs text-gray-500">Aucune pièce. Scannez le ticket, la facture, le reçu ou la liste de courses.</p>}
        <ul className="space-y-1">
          {pieces.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <button type="button" className="min-w-0 truncate text-left font-medium text-primary underline" onClick={() => ouvrir(p)}>📎 {p.nom}</button>
              <button type="button" className="shrink-0 text-red-600" aria-label={`Supprimer ${p.nom}`} onClick={() => retirer(p)}>🗑</button>
            </li>
          ))}
        </ul>
        {pieces.length < PIECES_MAX && (
          <div className="space-y-2">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de pièce" data-testid="piece-type">
              {TYPES_PIECE.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={ajouter} />
            <input ref={fichier} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={ajouter} data-testid="piece-fichier" />
            <div className="flex gap-2">
              <button type="button" className="btn-outline flex-1" disabled={occupe} onClick={() => photo.current?.click()}>📷 Scanner</button>
              <button type="button" className="btn-outline flex-1" disabled={occupe} onClick={() => fichier.current?.click()}>📁 Importer</button>
            </div>
            {occupe && <p className="text-xs text-gray-500">Patientez…</p>}
          </div>
        )}
      </div>
    </section>
  );
}
