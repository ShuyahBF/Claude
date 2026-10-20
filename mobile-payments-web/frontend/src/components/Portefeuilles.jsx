// Portefeuilles (lots 86 et 87) — auRor, outil de budget : soldes des portefeuilles ÉLECTRONIQUES (un par opérateur : Orange, Moov, Telecel…)
// et PERSONNEL (liquidités) — seuls les opérateurs cochés dans le Profil (lot 88) sont proposés —,
// paiements « en cours », courbe d'évolution, et saisie : « mon solde à une date », retrait / dépôt (sortie d'un côté, entrée de l'autre),
// autre entrée / sortie d'argent. Affiché en tête de l'Historique.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GraphePortefeuilles from "@/components/GraphePortefeuilles";
import Modal from "@/components/Modal";
import SelecteurOperateur from "@/components/SelecteurOperateur";   // lot 89 : listes d'opérateurs avec logos
import { useToast } from "@/components/Toast";
import { apiClient, couleurOperateur, fcfa, messageErreur } from "@/lib/api";

const PERIODES = [[30, "30 jours"], [90, "3 mois"], [180, "6 mois"], [366, "1 an"]];
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const entier = (v) => Number(String(v).replace(/[\s\u202f\u00a0]/g, "")) || 0;
const PERSONNEL = "personnel";
// Nom lisible d'un portefeuille à partir de ses champs (relevé ou mouvement)
const nomPf = (pf, operateur) => (pf === PERSONNEL ? "Personnel" : operateur ? `Électronique · ${operateur}` : "Électronique (général)");
// Types de mouvement (liste finie)
const TYPES = [
  ["retrait", "Retrait : du compte mobile money vers ma poche"],
  ["depot", "Dépôt : de ma poche vers le compte mobile money"],
  ["transfert", "Transfert : d'un opérateur à un autre"],
  ["entree", "Entrée d'argent (salaire reçu, cadeau…)"],
  ["sortie", "Sortie d'argent (dépense, frais…)"],
];

