import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, fcfa, messageErreur } from "@/lib/api";

// Rappels de paiements récurrents (lot 36) : loyer, électricité, abonnement… 30 rappels au plus.
// Le site ne paie rien : il rappelle l'échéance ; « Payé » avance à la période suivante.
const FREQUENCES = [["unique", "Une seule fois"], ["hebdomadaire", "Chaque semaine"], ["mensuel", "Chaque mois"],
  ["trimestriel", "Chaque trimestre"], ["annuel", "Chaque année"]];
const RAPPELS = [[0, "Le jour même"], [1, "1 jour avant"], [3, "3 jours avant"], [7, "7 jours avant"]];
const OPERATEURS = ["Orange", "Moov", "Telecel"];
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const VIDE = () => ({ libelle: "", montant: "", operateur: "", frequence: "mensuel", echeance: aujourdhui(), rappel_jours: 1, note: "" });

const dateFr = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const etat = (r) => (r.etat === "retard" ? [`En retard de ${-r.dans_jours} jour${-r.dans_jours > 1 ? "s" : ""}`, "text-red-600 font-semibold"]
  : r.etat === "aujourdhui" ? ["Aujourd'hui", "text-primary font-semibold"]
  : r.dans_jours === 1 ? ["Demain", "text-primary font-semibold"] : [`dans ${r.dans_jours} jours`, "text-gray-600"]);

export default function RappelsPaiements() {
  const toast = useToast();
  const [donnees, setDonnees] = useState(null);
  const [edition, setEdition] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try { setDonnees((await apiClient.get("/rappels-paiements")).data); }
    catch (err) { toast.erreur(messageErreur(err, "Liste indisponible")); setDonnees((d) => d || { rappels: [], total: 0, maximum: 30, a_traiter: 0 }); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const corps = { libelle: edition.libelle, montant: edition.montant ? Number(edition.montant) : null, operateur: edition.operateur || null,
      frequence: edition.frequence, echeance: edition.echeance, rappel_jours: Number(edition.rappel_jours), note: edition.note || null };
    try {
      if (edition.id) await apiClient.put(`/rappels-paiements/${edition.id}`, corps); else await apiClient.post("/rappels-paiements", corps);
      toast.succes("Enregistré"); setEdition(null); charger();
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setEnvoi(false); }
  };
  const paye = async (r) => {
    try { const { data } = await apiClient.post(`/rappels-paiements/${r.id}/paye`);
      toast.succes(data.termine ? "Rappel terminé" : `Prochaine échéance : ${dateFr(data.echeance)}`); charger(); }
    catch (err) { toast.erreur(messageErreur(err)); }
  };
  const supprimer = async (r) => {
    if (!window.confirm(`Supprimer le rappel « ${r.libelle} » ?`)) return;
    try { await apiClient.delete(`/rappels-paiements/${r.id}`); charger(); } catch (err) { toast.erreur(messageErreur(err)); }
  };

  if (!donnees) return <Chargement />;
  const complet = donnees.total >= donnees.maximum;
  const champ = (cle) => (e) => setEdition({ ...edition, [cle]: e.target.value });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🔁 Rappels de paiements</h1>
          <p className="text-sm text-gray-500" data-testid="compteur">{donnees.total} / {donnees.maximum} rappels</p>
        </div>
        <button type="button" className="btn-primary" disabled={complet} onClick={() => setEdition(VIDE())}>+ Ajouter</button>
      </div>
      {donnees.a_traiter > 0 && <p className="rounded-lg bg-primary p-3 text-sm font-semibold text-white">
        🔔 {donnees.a_traiter} paiement{donnees.a_traiter > 1 ? "s" : ""} à régler</p>}
      {donnees.rappels.length === 0 && <p className="card text-gray-500">Aucun rappel. Ajoutez le loyer, l'électricité, un abonnement… pour ne plus oublier une échéance.</p>}
      <ul className="space-y-2">
        {donnees.rappels.map((r) => {
          const [texte, classe] = etat(r);
          return (
            <li key={r.id} className={`card space-y-2 p-3 ${r.a_traiter ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.libelle}{r.montant ? <span className="font-normal text-gray-600"> · {fcfa(r.montant)}</span> : null}</p>
                  <p className="text-sm text-gray-500">{dateFr(r.echeance)} · {FREQUENCES.find(([v]) => v === r.frequence)?.[1]}{r.operateur ? ` · ${r.operateur}` : ""}</p>
                  <p className={`text-sm ${classe}`}>{texte}</p>
                  {r.note && <p className="truncate text-xs text-gray-500">{r.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-outline btn-sm" aria-label={`Modifier ${r.libelle}`}
                    onClick={() => setEdition({ ...r, montant: r.montant ? String(r.montant) : "", operateur: r.operateur || "", note: r.note || "" })}>✏️</button>
                  <button type="button" className="btn-outline btn-sm" aria-label={`Supprimer ${r.libelle}`} onClick={() => supprimer(r)}>🗑</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/" className="btn-primary btn-sm">💳 Payer</Link>
                <button type="button" className="btn-outline btn-sm" onClick={() => paye(r)}>✅ Marquer payé</button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal ouvert={!!edition} titre={edition?.id ? "Modifier le rappel" : "Nouveau rappel de paiement"} onFermer={() => setEdition(null)}>
        {edition && (
          <form onSubmit={enregistrer} className="space-y-3">
            <div><label className="label" htmlFor="rp-lib">Libellé</label>
              <input id="rp-lib" className="input" required maxLength={60} placeholder="Ex. Loyer, Électricité…" value={edition.libelle} onChange={champ("libelle")} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="rp-mt">Montant <span className="font-normal text-gray-400">(FCFA, facultatif)</span></label>
                <input id="rp-mt" className="input" type="number" inputMode="numeric" min={1} value={edition.montant} onChange={champ("montant")} /></div>
              <div><label className="label" htmlFor="rp-op">Opérateur <span className="font-normal text-gray-400">(facultatif)</span></label>
                <select id="rp-op" className="input" value={edition.operateur} onChange={champ("operateur")}>
                  <option value="">—</option>
                  {[...new Set([...OPERATEURS, ...(edition.operateur ? [edition.operateur] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="rp-fq">Fréquence</label>
                <select id="rp-fq" className="input" required value={edition.frequence} onChange={champ("frequence")}>
                  {FREQUENCES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
              <div><label className="label" htmlFor="rp-ec">Prochaine échéance</label>
                <input id="rp-ec" className="input" type="date" required value={edition.echeance} onChange={champ("echeance")} /></div>
            </div>
            <div><label className="label" htmlFor="rp-rj">Me le rappeler</label>
              <select id="rp-rj" className="input" value={edition.rappel_jours} onChange={champ("rappel_jours")}>
                {RAPPELS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
            <div><label className="label" htmlFor="rp-nt">Note <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="rp-nt" className="input" maxLength={120} value={edition.note} onChange={champ("note")} /></div>
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
