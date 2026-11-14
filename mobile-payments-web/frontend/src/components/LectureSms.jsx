import { useState } from "react";
import { capacites, lireSmsPaiements } from "@/lib/pontAndroid";
import { analyserSms, chargerLignes, enregistrerLignes, fusionner } from "@/lib/smsPaiements";

// Lecture des SMS de paiement (application Android auRor, version « direct » seulement) : bloc REPLIABLE, affiché REPLIÉ avec un récapitulatif
// (opérateur, nombre de SMS lus, nombre de paiements enregistrés, date et heure de la dernière lecture).
// Chaque SMS de paiement devient une LIGNE (date, sens, montant, bénéficiaire, solde, numéro de transaction) GARDÉE SUR LE TÉLÉPHONE : l'historique survit à la suppression des SMS.
// Le texte complet des SMS n'est jamais enregistré et rien n'est envoyé à auRor.
const CLE_RESUME = "auror_sms_resume";

const lireResume = () => { try { return JSON.parse(localStorage.getItem(CLE_RESUME) || "null"); } catch { return null; } };
const ecrireResume = (r) => { try { localStorage.setItem(CLE_RESUME, JSON.stringify(r)); } catch { /* stockage indisponible */ } };
const dateHeure = (ms) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;

export default function LectureSms() {
  const appli = capacites();
  const [jours, setJours] = useState(30);
  const [etat, setEtat] = useState(null);                 // null | "lecture" | { erreur } | { lus, nouvelles }
  const [resume, setResume] = useState(lireResume);       // { le, lus, operateurs: [{ nom, nb }] }
  const [lignes, setLignes] = useState(() => chargerLignes());
  if (!appli?.sms) return null;

  const lire = async () => {
    setEtat("lecture");
    const r = await lireSmsPaiements(jours);
    if (!r.sms) { setEtat(r); return; }
    // Chaque SMS devient une ligne ; les lignes déjà connues ne sont pas dupliquées
    const nouvelles = r.sms.map(analyserSms).filter(Boolean);
    const { lignes: toutes, nouvelles: nb } = fusionner(chargerLignes(), nouvelles);
    enregistrerLignes(toutes);
    setLignes(toutes);
    const par = {};
    toutes.forEach((l) => { par[l.adresse] = (par[l.adresse] || 0) + 1; });
    const nouveau = { le: Date.now(), lus: r.sms.length, operateurs: Object.entries(par).map(([nom, n]) => ({ nom, nb: n })).sort((a, b) => b.nb - a.nb) };
    setResume(nouveau); ecrireResume(nouveau);
    setEtat({ lus: r.sms.length, nouvelles: nb });
  };

  return (
    <details className="card" data-testid="bloc-sms">
      {/* Récapitulatif toujours visible, même replié */}
      <summary className="cursor-pointer space-y-1">
        <span className="text-lg font-semibold">📩 Mes SMS de paiement</span>
        <span className="block text-sm text-gray-600">
          {resume
            ? <>Dernière lecture : <b>{dateHeure(resume.le)}</b> · <b>{resume.lus}</b> SMS lus · <b>{lignes.length}</b> paiement(s) enregistré(s){resume.operateurs.length > 0 && <> · {resume.operateurs.map((o) => `${o.nom} (${o.nb})`).join(", ")}</>}</>
            : lignes.length > 0 ? <><b>{lignes.length}</b> paiement(s) enregistré(s) sur ce téléphone</> : "Aucune lecture pour l'instant : dépliez, puis appuyez sur « Lire mes SMS »."}
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">Lecture des SMS de vos opérateurs reçus sur ce téléphone. Les paiements sont gardés sur le téléphone (jamais le texte des SMS) : rien n'est envoyé à auRor.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="label" htmlFor="sms-jours">Période</label>
          <select id="sms-jours" className="input w-auto" value={jours} onChange={(e) => setJours(Number(e.target.value))}>
            {[7, 30, 90, 365].map((j) => <option key={j} value={j}>{j} derniers jours</option>)}
          </select>
          <button type="button" className="btn-primary" onClick={lire} disabled={etat === "lecture"}>
            {etat === "lecture" ? "⏳ Lecture…" : resume ? "🔄 Relire mes SMS" : "📩 Lire mes SMS"}
          </button>
        </div>
        {etat?.erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{etat.erreur}</p>}
        {etat?.lus !== undefined && <p className="text-sm text-gray-600">{etat.lus} SMS lus · {etat.nouvelles} nouveau(x) paiement(s) enregistré(s).</p>}

        {lignes.length > 0 && (
          <ul className="space-y-2" data-testid="lignes-sms">
            {lignes.slice(0, 100).map((l) => (
              <li key={l.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-nuit-900">{l.adresse}</span>
                  <span>{dateHeure(l.quand)}</span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${l.genre === "RECETTE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{l.genre === "RECETTE" ? "↓ Reçu" : "↑ Payé"}</span>
                  <span className={`ml-auto text-base font-bold ${l.genre === "RECETTE" ? "text-green-700" : "text-red-700"}`}>{fcfa(l.montant)}</span>
                </div>
                {(l.tiers || l.reference || l.solde != null) && (
                  <p className="mt-1 text-gray-700">
                    {l.tiers && <b>{l.tiers}</b>}{l.reference && <span className="ml-2 font-mono text-xs text-primary">{l.reference}</span>}{l.solde != null && <span className="ml-2 text-xs text-gray-500">solde {fcfa(l.solde)}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
