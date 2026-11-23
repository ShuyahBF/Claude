// Budget de dépenses dans le Profil (lot 217) : plafond sur une période (jour, semaine, quinzaine, mois, trimestre, an), tous opérateurs confondus.
// L'utilisateur peut le MODIFIER, le DÉSACTIVER (le réglage est conservé) ou le RÉINITIALISER (le compteur repart de zéro maintenant).
// Les dépenses viennent des SMS de paiement lus sur ce téléphone (application Android « direct ») ; rien n'est envoyé au serveur.
// Rien n'est enregistré « en silence » : bouton Enregistrer (actif si modifié, « modifié, non enregistré ») puis toast.
import { useEffect, useState } from "react";
import CalculetteMontant from "@/components/CalculetteMontant";   // lot 218 : calcul / estimation du montant
import GraphiqueSolde from "@/components/GraphiqueSolde";       // lot 218 : évolution du solde et entrées d'argent
import NiveauBudget from "@/components/NiveauBudget";
import { useToast } from "@/components/Toast";
import { EVENEMENT_MAJ } from "@/lib/lectureSms";
import { BUDGET_VIDE, PERIODES, cleOperateur, chargerBudget, enregistrerBudget, libellePeriode, niveauBudget, normaliser, reinitialiser } from "@/lib/budget";
import { chargerLignes } from "@/lib/smsPaiements";

