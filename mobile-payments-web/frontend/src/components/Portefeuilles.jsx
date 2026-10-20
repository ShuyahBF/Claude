// Portefeuilles (lot 86) — auRor, outil de budget : soldes du portefeuille ÉLECTRONIQUE (compte mobile money) et PERSONNEL (liquidités),
// paiements « en cours », courbe d'évolution, et saisie : « mon solde à une date », retrait / dépôt (sortie d'un côté, entrée de l'autre),
// autre entrée / sortie d'argent. Affiché en tête de l'Historique.
import { useCallback, useEffect, useState } from "react";
import GraphePortefeuilles from "@/components/GraphePortefeuilles";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, fcfa, messageErreur } from "@/lib/api";

const NOMS = { electronique: "Électronique", personnel: "Personnel" };
const PERIODES = [[30, "30 jours"], [90, "3 mois"], [180, "6 mois"], [366, "1 an"]];
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const entier = (v) => Number(String(v).replace(/[\s  ]/g, "")) || 0;
// Types de mouvement (liste finie)
const TYPES = [
  ["retrait", "Retrait : du compte mobile money vers ma poche"],
  ["depot", "Dépôt : de ma poche vers le compte mobile money"],
  ["entree", "Entrée d'argent (salaire reçu, cadeau…)"],
  ["sortie", "Sortie d'argent (dépense en espèces…)"],
];

