import { useState } from "react";
import { capacites, lireSmsPaiements } from "@/lib/pontAndroid";

// Lecture des SMS de paiement (application Android auRor, version « direct » seulement) : affiche les SMS d'opérateurs reçus ces derniers jours,
// avec le montant en évidence. Les SMS restent sur le téléphone : rien n'est envoyé à auRor. Invisible sur le site et dans la version du Play Store.
const MONTANT = /(\d[\d .,  ]*)\s*(?:fcfa|f\s?cfa|xof|cfa)\b/i;

export default function LectureSms() {
  const appli = capacites();
  const [jours, setJours] = useState(30);
  const [etat, setEtat] = useState(null); // null | "lecture" | { sms } | { erreur }
  if (!appli?.sms) return null;

  const lire = async () => {
    setEtat("lecture");
    setEtat(await lireSmsPaiements(jours));
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">📩 Mes SMS de paiement</h2>
      <p className="text-sm text-gray-600">Lecture des SMS de vos opérateurs reçus sur ce téléphone. Ils restent sur le téléphone : rien n'est envoyé à auRor.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="label" htmlFor="sms-jours">Période</label>
        <select id="sms-jours" className="input w-auto" value={jours} onChange={(e) => setJours(Number(e.target.value))}>
          {[7, 30, 90, 365].map((j) => <option key={j} value={j}>{j} derniers jours</option>)}
        </select>
        <button type="button" className="btn-primary" onClick={lire} disabled={etat === "lecture"}>
          {etat === "lecture" ? "⏳ Lecture…" : "📩 Lire mes SMS"}
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
                  <span>{new Date(s.recu_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                  {m && <span className="ml-auto text-base font-bold text-accent">{m[1].trim()} FCFA</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{s.corps}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