export default function BudgetProfil() {
  const toast = useToast();
  const [budget, setBudget] = useState(chargerBudget);                 // budget enregistré
  const [saisie, setSaisie] = useState(() => ({ ...BUDGET_VIDE, ...chargerBudget() }));   // formulaire (montant en texte)
  const [lignes, setLignes] = useState(() => chargerLignes());
  const [confirmerRaz, setConfirmerRaz] = useState(false);
  const [calculette, setCalculette] = useState(false);
  const [calculOp, setCalculOp] = useState(null);                  // opérateur dont on calcule le plafond (calculette)              // calculette ouverte depuis le champ du montant
  // Les dépenses se mettent à jour quand la lecture automatique des SMS trouve de nouveaux paiements
  useEffect(() => {
    const maj = () => setLignes(chargerLignes());
    window.addEventListener(EVENEMENT_MAJ, maj);
    return () => window.removeEventListener(EVENEMENT_MAJ, maj);
  }, []);

  const montantSaisi = Math.round(Number(String(saisie.montant).replace(/\D/g, "")) || 0);
  // Opérateurs proposés : ceux des SMS lus, ceux qui ont déjà un plafond et les deux opérateurs usuels
  const operateursListe = [...new Set([...Object.keys(budget.operateurs || {}), ...lignes.map((l) => cleOperateur(l.adresse)), "Orange", "Moov Africa"])].filter(Boolean).sort();
  const opsSaisis = Object.fromEntries(Object.entries(saisie.operateurs || {}).map(([k, v]) => [k, Math.round(Number(String(v).replace(/\D/g, "")) || 0)]).filter(([, v]) => v > 0));
  const modifie = montantSaisi !== budget.montant || saisie.periode !== budget.periode || !!saisie.actif !== budget.actif || JSON.stringify(opsSaisis) !== JSON.stringify(budget.operateurs || {});
  const garder = (b, message) => {
    const n = normaliser(b);
    if (!enregistrerBudget(n)) { toast.erreur("Impossible de garder le budget sur ce téléphone."); return; }
    setBudget(n); setSaisie({ ...n }); toast.succes(message);
  };
  const enregistrer = () => {
    if (saisie.actif && montantSaisi <= 0) { toast.erreur("Indiquez un montant supérieur à 0 pour activer le budget."); return; }
    garder({ ...budget, ...saisie, montant: montantSaisi, operateurs: opsSaisis, depuis: saisie.periode !== budget.periode ? budget.depuis : budget.depuis },
      saisie.actif ? `Budget enregistré : ${montantSaisi.toLocaleString("fr-FR")} FCFA ${libellePeriode(saisie.periode).libelle}` : "Budget enregistré (désactivé)");
  };
  const basculer = () => garder({ ...budget, actif: !budget.actif && budget.montant > 0 }, budget.actif ? "Budget désactivé (réglage conservé)" : budget.montant > 0 ? "Budget réactivé" : "Indiquez d'abord un montant");
  const raz = () => { garder(reinitialiser(budget), "Budget réinitialisé : le décompte repart de zéro"); setConfirmerRaz(false); };

  const n = niveauBudget(lignes, budget);
  return (
    <section className="card space-y-3" data-testid="budget-profil">
      <h2 className="text-lg font-bold">💰 Mon budget de dépenses</h2>
      <p className="text-sm text-gray-600">Fixez un plafond de dépenses, tous opérateurs confondus. À chaque paiement préparé, auRor vous montre où vous en êtes et vous prévient si le paiement le ferait dépasser (vous pouvez alors décider de forcer).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="budget-montant">Montant maximum (FCFA)</label>
          <div className="flex gap-2">
            <input id="budget-montant" className="input min-w-0 flex-1 tabular-nums" inputMode="numeric" placeholder="65 000" value={saisie.montant ? Number(montantSaisi).toLocaleString("fr-FR") : ""}
              onChange={(e) => setSaisie({ ...saisie, montant: e.target.value.replace(/\D/g, "") })} />
            <button type="button" className="btn-secondary shrink-0" onClick={() => setCalculette(true)} title="Calculer ou estimer le montant" aria-label="Ouvrir la calculette">🧮 Calculer</button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="budget-periode">Période</label>
          <select id="budget-periode" className="input" value={saisie.periode} onChange={(e) => setSaisie({ ...saisie, periode: e.target.value })}>
            {PERIODES.map((p) => <option key={p.cle} value={p.cle}>{p.libelle}</option>)}
          </select>
        </div>
      </div>
      {/* Budget par opérateur (lot 219) : un plafond facultatif pour chaque opérateur, sur la même période */}
      <div className="space-y-2 rounded-xl bg-gray-50 p-3" data-testid="budget-par-operateur">
        <p className="text-sm font-semibold">💼 Budget par opérateur <span className="font-normal text-gray-500">(facultatif, même période)</span></p>
        {operateursListe.map((op) => (
          <div key={op} className="flex items-center gap-2">
            <label className="w-28 shrink-0 text-sm" htmlFor={`budget-op-${op}`}>{op}</label>
            <input id={`budget-op-${op}`} className="input min-w-0 flex-1 text-right tabular-nums" inputMode="numeric" placeholder="Pas de plafond"
              value={opsSaisis[op] ? opsSaisis[op].toLocaleString("fr-FR") : ""} onChange={(e) => setSaisie((x) => ({ ...x, operateurs: { ...(x.operateurs || {}), [op]: e.target.value.replace(/\D/g, "") } }))} />
            <button type="button" className="rounded-lg border border-gray-300 px-2 py-2" onClick={() => setCalculOp(op)} title={`Calculer le plafond ${op}`} aria-label={`Calculette pour ${op}`}>🧮</button>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!saisie.actif} onChange={(e) => setSaisie({ ...saisie, actif: e.target.checked })} /> Budget activé</label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={!modifie} onClick={enregistrer}>💾 Enregistrer le budget</button>
        {budget.montant > 0 && <button type="button" className="btn-secondary" onClick={basculer}>{budget.actif ? "⏸️ Désactiver" : "▶️ Réactiver"}</button>}
        {budget.montant > 0 && !confirmerRaz && <button type="button" className="btn-secondary" onClick={() => setConfirmerRaz(true)} title="Remet le compteur de dépenses à zéro">🔄 Réinitialiser</button>}
        {modifie && <span className="text-xs font-semibold text-amber-700">modifié, non enregistré</span>}
      </div>
      {confirmerRaz && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>Remettre le compteur à zéro maintenant ? Les paiements déjà faits restent dans l'historique mais ne comptent plus dans ce budget.</p>
          <div className="flex gap-2"><button type="button" className="btn-primary" onClick={raz}>✅ Oui, réinitialiser</button><button type="button" className="btn-secondary" onClick={() => setConfirmerRaz(false)}>✖ Annuler</button></div>
        </div>
      )}
      {budget.montant > 0 && !budget.actif && <p className="text-sm text-gray-500">⏸️ Budget désactivé : {budget.montant.toLocaleString("fr-FR")} FCFA {libellePeriode(budget.periode).libelle} (réglage conservé).</p>}
      <NiveauBudget n={n} detail />
      {n && <GraphiqueSolde lignes={lignes} debut={n.debut} />}
      <CalculetteMontant ouvert={calculOp !== null} titre={`Plafond ${calculOp || ""}`} initial={calculOp ? opsSaisis[calculOp] || "" : ""} onFermer={() => setCalculOp(null)}
        onValider={(v) => { setSaisie((x) => ({ ...x, operateurs: { ...(x.operateurs || {}), [calculOp]: String(v) } })); setCalculOp(null); }} />
      <CalculetteMontant ouvert={calculette} titre="Montant du budget" initial={montantSaisi || ""} onFermer={() => setCalculette(false)}
        onValider={(v) => { setSaisie((x) => ({ ...x, montant: String(v) })); setCalculette(false); toast.info(`Montant ${v.toLocaleString("fr-FR")} FCFA placé dans le champ : cliquez sur « Enregistrer le budget ».`); }} />
      {n && lignes.length === 0 && <p className="text-xs text-gray-500">Aucun SMS de paiement lu pour l'instant : le niveau se calcule à partir des SMS de vos opérateurs (application Android « direct »).</p>}
    </section>
  );
}
