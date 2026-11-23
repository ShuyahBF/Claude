// Détails d'une ligne de SMS (lot 217) : MOTIF, détail des achats et PHOTOS de tickets / factures pour une dépense ; MOTIF (et note) pour un paiement reçu.
// Fenêtre modale ; rien n'est enregistré avant le clic sur « Enregistrer » (actif seulement si quelque chose a changé, avec la mention « modifié, non enregistré »).
// Les détails sont gardés dans la ligne, SUR le téléphone (avec la sauvegarde chiffrée) ; les photos dans IndexedDB (lib/piecesSms.js).
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import CalculetteMontant from "@/components/CalculetteMontant";
import { ARTICLES_MAX, CATEGORIES_RUBRIQUE, DETAILS_MAX, MOTIFS_DEPENSE, MOTIFS_RECETTE, MOTIF_MAX, PIECES_MAX, normaliserArticles, totalArticles } from "@/lib/budget";
import { ajouterPiece, lirePiece, supprimerPiece } from "@/lib/piecesSms";

const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
const AUTRE = "Autre…";

/** Vignette d'une pièce (lue dans IndexedDB) ; clic = ouverture en grand dans un nouvel onglet. */
function Vignette({ piece, onRetirer }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let a = "";
    lirePiece(piece.id).then((b) => { if (b) { a = URL.createObjectURL(b); setUrl(a); } }).catch(() => {});
    return () => { if (a) URL.revokeObjectURL(a); };
  }, [piece.id]);
  return (
    <li className="relative">
      {url ? <a href={url} target="_blank" rel="noreferrer" title="Ouvrir la photo en grand"><img src={url} alt={piece.nom} className="h-20 w-20 rounded-lg border border-gray-200 object-cover" /></a>
           : <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">Photo absente</div>}
      <span className="block max-w-[5rem] truncate text-center text-[11px] text-gray-600">{piece.nom}</span>
      <button type="button" onClick={onRetirer} className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white" title="Retirer cette photo" aria-label={`Retirer la photo ${piece.nom}`}>✕</button>
    </li>
  );
}

