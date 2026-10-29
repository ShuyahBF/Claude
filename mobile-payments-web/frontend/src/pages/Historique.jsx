import { useCallback, useEffect, useMemo, useState } from "react";
import CarteCodeUssd from "@/components/CarteCodeUssd";
import Chargement from "@/components/Chargement";
import DetailsDepense from "@/components/DetailsDepense";
import Camembert from "@/components/Camembert";                    // lot 98 : répartition des bénéficiaires par opérateur
import HistogrammePaiements from "@/components/HistogrammePaiements";   // lot 98 : histogramme en montant, par jour ou par mois
import ImportJournal from "@/components/ImportJournal";           // lot 96 : journal des transactions de l'opérateur
import NomBeneficiaire from "@/components/NomBeneficiaire";       // lot 96 : nom modifiable après coup
import Portefeuilles from "@/components/Portefeuilles";
import SelecteurOperateur from "@/components/SelecteurOperateur";   // lot 89 : listes d'opérateurs avec logos   // lot 86 : portefeuilles électronique / personnel et courbe   // lot 85 : motif et pièces d'une dépense
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, couleurOperateur, dateHeure, fcfa, messageErreur } from "@/lib/api";

// Détail d'un paiement PI-SPI (lot 58) : référence, statut, déclaration de la référence bancaire, abandon. Seul le marchand confirme la réception.
function DetailPispi({ paiement, onChange }) {
  const toast = useToast();
  const [reference, setReference] = useState("");
  const [libelle] = STATUTS[paiement.statut] || STATUTS.prepare;
  const agir = async (action) => {
    try { await action(); onChange(); } catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">{paiement.marchand?.libelle || "Marchand"} · <span className="text-primary">{fcfa(paiement.montant)}</span></p>
      <p className="text-gray-600">Paiement par PI-SPI · référence <span className="font-mono font-bold">{paiement.reference}</span></p>
      <p>Statut : <b>{libelle}</b></p>
      {paiement.reference_bancaire && <p className="text-gray-600">Référence bancaire déclarée : <span className="font-mono">{paiement.reference_bancaire}</span></p>}
      {paiement.statut === "prepare" && (
        <form className="space-y-2 border-t border-gray-100 pt-3" onSubmit={(e) => { e.preventDefault(); agir(() => apiClient.post(`/paiements/${paiement.id}/pispi/declarer`, { reference_bancaire: reference.trim() })); }}>
          <label className="label" htmlFor="h-ref">J'ai payé : référence bancaire de l'opération</label>
          <input id="h-ref" className="input" required minLength={4} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn-primary w-full" disabled={reference.trim().length < 4}>Déclarer mon paiement</button>
        </form>
      )}
      {(paiement.statut === "prepare" || paiement.statut === "declare") && (
        <button type="button" className="btn-outline w-full" onClick={() => agir(() => apiClient.put(`/paiements/${paiement.id}/statut`, { statut: "abandonne" }))}>Abandonner ce paiement</button>
      )}
    </div>
  );
}

const STATUTS = {
  prepare: ["Préparé", "bg-gray-100 text-gray-700"],
  effectue: ["Payé", "bg-green-100 text-green-800"],
  abandonne: ["Abandonné", "bg-red-100 text-red-700"],
  declare: ["À confirmer par le marchand", "bg-amber-100 text-amber-900"],       // PI-SPI : référence déclarée, en attente du marchand
  refuse: ["Refusé par le marchand", "bg-red-100 text-red-700"],
};

// Périodes proposées (liste déroulante) ; « perso » ouvre les champs « du » et « au »
const PERIODES = [
  ["tout", "Toute la période"], ["aujourdhui", "Aujourd'hui"], ["7j", "7 derniers jours"], ["30j", "30 derniers jours"],
  ["mois", "Ce mois-ci"], ["mois-1", "Mois dernier"], ["perso", "Dates personnalisées…"],
];
const PAS_DE_FILTRE = { periode: "30j", du: "", au: "", operateur: "", statut: "effectue", q: "", classement: "effectue" };
const TAILLE_PAGE = 20;

// Date « AAAA-MM-JJ » (heure UTC = heure de Ouagadougou), décalée de n jours
const jourIso = (decalage = 0) => new Date(Date.now() + decalage * 86400000).toISOString().slice(0, 10);

