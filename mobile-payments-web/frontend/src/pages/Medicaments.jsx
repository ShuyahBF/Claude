import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Rappels de prise de médicaments (lot 36) : 20 traitements au plus ; liste des prises d'aujourd'hui à cocher.
// Rappel seulement : aucun conseil médical.
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const VIDE = () => ({ medicament: "", dose: "", heures: ["08:00"], debut: aujourdhui(), fin: "", note: "" });
const dateFr = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const STATUT = { en_cours: ["En cours", "bg-green-100 text-green-800"], a_venir: ["À venir", "bg-gray-100 text-gray-700"], termine: ["Terminé", "bg-gray-100 text-gray-500"] };

export default function Medicaments() {
  const toast = useToast();
  const location = useLocation();
  const [donnees, setDonnees] = useState(null);
  const [edition, setEdition] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try { setDonnees((await apiClient.get("/rappels-medicaments")).data); }
    catch (err) { toast.erreur(messageErreur(err, "Liste indisponible")); setDonnees((d) => d || { rappels: [], aujourdhui: [], total: 0, maximum: 20, a_prendre: 0 }); }
  }, [toast]);
  // Arrivée depuis l'OCR d'une ordonnance (lot 39) : le formulaire s'ouvre pré-rempli (nom, dose / posologie)
  useEffect(() => {
    const p = location.state?.prefill;
    if (p) setEdition({ ...VIDE(), medicament: p.medicament || "", dose: p.dose || "" });
  }, [location.state]);
  useEffect(() => { charger(); const t = setInterval(charger, 60000); return () => clearInterval(t); }, [charger]);   // retards remis à jour chaque minute

  const cocher = async (p) => {
    try { await apiClient.post(`/rappels-medicaments/${p.rappel_id}/prises`, { heure: p.heure, pris: !p.pris }); charger(); }
    catch (err) { toast.erreur(messageErreur(err)); }
  };
  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const corps = { medicament: edition.medicament, dose: edition.dose || null, heures: edition.heures, debut: edition.debut, fin: edition.fin || null, note: edition.note || null };
    try {
      if (edition.id) await apiClient.put(`/rappels-medicaments/${edition.id}`, corps); else await apiClient.post("/rappels-medicaments", corps);
      toast.succes("Enregistré"); setEdition(null); charger();
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setEnvoi(false); }
  };
  const supprimer = async (r) => {
    if (!window.confirm(`Supprimer le traitement « ${r.medicament} » ?`)) return;
    try { await apiClient.delete(`/rappels-medicaments/${r.id}`); charger(); } catch (err) { toast.erreur(messageErreur(err)); }
  };

  if (!donnees) return <Chargement />;
  const complet = donnees.total >= donnees.maximum;
  const champ = (cle) => (e) => setEdition({ ...edition, [cle]: e.target.value });
  const changerHeure = (i, v) => setEdition({ ...edition, heures: edition.heures.map((h, k) => (k === i ? v : h)) });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">💊 Prise de médicaments</h1>
          <p className="text-sm text-gray-500" data-testid="compteur">{donnees.total} / {donnees.maximum} traitements</p>
        </div>
        <button type="button" className="btn-primary" disabled={complet} onClick={() => setEdition(VIDE())}>+ Ajouter</button>
      </div>
      <p className="text-xs text-gray-500">Rappel uniquement : suivez toujours l'avis de votre médecin ou de votre pharmacien.</p>

      {/* Prises d'aujourd'hui : on coche au fur et à mesure */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Aujourd'hui</h2>
        {donnees.aujourdhui.length === 0 && <p className="card text-gray-500">Aucune prise prévue aujourd'hui.</p>}
        <ul className="space-y-2" data-testid="prises">
          {donnees.aujourdhui.map((p) => (
            <li key={`${p.rappel_id}-${p.heure}`}>
              <button type="button" onClick={() => cocher(p)} aria-pressed={p.pris}
                className={`card flex w-full items-center gap-3 p-3 text-left ${p.en_retard ? "ring-2 ring-red-500" : ""} ${p.pris ? "opacity-60" : ""}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${p.pris ? "border-green-600 bg-green-600 text-white" : "border-gray-300"}`}>{p.pris ? "✓" : ""}</span>
                <span className="w-14 shrink-0 text-lg font-bold tabular-nums">{p.heure}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold ${p.pris ? "line-through" : ""}`}>{p.medicament}</span>
                  {p.dose && <span className="block truncate text-sm text-gray-500">{p.dose}</span>}
                </span>
                {p.en_retard && <span className="shrink-0 text-xs font-semibold text-red-600">En retard</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Mes traitements</h2>
        {donnees.rappels.length === 0 && <p className="card text-gray-500">Aucun traitement. Ajoutez un médicament et ses heures de prise.</p>}
        <ul className="space-y-2">
          {donnees.rappels.map((r) => (
            <li key={r.id} className="card flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.medicament} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUT[r.statut][1]}`}>{STATUT[r.statut][0]}</span></p>
                <p className="text-sm text-gray-600">{r.dose ? `${r.dose} · ` : ""}{r.heures.join(" · ")}</p>
                <p className="text-xs text-gray-500">Du {dateFr(r.debut)}{r.fin ? ` au ${dateFr(r.fin)}` : " (sans fin)"}</p>
                {r.note && <p className="truncate text-xs text-gray-500">{r.note}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="btn-outline btn-sm" aria-label={`Modifier ${r.medicament}`}
                  onClick={() => setEdition({ ...r, dose: r.dose || "", fin: r.fin || "", note: r.note || "" })}>✏️</button>
                <button type="button" className="btn-outline btn-sm" aria-label={`Supprimer ${r.medicament}`} onClick={() => supprimer(r)}>🗑</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Modal ouvert={!!edition} titre={edition?.id ? "Modifier le traitement" : "Nouveau traitement"} onFermer={() => setEdition(null)}>
        {edition && (
          <form onSubmit={enregistrer} className="space-y-3">
            <div><label className="label" htmlFor="md-nom">Médicament</label>
              <input id="md-nom" className="input" required maxLength={60} value={edition.medicament} onChange={champ("medicament")} autoFocus /></div>
            <div><label className="label" htmlFor="md-dose">Dose <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="md-dose" className="input" maxLength={40} placeholder="Ex. 1 comprimé" value={edition.dose} onChange={champ("dose")} /></div>
            <div>
              <p className="label">Heures de prise <span className="font-normal text-gray-400">(6 au plus)</span></p>
              <div className="space-y-2">
                {edition.heures.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input" type="time" required value={h} onChange={(e) => changerHeure(i, e.target.value)} aria-label={`Heure ${i + 1}`} />
                    {edition.heures.length > 1 && <button type="button" className="btn-outline btn-sm" aria-label={`Retirer l'heure ${i + 1}`}
                      onClick={() => setEdition({ ...edition, heures: edition.heures.filter((_, k) => k !== i) })}>✕</button>}
                  </div>
                ))}
              </div>
              {edition.heures.length < 6 && <button type="button" className="btn-outline btn-sm mt-2" onClick={() => setEdition({ ...edition, heures: [...edition.heures, "12:00"] })}>+ Ajouter une heure</button>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="md-db">Début</label>
                <input id="md-db" className="input" type="date" required value={edition.debut} onChange={champ("debut")} /></div>
              <div><label className="label" htmlFor="md-fin">Fin <span className="font-normal text-gray-400">(facultatif)</span></label>
                <input id="md-fin" className="input" type="date" min={edition.debut} value={edition.fin} onChange={champ("fin")} /></div>
            </div>
            <div><label className="label" htmlFor="md-nt">Note <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="md-nt" className="input" maxLength={120} placeholder="Ex. Après le repas" value={edition.note} onChange={champ("note")} /></div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setEdition(null)}>Annuler</button>
              <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Patientez…" : "Enregistrer"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
