import { useState } from "react";
import { capacites, lireSmsPaiements } from "@/lib/pontAndroid";

// Lecture des SMS de paiement (application Android auRor, version « direct » seulement) : bloc REPLIABLE, affiché REPLIÉ avec un récapitulatif
// (opérateur, nombre de SMS lus, date et heure de la dernière lecture). Les SMS restent sur le téléphone : rien n'est envoyé à auRor.
// Seul le RÉCAPITULATIF (nombres par opérateur et heure) est gardé dans le téléphone (localStorage) pour l'afficher replié ; le texte des SMS n'est jamais enregistré.
const MONTANT = /(\d[\d .,  ]*)\s*(?:fcfa|f\s?cfa|xof|cfa)\b/i;
const CLE = "auror_sms_resume";

const lireResume = () => { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch { return null; } };
const ecrireResume = (r) => { try { localStorage.setItem(CLE, JSON.stringify(r)); } catch { /* stockage indisponible : le récapitulatif ne survit pas à la fermeture */ } };
const dateHeure = (ms) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default function LectureSms() {
  const appli = capacites();
  const [jours, setJours] = useState(30);
  const [etat, setEtat] = useState(null);                 // null | "lecture" | { sms } | { erreur }
  const [resume, setResume] = useState(lireResume);       // { le, total, operateurs: [{ nom, nb }] }
  if (!appli?.sms) return null;

  const lire = async () => {
    setEtat("lecture");
    const r = await lireSmsPaiements(jours);
    setEtat(r);
    if (r.sms) {
      const par = {};
      r.sms.forEach((s) => { par[s.adresse] = (par[s.adresse] || 0) + 1; });
      const nouveau = { le: Date.now(), total: r.sms.length, operateurs: Object.entries(par).map(([nom, nb]) => ({ nom, nb })).sort((a, b) => b.nb - a.nb) };
      setResume(nouveau); ecrireResume(nouveau);
    }
  };

  return (
    <details className="card" data-testid="bloc-sms">
      {/* Récapitulatif toujours visible, même replié */}
      <summary className="cursor-pointer space-y-1">
        <span className="text-lg font-semibold">📩 Mes SMS de paiement</span>
        <span className="block text-sm text-gray-600">
          {resume
            ? <>Dernière lecture : <b>{dateHeure(resume.le)}</b> · <b>{resume.total}</b> SMS lus{resume.operateurs.length > 0 && <> · {resume.operateurs.map((o) => `${o.nom} (${o.nb})`).join(", ")}</>}</>
            : "Aucune lecture pour l'instant : dépliez, puis appuyez sur « Lire mes SMS »."}
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">Lecture des SMS de vos opérateurs reçus sur ce téléphone. Ils restent sur le téléphone : rien n'est envoyé à auRor.</p>
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
        {etat?.sms && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{etat.sms.length} SMS de paiement trouvé(s).</p>
            {etat.sms.slice(0, 100).map((s, i) => {
              const m = s.corps.match(MONTANT);
              return (
                <div key={i} className="rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-nuit-900">{s.adresse}</span>
                    <span>{dateHeure(s.recu_le)}</span>
                    {m && <span className="ml-auto text-base font-bold text-accent">{m[1].trim()} FCFA</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{s.corps}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