/** Dates de début et de fin correspondant à la période choisie. */
function bornes(f) {
  const auj = jourIso(0);
  switch (f.periode) {
    case "aujourdhui": return { du: auj, au: auj };
    case "7j": return { du: jourIso(-6), au: auj };
    case "30j": return { du: jourIso(-29), au: auj };
    case "mois": return { du: `${auj.slice(0, 8)}01`, au: auj };
    case "mois-1": {
      const d = new Date(`${auj.slice(0, 8)}01T00:00:00Z`);
      const fin = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
      return { du: `${fin.slice(0, 8)}01`, au: fin };
    }
    case "perso": return { du: f.du, au: f.au };
    default: return { du: "", au: "" };
  }
}

// Paramètres envoyés au serveur (les champs vides sont omis)
function parametres(f) {
  const { du, au } = bornes(f);
  // statut « tous » = aucun filtre ; par défaut seuls les paiements confirmés (« Payé ») sont listés
  const p = { du, au, operateur: f.operateur, statut: f.statut === "tous" ? "" : f.statut, q: f.q.trim() };
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
}

// Export Excel (CSV, séparateur « ; », accents conservés) des paiements affichés
function exporterCsv(lignes) {
  const colonnes = ["Date", "Opérateur", "Service", "Bénéficiaire", "Code", "Montant (FCFA)", "Statut", "Code USSD", "Motif", "Pièces"];
  const echapper = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const corps = lignes.map((p) => [dateHeure(p.cree_le), p.operateur, p.service_nom, p.nom_beneficiaire || p.marchand?.libelle || "", p.marchand?.code || "",
    p.montant ?? "", (STATUTS[p.statut] || STATUTS.prepare)[0], p.code_ussd, p.motif || "", (p.pieces || []).length || ""].map(echapper).join(";"));
  const blob = new Blob(["﻿" + [colonnes.map(echapper).join(";"), ...corps].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `historique_paiements_${jourIso(0)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Petite carte de chiffre clé
function Chiffre({ titre, valeur, detail }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{titre}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{valeur}</p>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

// Détail d'une transaction importée du journal de l'opérateur (lot 96) : pas de code USSD, les données viennent de l'opérateur.
function DetailImport({ paiement }) {
  return (
    <div className="space-y-1 text-sm" data-testid="detail-import">
      <p className="font-semibold">{paiement.service_nom} · <span className="text-primary">{fcfa(paiement.montant)}</span></p>
      <p className="text-gray-600">{paiement.sens === "entree" ? "Reçu le" : "Effectué le"} {dateHeure(paiement.cree_le)} · {paiement.operateur}</p>
      <p className="break-all text-xs text-gray-500">Référence de l'opérateur : {paiement.reference_operateur}</p>
      {paiement.frais > 0 && <p className="text-xs text-gray-500">Frais : {fcfa(paiement.frais)}</p>}
      {paiement.libelle_operateur && <p className="text-xs text-gray-500">{paiement.libelle_operateur}</p>}
    </div>
  );
}

// Historique des paiements préparés par l'utilisateur : statistiques par période et par opérateur, classements (Top 10),
// recherche par bénéficiaire, export CSV ; on peut réafficher le QR code d'un paiement, changer son statut ou le supprimer.
export default function Historique() {
  const toast = useToast();
  const [filtres, setFiltres] = useState(PAS_DE_FILTRE);
  const [operateurs, setOperateurs] = useState([]);
  const [stats, setStats] = useState(null);
  const [paiements, setPaiements] = useState(null);
  const [nbAffiches, setNbAffiches] = useState(TAILLE_PAGE);
  const [ouvert, setOuvert] = useState(null);
  const [importOuvert, setImportOuvert] = useState(false);   // lot 96 : fenêtre « Importer un journal »
  const [recherche, setRecherche] = useState("");   // texte tapé ; envoyé au serveur après une courte pause

  useEffect(() => { apiClient.get("/operateurs").then(({ data }) => setOperateurs(data)).catch(() => setOperateurs([])); }, []);
  // Recherche : on attend 400 ms après la dernière frappe avant d'interroger le serveur
  useEffect(() => {
    const t = setTimeout(() => setFiltres((f) => (f.q === recherche ? f : { ...f, q: recherche })), 400);
    return () => clearTimeout(t);
  }, [recherche]);

  const params = useMemo(() => parametres(filtres), [filtres]);
  const charger = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        // Les statistiques ne dépendent pas du choix d'affichage : elles comptent les « Payé » et signalent les non confirmés
        apiClient.get("/paiements/statistiques", { params: { ...params, statut: undefined, classement: filtres.classement } }),
        apiClient.get("/paiements", { params: { ...params, limite: 500 } }),
      ]);
      setStats(s.data);
      setPaiements(l.data);
    } catch (err) {
      toast.erreur(messageErreur(err, "Historique indisponible"));
      setStats((x) => x || { totaux: {}, par_operateur: [], par_service: [], par_jour: [], par_mois: [], beneficiaires_par_operateur: {}, top_montants: [], top_beneficiaires: [] });
      setPaiements((x) => x || []);
    }
  }, [params, filtres.classement, toast]);
  useEffect(() => { setNbAffiches(TAILLE_PAGE); charger(); }, [charger]);

  const modifier = (champ, valeur) => setFiltres((f) => ({ ...f, [champ]: valeur }));

  const changerStatut = async (statut) => {
    try {
      await apiClient.put(`/paiements/${ouvert.id}/statut`, { statut });
      setOuvert(null);
      charger();   // les statistiques suivent le nouveau statut
    } catch (err) {
      toast.erreur(messageErreur(err));
    }
  };

  const supprimer = async (p) => {
    if (!window.confirm("Supprimer ce paiement de l'historique ?")) return;
    try {
      await apiClient.delete(`/paiements/${p.id}`);
      setOuvert(null);
      charger();
    } catch (err) {
      toast.erreur(messageErreur(err));
    }
  };

  if (paiements === null || stats === null) return <Chargement />;
  const t = stats.totaux || {};
  const maxOp = Math.max(1, ...stats.par_operateur.map((o) => o.nombre));
  const filtreActif = JSON.stringify(filtres) !== JSON.stringify(PAS_DE_FILTRE);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Historique</h1>

      {/* Filtres : période, opérateur, statut, recherche de bénéficiaire */}
      {/* Lot 86 : soldes des deux portefeuilles, courbe d'évolution, retraits et dépôts (se recalcule quand un paiement change de statut) */}
      <Portefeuilles rafraichir={paiements ? paiements.map((p) => `${p.id}${p.statut}`).join("|") : ""} />

      <section className="card space-y-3" data-testid="filtres">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="f-periode">Période</label>
            <select id="f-periode" className="input" value={filtres.periode} onChange={(e) => modifier("periode", e.target.value)}>
              {PERIODES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-operateur">Opérateur</label>
            <SelecteurOperateur id="f-operateur" valeur={filtres.operateur} onChange={(v) => modifier("operateur", v)} options={operateurs} vide="Tous les opérateurs" />
          </div>
          {filtres.periode === "perso" && (
            <>
              <div><label className="label" htmlFor="f-du">Du</label>
                <input id="f-du" type="date" className="input" max={filtres.au || undefined} value={filtres.du} onChange={(e) => modifier("du", e.target.value)} /></div>
              <div><label className="label" htmlFor="f-au">Au</label>
                <input id="f-au" type="date" className="input" min={filtres.du || undefined} value={filtres.au} onChange={(e) => modifier("au", e.target.value)} /></div>
            </>
          )}
          <div>
            <label className="label" htmlFor="f-statut">Afficher</label>
            <select id="f-statut" className="input" value={filtres.statut} onChange={(e) => modifier("statut", e.target.value)}>
              <option value="effectue">Payés (confirmés)</option>
              <option value="prepare">Non confirmés (préparés)</option>
              <option value="abandonne">Abandonnés</option>
              <option value="tous">Tous les statuts</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-q">Bénéficiaire, code ou numéro</label>
            <input id="f-q" className="input" placeholder="Ex. : Pharmacie, 445566, 70 11 22 33" value={recherche}
              onChange={(e) => setRecherche(e.target.value)} />
          </div>
        </div>
        {filtreActif && (
          <button type="button" className="btn-outline btn-sm" onClick={() => { setFiltres(PAS_DE_FILTRE); setRecherche(""); }}>
            Réinitialiser les filtres
          </button>
        )}
      </section>

      {stats.tronque && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Résultats limités aux 5 000 paiements les plus récents : affinez la période.</p>}

      {/* Chiffres clés */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="chiffres">
        <Chiffre titre="Paiements effectués" valeur={t.nombre ?? 0} detail={`Non comptés : ${t.prepares ?? 0} préparé${(t.prepares ?? 0) > 1 ? "s" : ""} · ${t.abandonnes ?? 0} abandonné${(t.abandonnes ?? 0) > 1 ? "s" : ""}`} />
        <Chiffre titre="Montant payé" valeur={fcfa(t.montant_paye ?? 0)} detail={`Payés sur l'ensemble des codes : ${t.taux_payes ?? 0} %`} />
                <Chiffre titre="Montant moyen" valeur={fcfa(t.montant_moyen ?? 0)} />
        <Chiffre titre="Plus gros paiement" valeur={fcfa(t.plus_gros ?? 0)} />
        <Chiffre titre="Opérateurs payés" valeur={stats.par_operateur.length} />
      </section>

      {/* Une carte par opérateur */}
      {stats.par_operateur.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Par opérateur</h2>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="cartes-operateurs">
            {stats.par_operateur.map((o) => (
              <div key={o.operateur} className="card space-y-2 p-4">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="h-3 w-3 rounded-full" style={{ background: couleurOperateur(o.operateur) }} />{o.operateur}
                </p>
                <p className="text-2xl font-bold tabular-nums">{o.nombre} <span className="text-sm font-medium text-gray-500">paiement{o.nombre > 1 ? "s" : ""}</span></p>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full" style={{ width: `${(o.nombre / maxOp) * 100}%`, background: couleurOperateur(o.operateur) }} />
                </div>
                <p className="text-xs text-gray-600">{fcfa(o.montant_paye)} payés</p>
                {o.non_payes > 0 && <p className="text-xs text-gray-500">{o.non_payes} code{o.non_payes > 1 ? "s" : ""} non confirmé{o.non_payes > 1 ? "s" : ""} (non compté{o.non_payes > 1 ? "s" : ""})</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activité par jour ou par mois, en montant ou en nombre (lot 98) */}
      <HistogrammePaiements parJour={stats.par_jour} parMois={stats.par_mois || []} />

      {/* Classements : Top 10 des montants et des bénéficiaires */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold">Classements</h2>
          <div>
            <label className="label" htmlFor="f-classement">Classer sur</label>
            <select id="f-classement" className="input" value={filtres.classement} onChange={(e) => modifier("classement", e.target.value)}>
              <option value="effectue">Paiements indiqués payés</option>
              <option value="tous">Tous les paiements</option>
            </select>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card overflow-x-auto p-0" data-testid="top-montants">
            <p className="px-4 pt-3 font-semibold">Top 10 des montants</p>
            <table className="table">
              <thead><tr><th>#</th><th>Bénéficiaire</th><th className="text-right">Montant</th></tr></thead>
              <tbody>
                {stats.top_montants.length === 0 && <tr><td colSpan={3} className="text-gray-500">Aucun paiement.</td></tr>}
                {stats.top_montants.map((m, i) => (
                  <tr key={m.id}>
                    <td>{i + 1}</td>
                    <td><p className="font-medium">{m.beneficiaire}</p><p className="text-xs text-gray-500">{m.operateur} · {dateHeure(m.cree_le)}</p></td>
                    <td className="text-right font-semibold tabular-nums">{fcfa(m.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto p-0" data-testid="top-beneficiaires">
            <p className="px-4 pt-3 font-semibold">Top 10 des bénéficiaires</p>
            <table className="table">
              <thead><tr><th>#</th><th>Bénéficiaire</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {stats.top_beneficiaires.length === 0 && <tr><td colSpan={3} className="text-gray-500">Aucun paiement.</td></tr>}
                {stats.top_beneficiaires.map((b, i) => (
                  <tr key={`${b.operateur}-${b.code}-${i}`}>
                    <td>{i + 1}</td>
                    <td><p className="font-medium">{b.libelle}</p><p className="text-xs text-gray-500">{b.operateur}{b.code && b.code !== b.libelle ? ` · ${b.code}` : ""} · {b.nombre} paiement{b.nombre > 1 ? "s" : ""}</p></td>
                    <td className="text-right font-semibold tabular-nums">{fcfa(b.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Lot 98 : un camembert par opérateur — part de chaque bénéficiaire dans les paiements de cet opérateur */}
        {Object.keys(stats.beneficiaires_par_operateur || {}).length > 0 && (
          <div className="space-y-2" data-testid="camemberts-operateurs">
            <h3 className="font-semibold">Bénéficiaires par opérateur (en montant)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(stats.beneficiaires_par_operateur).map(([op, r]) => (
                <div key={op} className="card space-y-2 p-4">
                  <p className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: couleurOperateur(op) }} />{op}
                    <span className="ml-auto text-xs font-medium tabular-nums text-gray-500">{fcfa(r.total)}</span></p>
                  <Camembert parts={r.parts} total={r.total} titre={`Bénéficiaires ${op}`} />
                </div>
              ))}
            </div>
          </div>
        )}
        {stats.par_service.length > 0 && (
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Services les plus utilisés : </span>
            {stats.par_service.slice(0, 4).map((s) => `${s.service} (${s.operateur}) × ${s.nombre}`).join(" · ")}
          </p>
        )}
      </section>

      {/* Liste des paiements */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Paiements ({paiements.length})</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => setImportOuvert(true)} data-testid="ouvrir-import">⬆ Importer un journal</button>
            {paiements.length > 0 && <button type="button" className="btn-outline btn-sm" onClick={() => exporterCsv(paiements)}>⬇ Exporter en CSV</button>}
          </div>
        </div>
        {paiements.length === 0 && <p className="card text-gray-500">Aucun paiement pour ces critères.</p>}
        {/* Rappel : par défaut les codes non confirmés sont masqués */}
        {filtres.statut === "effectue" && (t.prepares > 0 || t.abandonnes > 0) && (
          <p className="text-sm text-gray-500">
            {(t.prepares ?? 0) + (t.abandonnes ?? 0)} code(s) non confirmé(s) masqué(s).{" "}
            <button type="button" className="font-semibold text-primary underline" onClick={() => modifier("statut", "tous")}>Les afficher</button>
          </p>
        )}
        <ul className="space-y-2">
          {paiements.slice(0, nbAffiches).map((p) => {
            const [libelle, style] = STATUTS[p.statut] || STATUTS.prepare;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setOuvert(p)} className="choix">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurOperateur(p.operateur) }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.service_nom}{(p.nom_beneficiaire || p.marchand?.libelle) ? ` · ${p.nom_beneficiaire || p.marchand.libelle}` : ""}</p>
                    <p className="text-xs text-gray-500">{p.operateur} · {dateHeure(p.cree_le)}{p.pieces?.length ? ` · 📎 ${p.pieces.length}` : ""}</p>
                    {p.motif && <p className="truncate text-xs text-gray-600" data-testid="ligne-motif">{p.motif}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fcfa(p.montant)}</p>
                    <span className={`badge ${style}`}>{libelle}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {paiements.length > nbAffiches && (
          <button type="button" className="btn-outline w-full" onClick={() => setNbAffiches((n) => n + TAILLE_PAGE)}>
            Afficher plus ({paiements.length - nbAffiches} restants)
          </button>
        )}
      </section>

      <Modal ouvert={importOuvert} titre="Importer un journal de l'opérateur" onFermer={() => setImportOuvert(false)}>
        <ImportJournal operateurs={operateurs} onTermine={() => { setImportOuvert(false); charger(); }} />
      </Modal>

      <Modal ouvert={!!ouvert} titre="Paiement" onFermer={() => setOuvert(null)}>
        {ouvert && (
          <>
            {ouvert.mode === "pispi" ? <DetailPispi paiement={ouvert} onChange={() => { setOuvert(null); charger(); }} />
              : ouvert.mode === "import" ? <DetailImport paiement={ouvert} />
              : <CarteCodeUssd paiement={ouvert} onStatut={changerStatut} />}
            {/* Lot 85 : motif détaillé et pièces scannées, quel que soit le statut du paiement */}
            {/* Lot 96 : nom du bénéficiaire modifiable après la transaction */}
            <NomBeneficiaire key={`nom-${ouvert.id}`} paiement={ouvert} onChange={(maj) => { setOuvert(maj); setPaiements((l) => (l || []).map((x) => (x.id === maj.id ? { ...x, ...maj, nom_beneficiaire: maj.nom_beneficiaire } : x))); if (maj.autres_modifies > 0) charger(); }} />
            <DetailsDepense key={ouvert.id} paiement={ouvert} onChange={(maj) => { setOuvert(maj); setPaiements((l) => (l || []).map((x) => (x.id === maj.id ? { ...x, ...maj } : x))); }} />
            <button type="button" className="mt-4 w-full text-sm text-red-600 hover:underline" onClick={() => supprimer(ouvert)}>
              Supprimer de l'historique
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