export default function DetailsLigneSms({ ligne, onFermer, onEnregistrer }) {
  const toast = useToast();
  const depense = ligne?.genre !== "RECETTE";
  const liste = depense ? MOTIFS_DEPENSE : MOTIFS_RECETTE;
  const [motif, setMotif] = useState("");
  const [details, setDetails] = useState("");
  const [pieces, setPieces] = useState([]);
  const [articles, setArticles] = useState([]);                 // rubriques de la dépense : { rubrique, montant, categorie }
  const [calcul, setCalcul] = useState(null);                   // index de la rubrique dont on calcule le montant
  const [type, setType] = useState("Ticket de caisse");
  const [occupe, setOccupe] = useState(false);
  const [libre, setLibre] = useState(false);                 // « Autre… » : saisie libre du motif
  const photo = useRef(null), fichier = useRef(null);
  // Chargement à l'ouverture (ou quand on change de ligne)
  useEffect(() => { if (ligne) { setMotif(ligne.motif || ""); setDetails(ligne.details || ""); setPieces(ligne.pieces || []); setArticles((ligne.articles || []).map((a) => ({ ...a }))); setLibre(!!ligne.motif && !liste.includes(ligne.motif)); } }, [ligne]);  // eslint-disable-line
  if (!ligne) return null;
  // Un motif déjà enregistré mais absent de la liste s'affiche en saisie libre (« Autre… ») : jamais de perte à l'édition
  const modifie = motif !== (ligne.motif || "") || details !== (ligne.details || "") || JSON.stringify(pieces) !== JSON.stringify(ligne.pieces || []) || JSON.stringify(normaliserArticles(articles)) !== JSON.stringify(ligne.articles || []);

  const choisir = async (f) => {
    if (!f) return;
    if (pieces.length >= PIECES_MAX) { toast.erreur(`${PIECES_MAX} photos au plus par paiement.`); return; }
    setOccupe(true);
    try { const p = await ajouterPiece(f, type); setPieces((l) => [...l, p]); toast.succes("Photo ajoutée : cliquez sur « Enregistrer » pour la garder avec ce paiement."); }
    catch { toast.erreur("Photo impossible à garder sur ce téléphone."); } finally { setOccupe(false); }
  };
  const retirer = (p) => setPieces((l) => l.filter((x) => x.id !== p.id));
  const enregistrer = async () => {
    // Les photos retirées ne sont effacées du téléphone qu'à l'enregistrement (on peut renoncer en fermant)
    const gardees = new Set(pieces.map((p) => p.id));
    await Promise.all((ligne.pieces || []).filter((p) => !gardees.has(p.id)).map((p) => supprimerPiece(p.id).catch(() => {})));
    onEnregistrer({ motif, details, pieces, articles });
    toast.succes("Détails enregistrés sur ce téléphone");
    onFermer();
  };
  // Fermer sans enregistrer : les photos ajoutées dans cette fenêtre sont oubliées
  const fermer = async () => {
    const avant = new Set((ligne.pieces || []).map((p) => p.id));
    await Promise.all(pieces.filter((p) => !avant.has(p.id)).map((p) => supprimerPiece(p.id).catch(() => {})));
    onFermer();
  };

  return (
    <>
    <Modal ouvert titre={depense ? "Détails de la dépense" : "Motif du paiement reçu"} onFermer={fermer}>
      <div className="space-y-3 text-sm" data-testid="details-ligne-sms">
        <p className="rounded-lg bg-gray-50 p-2">
          <b className={depense ? "text-red-700" : "text-green-700"}>{depense ? "↑ Payé" : "↓ Reçu"} {fcfa(ligne.montant)}</b>
          <span className="block text-xs text-gray-600">{ligne.adresse} · {new Date(ligne.quand).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}{ligne.tiers ? ` · ${ligne.tiers}` : ""}</span>
        </p>
        <div>
          <label className="label" htmlFor="ds-motif">Motif</label>
          <select id="ds-motif" className="input" value={libre ? AUTRE : motif} onChange={(e) => { if (e.target.value === AUTRE) { setLibre(true); if (liste.includes(motif)) setMotif(""); } else { setLibre(false); setMotif(e.target.value); } }}>
            <option value="">— Choisir —</option>
            {liste.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {libre && <input className="input mt-2" maxLength={MOTIF_MAX} placeholder="Votre motif" aria-label="Motif libre" value={motif} onChange={(e) => setMotif(e.target.value)} autoFocus />}
        </div>
        {depense && (
          <div className="space-y-2" data-testid="rubriques-ligne">
            <p className="label">Détail des achats (rubrique, montant, catégorie)</p>
            {articles.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full min-w-[26rem] text-xs">
                <thead><tr className="text-left text-gray-600"><th className="p-1">Rubrique</th><th className="p-1 text-right">Montant (FCFA)</th><th className="p-1">Catégorie</th><th className="p-1" /></tr></thead>
                <tbody>
                  {articles.map((a, i) => (
                    <tr key={i}>
                      <td className="p-1"><input className="input" maxLength={80} aria-label={`Rubrique ${i + 1}`} placeholder="Ex. : riz 25 kg" value={a.rubrique} onChange={(e) => setArticles((l) => l.map((x, k) => (k === i ? { ...x, rubrique: e.target.value } : x)))} /></td>
                      <td className="p-1"><div className="flex gap-1"><input className="input min-w-0 text-right tabular-nums" inputMode="numeric" aria-label={`Montant ${i + 1}`} value={a.montant ? Number(a.montant).toLocaleString("fr-FR") : ""} onChange={(e) => setArticles((l) => l.map((x, k) => (k === i ? { ...x, montant: e.target.value.replace(/\D/g, "") } : x)))} />
                        <button type="button" className="rounded-lg border border-gray-300 px-2" onClick={() => setCalcul(i)} title="Calculer le montant" aria-label={`Calculette pour la rubrique ${i + 1}`}>🧮</button></div></td>
                      <td className="p-1"><select className="input" aria-label={`Catégorie ${i + 1}`} value={a.categorie || ""} onChange={(e) => setArticles((l) => l.map((x, k) => (k === i ? { ...x, categorie: e.target.value } : x)))}>
                        <option value="">—</option>{CATEGORIES_RUBRIQUE.map((c) => <option key={c} value={c}>{c}</option>)}{a.categorie && !CATEGORIES_RUBRIQUE.includes(a.categorie) && <option value={a.categorie}>{a.categorie}</option>}</select></td>
                      <td className="p-1"><button type="button" className="rounded-lg border border-red-200 px-2 py-1 text-red-700" onClick={() => setArticles((l) => l.filter((_, k) => k !== i))} title="Retirer cette rubrique" aria-label={`Retirer la rubrique ${i + 1}`}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t font-semibold"><td className="p-1">{articles.length} rubrique(s)</td><td className="p-1 text-right tabular-nums" data-testid="total-rubriques">{totalArticles(normaliserArticles(articles)).toLocaleString("fr-FR")}</td><td colSpan={2} className="p-1 text-gray-600">
                  {(() => { const e = ligne.montant - totalArticles(normaliserArticles(articles)); return e === 0 ? "✅ égal au paiement" : e > 0 ? `reste ${e.toLocaleString("fr-FR")} à détailler` : `⚠️ ${(-e).toLocaleString("fr-FR")} de plus que le paiement`; })()}</td></tr></tfoot>
              </table></div>
            )}
            <button type="button" className="btn-secondary" disabled={articles.length >= ARTICLES_MAX} onClick={() => setArticles((l) => [...l, { rubrique: "", montant: "", categorie: "" }])}>➕ Ajouter une rubrique</button>
          </div>
        )}
        <div>
          <label className="label" htmlFor="ds-details">Note (facultatif)</label>
          <textarea id="ds-details" className="input min-h-[4rem]" maxLength={DETAILS_MAX} value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder={depense ? "Ex. : achats du week-end chez le grossiste" : "Ex. : paie d'octobre, remboursement de Awa…"} />
        </div>
        {depense && (
          <div className="space-y-2" data-testid="pieces-ligne">
            <p className="label">Photos de ticket ou de facture ({pieces.length} / {PIECES_MAX})</p>
            {pieces.length > 0 && <ul className="flex flex-wrap gap-3">{pieces.map((p) => <Vignette key={p.id} piece={p} onRetirer={() => retirer(p)} />)}</ul>}
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-auto" aria-label="Type de pièce" value={type} onChange={(e) => setType(e.target.value)}>
                {["Ticket de caisse", "Facture", "Reçu", "Liste de courses", "Autre pièce"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <button type="button" className="btn-secondary" disabled={occupe || pieces.length >= PIECES_MAX} onClick={() => photo.current?.click()} title="Prendre une photo avec l'appareil">📷 Photographier</button>
              <button type="button" className="btn-secondary" disabled={occupe || pieces.length >= PIECES_MAX} onClick={() => fichier.current?.click()} title="Choisir une image de la galerie">🖼️ Galerie</button>
              <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={fichier} type="file" accept="image/*" className="hidden" onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <p className="text-xs text-gray-500">Les photos restent sur ce téléphone (réduites), jamais envoyées à auRor.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <button type="button" className="btn-primary" disabled={!modifie || occupe} onClick={enregistrer}>💾 Enregistrer</button>
          <button type="button" className="btn-secondary" onClick={fermer}>✖ Fermer</button>
          {modifie && <span className="text-xs font-semibold text-amber-700">modifié, non enregistré</span>}
        </div>
      </div>
    </Modal>
    <CalculetteMontant ouvert={calcul !== null} titre="Montant de la rubrique" initial={calcul !== null ? articles[calcul]?.montant || "" : ""} onFermer={() => setCalcul(null)}
        onValider={(v) => { setArticles((l) => l.map((x, k) => (k === calcul ? { ...x, montant: String(v) } : x))); setCalcul(null); }} />
    </>
  );
}
