import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, fcfa, messageErreur } from "@/lib/api";

// Bloc « Évaluer un terme » de l'Historique : on tape N'IMPORTE QUEL terme (bénéficiaire, marchand, service, motif, code, numéro…),
// 1) le nombre d'occurrences s'affiche, 2) « Évaluer » calcule les statistiques MENSUELLES et trace les graphiques, 3) export CSV et impression.
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const nomMois = (m) => `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const echapper = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Fichier CSV : une ligne par mois, puis les opérations trouvées. */
function exporterCsv(r) {
  const lignes = [["Terme", r.terme], [], ["Mois", "Paiements effectués", "Montant (FCFA)", "Occurrences (tous statuts)"],
    ...r.par_mois.map((m) => [nomMois(m.mois), m.nombre, m.montant, m.occurrences]), [],
    ["Date", "Opérateur", "Service", "Bénéficiaire", "Montant (FCFA)", "Statut"],
    ...r.operations.map((o) => [dateHeure(o.cree_le), o.operateur, o.service, o.beneficiaire, o.montant ?? "", o.statut])];
  const blob = new Blob(["﻿" + lignes.map((l) => l.map(echapper).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `evaluation_${r.terme.replace(/\W+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Impression : page à part (tableau + barres) ouverte dans une nouvelle fenêtre puis envoyée à l'imprimante. */
function imprimer(r) {
  const max = Math.max(1, ...r.par_mois.map((m) => m.montant));
  const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const lignes = r.par_mois.map((m) => `<tr><td>${nomMois(m.mois)}</td><td style="text-align:right">${m.nombre}</td><td style="text-align:right">${fcfa(m.montant)}</td>
    <td><div style="background:#0f766e;height:12px;width:${Math.round((100 * m.montant) / max)}%"></div></td></tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<html><head><title>Évaluation : ${esc(r.terme)}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
    td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}</style></head><body><h1>Évaluation du terme « ${esc(r.terme)} »</h1>
    <p>Du ${esc(r.premiere)} au ${esc(r.derniere)} · ${r.payes} paiement(s) effectué(s) · total ${fcfa(r.montant_total)} · moyenne mensuelle ${fcfa(r.moyenne_mensuelle)}</p>
    <table><thead><tr><th>Mois</th><th style="text-align:right">Paiements</th><th style="text-align:right">Montant</th><th style="width:40%">Graphique</th></tr></thead><tbody>${lignes}</tbody></table></body></html>`);
  w.document.close(); w.focus(); w.print();
  return true;
}

// Périodes proposées (liste déroulante, règle 10) : « Toute la période » par défaut ; « Personnalisée » ouvre deux dates.
const iso = (d) => d.toISOString().slice(0, 10);
function bornesPeriode(choix, perso) {
  const auj = new Date(), an = auj.getFullYear();
  if (choix === "12m") { const d = new Date(auj); d.setFullYear(an - 1); return { du: iso(d), au: iso(auj) }; }
  if (choix === "annee") return { du: `${an}-01-01`, au: iso(auj) };
  if (choix === "annee_prec") return { du: `${an - 1}-01-01`, au: `${an - 1}-12-31` };
  if (choix === "perso") return { du: perso.du || undefined, au: perso.au || undefined };
  return {};                                                  // toute la période
}

export default function EvaluationTerme() {
  const toast = useToast();
  const [terme, setTerme] = useState("");
  const [compte, setCompte] = useState(null);      // nombre d'occurrences du terme tapé (null = pas encore cherché)
  const [resultat, setResultat] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [periode, setPeriode] = useState("tout");              // choix de la période évaluée
  const [perso, setPerso] = useState({ du: "", au: "" });       // dates de la période personnalisée (AAAA-MM-JJ)
  const bornes = bornesPeriode(periode, perso);

  // 1. Le terme tapé est cherché après une courte pause : seul le NOMBRE d'occurrences est demandé
  useEffect(() => {
    setResultat(null); setCompte(null);
    if (terme.trim().length < 2) return undefined;
    const t = setTimeout(async () => {
      try { const { data } = await apiClient.get("/paiements/evaluation-terme", { params: { terme: terme.trim(), ...bornes } }); setCompte(data.occurrences); } catch { setCompte(null); }
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terme, periode, perso.du, perso.au]);

  // 2. « Évaluer » : statistiques mensuelles
  const evaluer = async () => {
    setOccupe(true); toast.info(`Évaluation de « ${terme.trim()} » en cours…`);
    try {
      const { data } = await apiClient.get("/paiements/evaluation-terme", { params: { terme: terme.trim(), evaluer: true, ...bornes } });
      setResultat(data); toast.succes(`Évaluation terminée : ${data.occurrences} occurrence(s) sur ${data.par_mois.length} mois.`);
    } catch (err) { toast.erreur(messageErreur(err, "Évaluation impossible")); } finally { setOccupe(false); }
  };
  const max = resultat ? Math.max(1, ...resultat.par_mois.map((m) => m.montant)) : 1;

  return (
    <div className="space-y-3" data-testid="evaluation-terme">
      <p className="text-sm text-gray-600">Tapez un mot (bénéficiaire, marchand, service, motif, code ou numéro) : auRor retrouve ses occurrences dans tout votre historique,
        puis « Évaluer » calcule les montants mois par mois.</p>
      <input className="input" placeholder="Ex. : Pharmacie, SONABEL, 445566" value={terme} onChange={(e) => setTerme(e.target.value)} data-testid="terme" />
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="ev-periode">Période</label>
          <select id="ev-periode" className="input" value={periode} onChange={(e) => setPeriode(e.target.value)} data-testid="periode-terme">
            <option value="tout">Toute la période</option>
            <option value="12m">12 derniers mois</option>
            <option value="annee">Année en cours</option>
            <option value="annee_prec">Année précédente</option>
            <option value="perso">Personnalisée…</option>
          </select>
        </div>
        {periode === "perso" && (<>
          <div><label className="label" htmlFor="ev-du">Du</label><input id="ev-du" type="date" className="input" value={perso.du} onChange={(e) => setPerso({ ...perso, du: e.target.value })} /></div>
          <div><label className="label" htmlFor="ev-au">Au</label><input id="ev-au" type="date" className="input" value={perso.au} onChange={(e) => setPerso({ ...perso, au: e.target.value })} /></div>
        </>)}
      </div>
      {compte === 0 && <p className="text-sm text-gray-500">Aucune occurrence de « {terme.trim()} ».</p>}
      {compte > 0 && !resultat && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge bg-sky-100 text-sky-900">{compte} occurrence{compte > 1 ? "s" : ""}</span>
          <button type="button" className="btn-primary btn-sm" disabled={occupe} onClick={evaluer} data-testid="evaluer">📊 Évaluer</button>
        </div>
      )}
      {resultat && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Payés", resultat.payes], ["Montant total", fcfa(resultat.montant_total)], ["Moyenne par mois", fcfa(resultat.moyenne_mensuelle)], ["Plus gros", fcfa(resultat.plus_gros)]].map(([t, v]) => (
              <div key={t} className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-semibold uppercase text-gray-500">{t}</p><p className="text-lg font-bold tabular-nums">{v}</p></div>
            ))}
          </div>
          {resultat.non_payes > 0 && <p className="text-xs text-gray-500">{resultat.non_payes} occurrence(s) non payée(s) (préparées ou abandonnées) : comptées à part, hors montants.</p>}
          {/* Graphique : une barre par mois (montant payé) */}
          <div className="space-y-1" data-testid="graphique-terme">
            {resultat.par_mois.map((m) => (
              <div key={m.mois} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-gray-600">{nomMois(m.mois)}</span>
                <div className="h-4 flex-1 rounded bg-gray-100"><div className="h-4 rounded bg-teal-600" style={{ width: `${Math.round((100 * m.montant) / max)}%` }} /></div>
                <span className="w-28 shrink-0 text-right font-semibold tabular-nums">{fcfa(m.montant)}</span>
                <span className="w-8 shrink-0 text-right text-xs text-gray-500">×{m.nombre}</span>
              </div>
            ))}
          </div>
          {resultat.par_operateur.length > 0 && (
            <p className="text-sm text-gray-600"><span className="font-semibold">Par opérateur : </span>{resultat.par_operateur.map((o) => `${o.operateur} ${fcfa(o.montant)} (×${o.nombre})`).join(" · ")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => exporterCsv(resultat)}>⬇ Exporter en CSV</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => { if (!imprimer(resultat)) toast.erreur("Impression impossible ici : utilisez l'export CSV."); }}>🖨️ Imprimer</button>
            <button type="button" className="btn-outline btn-sm" onClick={evaluer} disabled={occupe}>↻ Actualiser</button>
          </div>
        </div>
      )}
    </div>
  );
}
