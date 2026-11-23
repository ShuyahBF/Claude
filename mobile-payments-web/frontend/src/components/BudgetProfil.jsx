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
import { BENEFICIAIRES_MAX, BUDGET_VIDE, PERIODES, beneficiairesConnus, libelleBeneficiaire, normaliserBeneficiaires, chargerBudget, enregistrerBudget, libellePeriode, niveauBudget, normaliser, reinitialiser } from "@/lib/budget";
import { chargerLignes } from "@/lib/smsPaiements";

export default function BudgetProfil() {
  const toast = useToast();
  const [budget, setBudget] = useState(chargerBudget);                 // budget enregistré
  const [saisie, setSaisie] = useState(() => ({ ...BUDGET_VIDE, ...chargerBudget() }));   // formulaire (montant en texte)
  const [lignes, setLignes] = useState(() => chargerLignes());
  const [confirmerRaz, setConfirmerRaz] = useState(false);
  const [calculette, setCalculette] = useState(false);
  const [calculBenef, setCalculBenef] = useState(null);            // index du bénéficiaire dont on calcule la limite (calculette)
  const [choixAjout, setChoixAjout] = useState("");                  // liste d'ajout : bénéficiaire déjà payé, ou « Autre… » (saisie libre)
  const [libre, setLibre] = useState({ nom: "", tel: "" });              // calculette ouverte depuis le champ du montant
  // Les dépenses se mettent à jour quand la lecture automatique des SMS trouve de nouveaux paiements
  useEffect(() => {
    const maj = () => setLignes(chargerLignes());
    window.addEventListener(EVENEMENT_MAJ, maj);
    return () => window.removeEventListener(EVENEMENT_MAJ, maj);
  }, []);

  const montantSaisi = Math.round(Number(String(saisie.montant).replace(/\D/g, "")) || 0);
  // Limites par bénéficiaire (lot 220) : liste modifiable dans le formulaire (montants en texte), comparée à celle enregistrée
  const benefs = saisie.beneficiaires || [];
  const benefsPropres = normaliserBeneficiaires(benefs);
  const connus = beneficiairesConnus(lignes).filter((c) => !benefs.some((x) => libelleBeneficiaire(x) === libelleBeneficiaire(c)));
  const ajouter = (b) => { if (benefs.length >= BENEFICIAIRES_MAX) { toast.erreur(`${BENEFICIAIRES_MAX} bénéficiaires au plus.`); return; } setSaisie((x) => ({ ...x, beneficiaires: [...(x.beneficiaires || []), { nom: b.nom || "", tel: b.tel || "", montant: "" }] })); };
  const modifie = montantSaisi !== budget.montant || saisie.periode !== budget.periode || !!saisie.actif !== budget.actif || JSON.stringify(benefsPropres) !== JSON.stringify(budget.beneficiaires || []);
  const garder = (b, message) => {
    const n = normaliser(b);
    if (!enregistrerBudget(n)) { toast.erreur("Impossible de garder le budget sur ce téléphone."); return; }
    setBudget(n); setSaisie({ ...n }); toast.succes(message);
  };
  const enregistrer = () => {
    if (saisie.actif && montantSaisi <= 0) { toast.erreur("Indiquez un montant supérieur à 0 pour activer le budget."); return; }
    garder({ ...budget, ...saisie, montant: montantSaisi, beneficiaires: benefsPropres, depuis: saisie.periode !== budget.periode ? budget.depuis : budget.depuis },
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
      {/* Limites par bénéficiaire (lot 220) : une limite facultative pour chaque personne ou marchand payé, sur la même période */}
      <div className="space-y-2 rounded-xl bg-gray-50 p-3" data-testid="budget-par-beneficiaire">
        <p className="text-sm font-semibold">👤 Limites par bénéficiaire <span className="font-normal text-gray-500">(facultatif, même période)</span></p>
        {benefs.length === 0 && <p className="text-xs text-gray-500">Aucune limite. Ajoutez un bénéficiaire pour plafonner ce que vous lui payez (ex. 15 000 FCFA par mois pour un commerçant).</p>}
        {benefs.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm" title={libelleBeneficiaire(b)}>{libelleBeneficiaire(b)}</span>
            <input className="input w-28 text-right tabular-nums" inputMode="numeric" placeholder="Limite" aria-label={`Limite pour ${libelleBeneficiaire(b)}`}
              value={b.montant ? Number(String(b.montant).replace(/\D/g, "")).toLocaleString("fr-FR") : ""} onChange={(e) => setSaisie((x) => ({ ...x, beneficiaires: x.beneficiaires.map((y, k) => (k === i ? { ...y, montant: e.target.value.replace(/\D/g, "") } : y)) }))} />
            <button type="button" className="rounded-lg border border-gray-300 px-2 py-2" onClick={() => setCalculBenef(i)} title="Calculer la limite" aria-label={`Calculette pour ${libelleBeneficiaire(b)}`}>🧮</button>
            <button type="button" className="rounded-lg border border-red-200 px-2 py-2 text-red-700" onClick={() => setSaisie((x) => ({ ...x, beneficiaires: x.beneficiaires.filter((_, k) => k !== i) }))} title="Retirer cette limite" aria-label={`Retirer la limite de ${libelleBeneficiaire(b)}`}>🗑️</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto min-w-0 flex-1" aria-label="Ajouter un bénéficiaire" value={choixAjout} onChange={(e) => {
            const v = e.target.value; setChoixAjout(v);
            if (v !== "" && v !== "autre") { ajouter(connus[Number(v)]); setChoixAjout(""); }
          }}>
            <option value="">➕ Ajouter un bénéficiaire…</option>
            {connus.map((c, i) => <option key={libelleBeneficiaire(c)} value={i}>{libelleBeneficiaire(c)}</option>)}
            <option value="autre">Autre… (saisir un nom ou un numéro)</option>
          </select>
        </div>
        {choixAjout === "autre" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Nom (ex. Awa Ouédraogo)" aria-label="Nom du bénéficiaire" maxLength={80} value={libre.nom} onChange={(e) => setLibre({ ...libre, nom: e.target.value })} />
            <input className="input" inputMode="tel" placeholder="Numéro (facultatif)" aria-label="Numéro du bénéficiaire" value={libre.tel} onChange={(e) => setLibre({ ...libre, tel: e.target.value })} />
            <button type="button" className="btn-secondary sm:col-span-2" disabled={!libre.nom.trim() && libre.tel.replace(/\D/g, "").length < 8}
              onClick={() => { ajouter(libre); setLibre({ nom: "", tel: "" }); setChoixAjout(""); }}>✅ Ajouter à la liste</button>
          </div>
        )}
        <p className="text-xs text-gray-500">Le bénéficiaire est reconnu par son numéro ou son nom (tel qu'il apparaît dans vos SMS). Une limite n'est enregistrée qu'avec un montant et le bouton « Enregistrer le budget ».</p>
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
      <CalculetteMontant ouvert={calculBenef !== null} titre="Limite du bénéficiaire" initial={calculBenef !== null ? String(benefs[calculBenef]?.montant || "") : ""} onFermer={() => setCalculBenef(null)}
        onValider={(v) => { setSaisie((x) => ({ ...x, beneficiaires: x.beneficiaires.map((y, k) => (k === calculBenef ? { ...y, montant: String(v) } : y)) })); setCalculBenef(null); }} />
      <CalculetteMontant ouvert={calculette} titre="Montant du budget" initial={montantSaisi || ""} onFermer={() => setCalculette(false)}
        onValider={(v) => { setSaisie((x) => ({ ...x, montant: String(v) })); setCalculette(false); toast.info(`Montant ${v.toLocaleString("fr-FR")} FCFA placé dans le champ : cliquez sur « Enregistrer le budget ».`); }} />
      {n && lignes.length === 0 && <p className="text-xs text-gray-500">Aucun SMS de paiement lu pour l'instant : le niveau se calcule à partir des SMS de vos opérateurs (application Android « direct »).</p>}
    </section>
  );
}