function Carte({ pf, s, onIndiquer }) {
  const couleur = pf.cle === PERSONNEL ? "#0ba957" : pf.operateur ? couleurOperateur(pf.operateur) : "#4926d7";
  return (
    <div className="card space-y-1 p-4" data-testid={`portefeuille-${pf.cle}`} style={{ borderLeft: `4px solid ${couleur}` }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{pf.cle === PERSONNEL ? "👛" : "📱"} {pf.nom}</p>
      {s.renseigne ? (
        <>
          <p className="text-2xl font-bold tabular-nums">{fcfa(s.montant)}</p>
          {s.en_cours !== 0 && (
            <p className="text-sm text-amber-700" data-testid={`en-cours-${pf.cle}`}>En cours : {fcfa(s.en_cours)} → <b>{fcfa(s.apres_en_cours)}</b> une fois confirmés</p>
          )}
          <p className="text-xs text-gray-500">Depuis le relevé du {dateFr(s.depuis)}</p>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-gray-500">Solde non renseigné.</p>
          <button type="button" className="btn-outline btn-sm" onClick={onIndiquer} data-testid={`indiquer-${pf.cle}`}>Indiquer le solde</button>
        </div>
      )}
    </div>
  );
}

// rafraichir : texte qui change quand un paiement change de statut → les soldes se recalculent
export default function Portefeuilles({ rafraichir = "" }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [jours, setJours] = useState(90);
  const [fenetre, setFenetre] = useState(null);           // "releve" | "mouvement" | null
  // Choix du portefeuille d'un relevé : « personnel » ou « electronique:<opérateur> » (valeur corrigée à l'affichage si l'opérateur n'est plus proposé)
  const [releve, setReleve] = useState({ pf: "", jour: aujourdhui(), montant: "" });
  const [mvt, setMvt] = useState({ type: "retrait", operateur: "", vers: "", pf: "", montant: "", frais: "", jour: aujourdhui(), motif: "" });
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setD((await apiClient.get("/portefeuille", { params: { jours } })).data); }
    catch (err) { toast.erreur(messageErreur(err, "Portefeuilles indisponibles")); setD((x) => x || { portefeuilles: [], soldes: {}, serie: [], releves: [], mouvements: [], en_cours: [], operateurs_choisis: [] }); }
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
  // Opérateurs cochés dans le Profil (lot 88) : les seuls proposés dans les listes de saisie
  const operateurs = d.operateurs_choisis || [];
  const optionsPf = [...operateurs.map((o) => `electronique:${o}`), PERSONNEL];
  const pfEff = (v) => (optionsPf.includes(v) ? v : optionsPf[0]);
  const opEff = (v) => (operateurs.includes(v) ? v : operateurs[0] || "");
  const versEff = (v, origine) => (operateurs.includes(v) && v !== origine ? v : operateurs.find((o) => o !== origine) || "");
  const sansOperateur = operateurs.length === 0;
  const suivis = d.portefeuilles.filter((pf) => d.soldes[pf.cle]?.renseigne);       // la courbe ne trace que les portefeuilles qui ont un solde
  const sans = suivis.length === 0;
  const indiquer = (pf) => { setReleve({ pf, jour: aujourdhui(), montant: "" }); setFenetre("releve"); };
  // « electronique:Orange » → { portefeuille: "electronique", operateur: "Orange" } ; « personnel » → { portefeuille: "personnel" }
  const separer = (pf) => (pf === PERSONNEL ? { portefeuille: PERSONNEL } : { portefeuille: "electronique", operateur: pf.split(":")[1] });
  const choixPf = (valeur, surChangement, id) => (
    <SelecteurOperateur id={id} valeur={pfEff(valeur)} onChange={surChangement}
      options={[...operateurs.map((o) => ({ valeur: `electronique:${o}`, libelle: `Électronique · ${o}`, operateur: o })), { valeur: PERSONNEL, libelle: "Personnel (argent en poche)", emoji: "👛" }]} />
  );
  const choixOperateur = (valeur, surChangement, id, etiquette, sauf) => (
    <div><label className="label" htmlFor={id}>{etiquette}</label>
      <SelecteurOperateur id={id} valeur={valeur} onChange={surChangement} options={operateurs.filter((o) => o !== sauf)} /></div>
  );
  const libelleMvt = (m) => ({
    retrait: `Retrait ${m.operateur} ${fcfa(m.montant)}${m.frais ? ` (frais ${fcfa(m.frais)})` : ""}`, depot: `Dépôt ${m.operateur} ${fcfa(m.montant)}`,
    transfert: `Transfert ${m.operateur} → ${m.vers} ${fcfa(m.montant)}${m.frais ? ` (frais ${fcfa(m.frais)})` : ""}`,
    entree: `Entrée ${fcfa(m.montant)} · ${nomPf(m.portefeuille, m.operateur)}`, sortie: `Sortie ${fcfa(m.montant)} · ${nomPf(m.portefeuille, m.operateur)}` }[m.type]);
  const electronique = ["entree", "sortie"].includes(mvt.type);
  const texteAide = { retrait: "Le montant sort du compte de l'opérateur (frais compris) et entre dans votre poche.", depot: "Le montant sort de votre poche et entre dans le compte de l'opérateur (frais déduits).",
    transfert: "Le montant (et les frais) sort du compte d'origine et entre dans le compte de destination.", entree: "Le portefeuille choisi est augmenté.", sortie: "Le portefeuille choisi est diminué." }[mvt.type];
  return (
    <section className="space-y-3" data-testid="portefeuilles">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">💼 Mes portefeuilles</h2>
        <div className="flex gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={() => indiquer(pfEff(releve.pf))} data-testid="btn-releve">Indiquer un solde</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => setFenetre("mouvement")} data-testid="btn-mouvement">Retrait / dépôt…</button>
        </div>
      </div>
      {sansOperateur && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900" data-testid="choisir-operateurs">Pour suivre vos comptes mobile money, cochez les opérateurs chez qui vous en avez dans <Link to="/profil" className="font-semibold underline">votre Profil</Link> (« Mes portefeuilles »). Vous pouvez déjà suivre l'argent que vous avez en poche.</p>}
      {!sansOperateur && sans && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Indiquez le solde de chacun de vos comptes et de votre poche : chaque paiement effectué met ensuite le compte de son opérateur à jour, et un retrait déplace l'argent du compte vers votre poche.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {d.portefeuilles.map((pf) => <Carte key={pf.cle} pf={pf} s={d.soldes[pf.cle] || {}} onIndiquer={() => indiquer(pf.cle)} />)}
      </div>

      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Évolution</p>
          <select className="input !w-auto" value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période de la courbe">
            {PERIODES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>
        <GraphePortefeuilles serie={d.serie} portefeuilles={suivis} />
      </div>

      {(d.releves.length > 0 || d.mouvements.length > 0 || d.en_cours.length > 0) && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Relevés, mouvements et paiements en cours</summary>
          <div className="mt-3 space-y-3">
            {d.en_cours.length > 0 && (
              <div><p className="label">⏳ Paiements en cours (non confirmés)</p>
                <ul className="space-y-1">{d.en_cours.map((e, i) => <li key={i} className="flex justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5"><span className="truncate">{e.libelle} <span className="text-xs text-gray-500">· {e.portefeuille}</span></span><b className="tabular-nums">{fcfa(e.montant)}</b></li>)}</ul></div>
            )}
            {d.releves.length > 0 && (
              <div><p className="label">Soldes indiqués</p>
                <ul className="space-y-1">{d.releves.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                    <span>{dateFr(r.jour)} · {r.nom} : <b className="tabular-nums">{fcfa(r.montant)}</b>
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

      <Modal ouvert={fenetre === "releve"} titre="Indiquer un solde" onFermer={() => setFenetre(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); envoyer("/portefeuille/releves", { ...separer(pfEff(releve.pf)), jour: releve.jour, montant: entier(releve.montant) }, "Solde enregistré"); }}>
          <div><label className="label" htmlFor="r-pf">Portefeuille</label>{choixPf(releve.pf, (v) => setReleve({ ...releve, pf: v }), "r-pf")}</div>
          <div><label className="label" htmlFor="r-jour">À la date du</label>
            <input id="r-jour" type="date" className="input" max={aujourdhui()} value={releve.jour} onChange={(e) => setReleve({ ...releve, jour: e.target.value })} required />
            <p className="mt-1 text-xs text-gray-500">Aujourd'hui = votre solde en ce moment : les paiements faits ensuite le feront baisser.</p></div>
          <div><label className="label" htmlFor="r-montant">Solde (FCFA)</label>
            <input id="r-montant" className="input" inputMode="numeric" required value={releve.montant} onChange={(e) => setReleve({ ...releve, montant: e.target.value.replace(/[^\d\s]/g, "") })} placeholder="ex. 85 000" /></div>
          <button type="submit" className="btn-primary w-full" disabled={occupe || releve.montant === ""}>Enregistrer le solde</button>
        </form>
      </Modal>

      <Modal ouvert={fenetre === "mouvement"} titre="Retrait, dépôt, transfert, entrée ou sortie" onFermer={() => setFenetre(null)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const base = { type: mvt.type, montant: entier(mvt.montant), jour: mvt.jour, motif: mvt.motif || undefined };
          const origine = opEff(mvt.operateur);
          const corps = electronique ? { ...base, ...separer(pfEff(mvt.pf)) }
            : mvt.type === "transfert" ? { ...base, operateur: origine, vers: versEff(mvt.vers, origine), frais: entier(mvt.frais) }
            : { ...base, operateur: origine, frais: entier(mvt.frais) };
          envoyer("/portefeuille/mouvements", corps, "Mouvement enregistré");
        }}>
          <div><label className="label" htmlFor="m-type">Opération</label>
            <select id="m-type" className="input" value={mvt.type} onChange={(e) => setMvt({ ...mvt, type: e.target.value })} data-testid="mvt-type">
              {TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
          {electronique
            ? <div><label className="label" htmlFor="m-pf">Portefeuille</label>{choixPf(mvt.pf, (v) => setMvt({ ...mvt, pf: v }), "m-pf")}</div>
            : choixOperateur(opEff(mvt.operateur), (v) => setMvt({ ...mvt, operateur: v }), "m-op", mvt.type === "transfert" ? "Depuis le compte" : "Compte mobile money")}
          {mvt.type === "transfert" && choixOperateur(versEff(mvt.vers, opEff(mvt.operateur)), (v) => setMvt({ ...mvt, vers: v }), "m-vers", "Vers le compte", opEff(mvt.operateur))}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="m-montant">Montant (FCFA)</label>
              <input id="m-montant" className="input" inputMode="numeric" required value={mvt.montant} onChange={(e) => setMvt({ ...mvt, montant: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
            {!electronique && (
              <div><label className="label" htmlFor="m-frais">Frais (facultatif)</label>
                <input id="m-frais" className="input" inputMode="numeric" value={mvt.frais} onChange={(e) => setMvt({ ...mvt, frais: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
            )}
          </div>
          <div><label className="label" htmlFor="m-jour">Date</label>
            <input id="m-jour" type="date" className="input" max={aujourdhui()} value={mvt.jour} onChange={(e) => setMvt({ ...mvt, jour: e.target.value })} required /></div>
          <div><label className="label" htmlFor="m-motif">Motif (facultatif)</label>
            <input id="m-motif" className="input" maxLength={120} value={mvt.motif} onChange={(e) => setMvt({ ...mvt, motif: e.target.value })} /></div>
          <p className="text-xs text-gray-500">{texteAide}</p>
          {mvt.type === "transfert" && operateurs.length < 2 && <p className="text-xs text-amber-700">Un transfert demande au moins deux opérateurs cochés dans votre Profil.</p>}
          <button type="submit" className="btn-primary w-full" disabled={occupe || mvt.montant === "" || (!electronique && sansOperateur) || (mvt.type === "transfert" && (operateurs.length < 2))}>Enregistrer</button>
        </form>
      </Modal>
    </section>
  );
}