function Carte({ code, s }) {
  return (
    <div className="card space-y-1 p-4" data-testid={`portefeuille-${code}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{code === "electronique" ? "📱 Portefeuille électronique" : "👛 Portefeuille personnel"}</p>
      {s.renseigne ? (
        <>
          <p className="text-2xl font-bold tabular-nums">{fcfa(s.montant)}</p>
          {s.en_cours !== 0 && (
            <p className="text-sm text-amber-700" data-testid={`en-cours-${code}`}>En cours : {fcfa(s.en_cours)} → <b>{fcfa(s.apres_en_cours)}</b> une fois confirmés</p>
          )}
          <p className="text-xs text-gray-500">Depuis le relevé du {dateFr(s.depuis)}</p>
        </>
      ) : <p className="text-sm text-gray-500">Solde non renseigné : indiquez-le pour suivre ce portefeuille.</p>}
    </div>
  );
}

// rafraichir : texte qui change quand un paiement change de statut → les soldes se recalculent
export default function Portefeuilles({ rafraichir = "" }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [jours, setJours] = useState(90);
  const [fenetre, setFenetre] = useState(null);           // "releve" | "mouvement" | null
  const [releve, setReleve] = useState({ portefeuille: "electronique", jour: aujourdhui(), montant: "" });
  const [mvt, setMvt] = useState({ type: "retrait", portefeuille: "electronique", montant: "", frais: "", jour: aujourdhui(), motif: "" });
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setD((await apiClient.get("/portefeuille", { params: { jours } })).data); }
    catch (err) { toast.erreur(messageErreur(err, "Portefeuilles indisponibles")); setD((x) => x || { soldes: {}, serie: [], releves: [], mouvements: [], en_cours: [] }); }
  }, [jours, toast]);
  useEffect(() => { charger(); }, [charger, rafraichir]);

  const envoyer = async (chemin, corps, message) => {
    setOccupe(true);
    try { await apiClient.post(chemin, corps); toast.succes(message); setFenetre(null); await charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };
  const supprimer = async (chemin) => {
    if (!window.confirm("Supprimer cette ligne ?")) return;
    try { await apiClient.delete(chemin); charger(); } catch (err) { toast.erreur(messageErreur(err, "Suppression impossible")); }
  };

  if (!d) return <p className="text-sm text-gray-500">Chargement des portefeuilles…</p>;
  const sans = !d.soldes.electronique?.renseigne && !d.soldes.personnel?.renseigne;
  const libelleMvt = (m) => ({ retrait: `Retrait ${fcfa(m.montant)}${m.frais ? ` (frais ${fcfa(m.frais)})` : ""}`, depot: `Dépôt ${fcfa(m.montant)}`,
    entree: `Entrée ${fcfa(m.montant)} · ${NOMS[m.portefeuille]}`, sortie: `Sortie ${fcfa(m.montant)} · ${NOMS[m.portefeuille]}` }[m.type]);
  return (
    <section className="space-y-3" data-testid="portefeuilles">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">💼 Mes portefeuilles</h2>
        <div className="flex gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={() => { setReleve({ portefeuille: "electronique", jour: aujourdhui(), montant: "" }); setFenetre("releve"); }} data-testid="btn-releve">Indiquer mon solde</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => setFenetre("mouvement")} data-testid="btn-mouvement">Retrait / dépôt…</button>
        </div>
      </div>
      {sans && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Indiquez le solde de votre compte mobile money et l'argent que vous avez en poche : chaque paiement effectué met ensuite le solde à jour, et un retrait déplace l'argent d'un portefeuille à l'autre.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Carte code="electronique" s={d.soldes.electronique || {}} />
        <Carte code="personnel" s={d.soldes.personnel || {}} />
      </div>

      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Évolution</p>
          <select className="input !w-auto" value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période de la courbe">
            {PERIODES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>
        <GraphePortefeuilles serie={d.serie} />
      </div>

      {(d.releves.length > 0 || d.mouvements.length > 0 || d.en_cours.length > 0) && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Relevés, mouvements et paiements en cours</summary>
          <div className="mt-3 space-y-3">
            {d.en_cours.length > 0 && (
              <div><p className="label">⏳ Paiements en cours (non confirmés)</p>
                <ul className="space-y-1">{d.en_cours.map((e, i) => <li key={i} className="flex justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5"><span className="truncate">{e.libelle}</span><b className="tabular-nums">{fcfa(e.montant)}</b></li>)}</ul></div>
            )}
            {d.releves.length > 0 && (
              <div><p className="label">Soldes indiqués</p>
                <ul className="space-y-1">{d.releves.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                    <span>{dateFr(r.jour)} · {NOMS[r.portefeuille]} : <b className="tabular-nums">{fcfa(r.montant)}</b>
                      {r.ecart !== null && r.ecart !== undefined && r.ecart !== 0 && <span className={`ml-2 text-xs ${r.ecart < 0 ? "text-red-600" : "text-green-700"}`}>écart {r.ecart > 0 ? "+" : ""}{fcfa(r.ecart)} par rapport au calcul</span>}</span>
                    <button type="button" className="text-red-600" aria-label="Supprimer ce relevé" onClick={() => supprimer(`/portefeuille/releves/${r.id}`)}>🗑</button>
                  </li>))}</ul></div>
            )}
            {d.mouvements.length > 0 && (
              <div><p className="label">Mouvements</p>
                <ul className="space-y-1">{d.mouvements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                    <span className="min-w-0 truncate">{dateFr(m.jour)} · {libelleMvt(m)}{m.motif ? ` · ${m.motif}` : ""}</span>
                    <button type="button" className="shrink-0 text-red-600" aria-label="Supprimer ce mouvement" onClick={() => supprimer(`/portefeuille/mouvements/${m.id}`)}>🗑</button>
                  </li>))}</ul></div>
            )}
          </div>
        </details>
      )}

      <Modal ouvert={fenetre === "releve"} titre="Indiquer mon solde" onFermer={() => setFenetre(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); envoyer("/portefeuille/releves", { portefeuille: releve.portefeuille, jour: releve.jour, montant: entier(releve.montant) }, "Solde enregistré"); }}>
          <div><label className="label" htmlFor="r-pf">Portefeuille</label>
            <select id="r-pf" className="input" value={releve.portefeuille} onChange={(e) => setReleve({ ...releve, portefeuille: e.target.value })}>
              <option value="electronique">Électronique (compte mobile money)</option><option value="personnel">Personnel (argent en poche)</option></select></div>
          <div><label className="label" htmlFor="r-jour">À la date du</label>
            <input id="r-jour" type="date" className="input" max={aujourdhui()} value={releve.jour} onChange={(e) => setReleve({ ...releve, jour: e.target.value })} required />
            <p className="mt-1 text-xs text-gray-500">Aujourd'hui = votre solde en ce moment : les paiements faits ensuite le feront baisser.</p></div>
          <div><label className="label" htmlFor="r-montant">Solde (FCFA)</label>
            <input id="r-montant" className="input" inputMode="numeric" required value={releve.montant} onChange={(e) => setReleve({ ...releve, montant: e.target.value.replace(/[^\d\s]/g, "") })} placeholder="ex. 85 000" /></div>
          <button type="submit" className="btn-primary w-full" disabled={occupe || releve.montant === ""}>Enregistrer le solde</button>
        </form>
      </Modal>

      <Modal ouvert={fenetre === "mouvement"} titre="Retrait, dépôt, entrée ou sortie" onFermer={() => setFenetre(null)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const corps = { type: mvt.type, montant: entier(mvt.montant), jour: mvt.jour, motif: mvt.motif || undefined,
            ...(["entree", "sortie"].includes(mvt.type) ? { portefeuille: mvt.portefeuille } : { frais: entier(mvt.frais) }) };
          envoyer("/portefeuille/mouvements", corps, "Mouvement enregistré");
        }}>
          <div><label className="label" htmlFor="m-type">Opération</label>
            <select id="m-type" className="input" value={mvt.type} onChange={(e) => setMvt({ ...mvt, type: e.target.value })} data-testid="mvt-type">
              {TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
          {["entree", "sortie"].includes(mvt.type) && (
            <div><label className="label" htmlFor="m-pf">Portefeuille</label>
              <select id="m-pf" className="input" value={mvt.portefeuille} onChange={(e) => setMvt({ ...mvt, portefeuille: e.target.value })}>
                <option value="electronique">Électronique</option><option value="personnel">Personnel</option></select></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="m-montant">Montant (FCFA)</label>
              <input id="m-montant" className="input" inputMode="numeric" required value={mvt.montant} onChange={(e) => setMvt({ ...mvt, montant: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
            {!["entree", "sortie"].includes(mvt.type) && (
              <div><label className="label" htmlFor="m-frais">Frais (facultatif)</label>
                <input id="m-frais" className="input" inputMode="numeric" value={mvt.frais} onChange={(e) => setMvt({ ...mvt, frais: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
            )}
          </div>
          <div><label className="label" htmlFor="m-jour">Date</label>
            <input id="m-jour" type="date" className="input" max={aujourdhui()} value={mvt.jour} onChange={(e) => setMvt({ ...mvt, jour: e.target.value })} required /></div>
          <div><label className="label" htmlFor="m-motif">Motif (facultatif)</label>
            <input id="m-motif" className="input" maxLength={120} value={mvt.motif} onChange={(e) => setMvt({ ...mvt, motif: e.target.value })} /></div>
          <p className="text-xs text-gray-500">{mvt.type === "retrait" ? "Le montant sort du portefeuille électronique (frais compris) et entre dans le personnel." : mvt.type === "depot" ? "Le montant sort du portefeuille personnel et entre dans l'électronique." : "Le portefeuille choisi est mis à jour."}</p>
          <button type="submit" className="btn-primary w-full" disabled={occupe || mvt.montant === ""}>Enregistrer</button>
        </form>
      </Modal>
    </section>
  );
}
