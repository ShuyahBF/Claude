import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, fcfa, messageErreur } from "@/lib/api";
import { chargerLignes, estTransaction, filtrerLignes } from "@/lib/smsPaiements";

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

/**
 * SMS de paiement lus sur CE téléphone (« Lecture des SMS ») qui contiennent le terme, dans la période : dépenses comptées seulement (les SMS hors décompte
 * et les doublons sont exclus, comme dans la Lecture des SMS). Ils vivent sur le téléphone, jamais sur le serveur : l'évaluation du serveur ne peut pas les voir.
 */
function smsDuTerme(terme, bornes) {
  return filtrerLignes(chargerLignes(), { texte: terme, du: bornes.du, au: bornes.au }).filter((l) => estTransaction(l) && l.genre === "DEPENSE");
}

/** Réunit le résultat du serveur et les SMS du téléphone (un SMS dont la référence est déjà dans l'historique du serveur n'est pas compté deux fois). */
function fusionnerSms(serveur, sms, terme) {
  const deja = new Set((serveur?.operations || []).map((o) => o.reference_operateur).filter(Boolean));
  const utiles = sms.filter((l) => !(l.reference && deja.has(l.reference)));
  const base = serveur?.par_mois ? serveur : { terme, occurrences: 0, payes: 0, non_payes: 0, montant_total: 0, plus_gros: 0, par_mois: [], par_operateur: [], operations: [] };
  const mois = new Map(base.par_mois.map((m) => [m.mois, { ...m, sms_nombre: 0, sms_montant: 0 }]));
  for (const l of utiles) {
    const d = new Date(l.quand);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = mois.get(cle) || { mois: cle, occurrences: 0, nombre: 0, montant: 0, sms_nombre: 0, sms_montant: 0 };
    m.occurrences += 1; m.nombre += 1; m.montant += l.montant; m.sms_nombre += 1; m.sms_montant += l.montant;
    mois.set(cle, m);
  }
  const par_mois = [...mois.values()].sort((a, b) => a.mois.localeCompare(b.mois));
  const montants = [...(serveur?.operations || []).filter((o) => o.statut === "effectue").map((o) => o.montant || 0), ...utiles.map((l) => l.montant)];
  const actifs = par_mois.filter((m) => m.nombre).length;
  const dates = [...(serveur?.operations || []).map((o) => String(o.cree_le).slice(0, 10)), ...utiles.map((l) => new Date(l.quand).toISOString().slice(0, 10))].sort();
  const total = montants.reduce((a, b) => a + b, 0);
  const ops = utiles.map((l) => ({ id: `sms-${l.id}`, cree_le: new Date(l.quand).toISOString(), operateur: l.adresse || "SMS", service: "SMS du téléphone", beneficiaire: l.tiers || "", montant: l.montant, statut: "effectue" }));
  return { ...base, terme, par_mois, occurrences: base.occurrences + utiles.length, payes: montants.length, montant_total: total, plus_gros: Math.max(0, ...montants),
    montant_moyen: montants.length ? Math.round(total / montants.length) : 0, moyenne_mensuelle: actifs ? Math.round(total / actifs) : 0,
    premiere: dates[0], derniere: dates[dates.length - 1], sms_nombre: utiles.length, sms_montant: utiles.reduce((a, l) => a + l.montant, 0), operations: [...base.operations, ...ops] };
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
  const [avecSms, setAvecSms] = useState(true);                 // inclure les SMS lus sur ce téléphone

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
  const nbSms = avecSms ? smsDuTerme(terme.trim(), bornes).length : 0;     // occurrences trouvées dans les SMS du téléphone
  const evaluer = async () => {
    setOccupe(true); toast.info(`Évaluation de « ${terme.trim()} » en cours…`);
    try {
      let data = null;
      try { data = (await apiClient.get("/paiements/evaluation-terme", { params: { terme: terme.trim(), evaluer: true, ...bornes } })).data; }
      catch (err) { if (!avecSms) throw err; toast.erreur("Historique du serveur indisponible : seuls les SMS du téléphone sont évalués."); }
      const r = fusionnerSms(data, avecSms ? smsDuTerme(terme.trim(), bornes) : [], terme.trim());
      setResultat(r); toast.succes(`Évaluation terminée : ${r.occurrences} occurrence(s) sur ${r.par_mois.length} mois${r.sms_nombre ? ` (dont ${r.sms_nombre} SMS du téléphone)` : ""}.`);
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
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={avecSms} onChange={(e) => { setAvecSms(e.target.checked); setResultat(null); }} data-testid="avec-sms" />
        <span>Inclure les <b>SMS de paiement lus sur ce téléphone</b> (Lecture des SMS) : ils ne sont pas dans l'historique du serveur.</span>
      </label>
      {compte === 0 && nbSms === 0 && <p className="text-sm text-gray-500">Aucune occurrence de « {terme.trim()} ».</p>}
      {((compte || 0) + nbSms > 0) && !resultat && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge bg-sky-100 text-sky-900">{(compte || 0) + nbSms} occurrence{(compte || 0) + nbSms > 1 ? "s" : ""}{nbSms > 0 && ` (dont ${nbSms} SMS du téléphone)`}</span>
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
          {resultat.sms_nombre > 0 && <p className="text-xs text-gray-500">Dont {resultat.sms_nombre} SMS lus sur ce téléphone, pour {fcfa(resultat.sms_montant)}.</p>}
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
