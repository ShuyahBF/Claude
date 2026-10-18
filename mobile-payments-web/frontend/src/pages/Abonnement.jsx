import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chargement from "@/components/Chargement";
import LogoMode from "@/components/LogoMode";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, fcfa, messageErreur } from "@/lib/api";

// Lot 81 (demande du propriétaire du 18/10/2026) : on peut choisir PLUSIEURS formules ; le total se calcule en direct ; un résumé
// (formules choisies et montant total) s'affiche AVANT le paiement ; c'est ce total, recalculé par SAWALI, qui est payé en un seul paiement.
// Abonnement (lot 37) : les formules sont créées et vendues par SAWALI. Un paiement (page PawaPay) active la formule pour
// sa durée (30 jours par défaut) ; payer avant l'échéance AJOUTE la durée au temps restant. Parrainage : jours offerts
// au parrain et au filleul quand le filleul paie sa première formule.
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function Abonnement() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);                  // { formules, abonnements, code_parrainage, a_un_parrain, parrainage_jours }
  const [parrain, setParrain] = useState(null);      // { filleuls, filleuls_payants, jours_gagnes }
  const [achat, setAchat] = useState(null);          // au retour du paiement : "verification" | "paye" | "echec" | "attente"
  const [enCours, setEnCours] = useState("");        // paiement en cours de lancement
  const [choix, setChoix] = useState([]);            // identifiants des formules cochées
  const [resume, setResume] = useState(null);        // résumé avant paiement : { lignes, total } calculé par SAWALI (null = fenêtre fermée)
  const [calcul, setCalcul] = useState(false);       // résumé en cours de calcul
  const [code, setCode] = useState("");
  const [envoiCode, setEnvoiCode] = useState(false);
  const [pispi, setPispi] = useState(null);          // paiement PI-SPI en cours : { libelle, total, reference, bloc, statut } (null = fenêtre fermée)
  const [refBanque, setRefBanque] = useState("");    // référence bancaire saisie par l'utilisateur
  const [envoiPispi, setEnvoiPispi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([apiClient.get("/abonnement"), apiClient.post("/abonnement/parrainage", { code: "" })]);
      setD(v.data); setParrain(p.data);
    } catch (err) {
      toast.erreur(messageErreur(err, "Abonnement indisponible"));
      setD((x) => x || { formules: [], abonnements: [], code_parrainage: "", a_un_parrain: false, parrainage_jours: 0, indisponible: true });
    }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  // Retour de la page de paiement : ?depositId=… → vérification (10 essais, 2 s d'intervalle)
  const depositId = params.get("depositId");
  useEffect(() => {
    if (!depositId) return undefined;
    let fini = false;
    setAchat("verification");
    (async () => {
      for (let i = 0; i < 10 && !fini; i += 1) {
        try {
          const { data } = await apiClient.get("/abonnement/achat", { params: { deposit_id: depositId } });
          if (data.statut !== "attente") { if (!fini) { setAchat(data.statut); charger(); } return; }
        } catch { /* nouvel essai */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!fini) setAchat("attente");
    })();
    return () => { fini = true; };
  }, [depositId, charger]);

  // Sélection : total calculé en direct à partir des prix du catalogue (le paiement, lui, utilise le total recalculé par SAWALI)
  const basculer = (id) => setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const choisies = (d?.formules || []).filter((f) => choix.includes(f.id));
  const totalChoix = choisies.reduce((t, f) => t + Number(f.prix || 0), 0);
  // Résumé avant paiement : lignes et total fournis par SAWALI (ce qui sera réellement payé)
  const voirResume = async () => {
    setCalcul(true);
    try { setResume((await apiClient.post("/abonnement/devis", { formule_ids: choisies.map((f) => f.id) })).data); }
    catch (err) { toast.erreur(messageErreur(err, "Résumé indisponible")); } finally { setCalcul(false); }
  };
  const acheter = async () => {
    setEnCours("pawapay");
    try {
      const { data } = await apiClient.post("/abonnement/acheter", { formule_ids: choix });
      window.location.href = data.redirect_url;     // page de paiement PawaPay (Orange / Moov / Telecel) pour le TOTAL
    } catch (err) { toast.erreur(messageErreur(err, "Paiement indisponible")); setEnCours(""); }
  };
  // Paiement PI-SPI (version manuelle) : 1. on affiche le QR de la banque et la référence ; 2. l'utilisateur paie puis déclare la référence bancaire ;
  // 3. l'administrateur confirme chez SAWALI, la formule s'active (la fenêtre le vérifie toutes les 15 s).
  const payerParPispi = async () => {
    setEnCours("pispi");
    try {
      const { data } = await apiClient.post("/abonnement/pispi", { formule_ids: choix });
      setRefBanque("");
      setResume(null);
      setPispi({ libelle: (data.lignes || []).map((l) => l.nom).join(" + "), total: data.total, reference: data.reference, bloc: data.bloc, statut: data.statut });
    } catch (err) { toast.erreur(messageErreur(err, "Paiement PI-SPI indisponible")); } finally { setEnCours(""); }
  };
  const declarerPispi = async (e) => {
    e.preventDefault();
    setEnvoiPispi(true);
    try {
      await apiClient.post("/abonnement/pispi/declarer", { reference: pispi.reference, reference_bancaire: refBanque });
      setPispi((x) => ({ ...x, statut: "pispi_verification" }));
      toast.succes("Paiement déclaré : il va être vérifié");
    } catch (err) { toast.erreur(messageErreur(err, "Déclaration impossible")); } finally { setEnvoiPispi(false); }
  };
  const referencePispi = pispi?.reference;
  const statutPispi = pispi?.statut;
  useEffect(() => {
    if (!referencePispi || statutPispi !== "pispi_verification") return undefined;
    const t = setInterval(async () => {
      try {
        const { data } = await apiClient.get("/abonnement/achat", { params: { deposit_id: referencePispi } });
        if (data.statut === "paye" || data.statut === "echec") { setPispi(null); setChoix([]); setAchat(data.statut); charger(); }
      } catch { /* nouvel essai dans 15 s */ }
    }, 15000);
    return () => clearInterval(t);
  }, [referencePispi, statutPispi, charger]);
  const copierReference = async () => {
    try { await navigator.clipboard.writeText(pispi.reference); toast.succes("Référence copiée"); } catch { toast.info(pispi.reference); }
  };
  const enregistrerCode = async (e) => {
    e.preventDefault();
    setEnvoiCode(true);
    try { const { data } = await apiClient.post("/abonnement/parrainage", { code }); setParrain(data); setD((x) => ({ ...x, a_un_parrain: true })); setCode(""); toast.succes(data.message || "Code enregistré"); }
    catch (err) { toast.erreur(messageErreur(err, "Code refusé")); } finally { setEnvoiCode(false); }
  };
  const copier = async () => {
    try { await navigator.clipboard.writeText(d.code_parrainage); toast.succes("Code copié"); } catch { toast.info(d.code_parrainage); }
  };
  const partager = () => {
    const texte = `Rejoins-moi sur auRor ! Utilise mon code de parrainage ${d.code_parrainage} avant ton premier abonnement : nous gagnons chacun ${d.parrainage_jours} jours offerts. ${window.location.origin}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank", "noopener,noreferrer");
  };
  const fermerRetour = () => { setAchat(null); setParams({}, { replace: true }); };

  if (!d) return <Chargement />;
  const actifs = d.abonnements.filter((a) => a.actif);
  const expires = d.abonnements.filter((a) => !a.actif);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">🎟️ Abonnement</h1>

      {achat && (
        <div className={`rounded-lg p-3 text-sm ${achat === "paye" ? "bg-green-50 text-green-800" : achat === "echec" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"}`} role="status">
          {achat === "verification" && "Vérification de votre paiement…"}
          {achat === "paye" && "✅ Paiement reçu : votre formule est activée."}
          {achat === "echec" && "Le paiement n'a pas abouti ou a été refusé. Aucun montant n'a été activé ; vous pouvez réessayer."}
          {achat === "attente" && "Paiement en cours de confirmation : la formule s'activera dès qu'il sera confirmé (rechargez cette page dans un instant)."}
          {achat !== "verification" && <button type="button" className="ml-2 underline" onClick={fermerRetour}>Fermer</button>}
        </div>
      )}
      {d.indisponible && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Le service d'abonnement est momentanément indisponible. Réessayez dans un instant.</p>}

      {/* Mes abonnements */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Mes abonnements</h2>
        {actifs.length === 0 && <p className="card text-gray-500">Aucun abonnement actif.</p>}
        <ul className="space-y-2">
          {actifs.map((a) => (
            <li key={a.formule_id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0"><p className="truncate font-semibold">{a.nom}</p><p className="text-sm text-gray-500">Jusqu'au {dateFr(a.expire_le)}</p></div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${a.jours_restants <= 3 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{a.jours_restants} j restants</span>
            </li>
          ))}
          {expires.map((a) => (
            <li key={a.formule_id} className="card flex items-center justify-between gap-3 p-3 opacity-70">
              <div className="min-w-0"><p className="truncate font-semibold">{a.nom}</p><p className="text-sm text-gray-500">Expiré le {dateFr(a.expire_le)}</p></div>
              <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">Expiré</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Formules proposées par SAWALI */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Formules disponibles</h2>
        {d.formules.length === 0 && !d.indisponible && <p className="card text-gray-500">Aucune formule proposée pour le moment.</p>}
        <ul className="space-y-2">
          {d.formules.map((f) => {
            const deja = actifs.some((a) => a.formule_id === f.id);
            const coche = choix.includes(f.id);
            return (
              <li key={f.id}>
                <label className={`card flex cursor-pointer items-start gap-3 p-4 transition ${coche ? "border-primary ring-2 ring-primary/30" : ""}`}>
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={coche} onChange={() => basculer(f.id)} data-testid={`formule-${f.id}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{f.nom}</span>
                    {f.description && <span className="block text-sm text-gray-600">{f.description}</span>}
                    {deja && <span className="mt-1 block text-xs text-gray-500">Déjà active : la durée s'ajoute au temps qu'il vous reste.</span>}
                  </span>
                  <span className="shrink-0 text-right"><span className="block text-lg font-bold text-primary">{fcfa(f.prix)}</span><span className="block text-xs text-gray-500">pour {f.duree_jours} jours</span></span>
                </label>
              </li>
            );
          })}
        </ul>
        {/* Total en direct : visible dès qu'une formule est cochée */}
        {choisies.length > 0 && (
          <div className="card sticky bottom-24 space-y-2 border-primary p-4 shadow-lg" data-testid="total-selection">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-600">{choisies.length} formule{choisies.length > 1 ? "s" : ""} choisie{choisies.length > 1 ? "s" : ""}</p>
              <p className="text-xl font-bold text-primary" data-testid="total-montant">{fcfa(totalChoix)}</p>
            </div>
            <button type="button" className="btn-primary w-full py-3" disabled={calcul} onClick={voirResume}>{calcul ? "Patientez…" : "Voir le résumé et payer"}</button>
            <button type="button" className="btn-outline w-full" onClick={() => setChoix([])}>Tout décocher</button>
          </div>
        )}
        <p className="text-xs text-gray-500">Paiement sécurisé par PawaPay (Orange, Moov, Telecel) : les formules s'activent dès la confirmation du paiement. Par virement PI-SPI, elles s'activent après vérification de votre paiement.</p>
      </section>

      {/* Parrainage */}
      {d.code_parrainage && (
        <section className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">🤝 Parrainage</h2>
          <p className="text-sm text-gray-600">Invitez un proche : quand il paie sa première formule, vous gagnez <b>chacun {d.parrainage_jours} jours</b> offerts.</p>
          <div className="flex items-center gap-2">
            <p className="flex-1 rounded-xl bg-creme px-4 py-3 text-center font-mono text-xl font-bold tracking-widest" data-testid="code-parrainage">{d.code_parrainage}</p>
            <button type="button" className="btn-outline" onClick={copier}>Copier</button>
          </div>
          <button type="button" className="btn-outline w-full" onClick={partager}>Partager par WhatsApp</button>
          {parrain && <p className="text-sm text-gray-600" data-testid="stats-parrainage">{parrain.filleuls} filleul{parrain.filleuls > 1 ? "s" : ""} · {parrain.filleuls_payants} ayant payé · {parrain.jours_gagnes} jours gagnés</p>}
          {!d.a_un_parrain && (
            <form onSubmit={enregistrerCode} className="space-y-2 border-t border-gray-100 pt-3">
              <label className="label" htmlFor="code-parrain">J'ai un code de parrainage <span className="font-normal text-gray-400">(avant mon premier abonnement)</span></label>
              <div className="flex gap-2">
                <input id="code-parrain" className="input min-w-0 flex-1 uppercase" maxLength={12} placeholder="Ex. PA7K3Q9X" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
                <button type="submit" className="btn-primary" disabled={envoiCode || code.trim().length < 4}>{envoiCode ? "Patientez…" : "Valider"}</button>
              </div>
            </form>
          )}
          {d.a_un_parrain && <p className="text-xs text-green-700">✓ Code de parrain enregistré.</p>}
        </section>
      )}

      {/* Résumé avant paiement : formules choisies, total (calculé par SAWALI), puis choix du moyen de paiement */}
      <Modal ouvert={!!resume} titre="Résumé de votre commande" onFermer={() => setResume(null)}>
        {resume && (
          <div className="space-y-3 text-sm" data-testid="resume-commande">
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {resume.lignes.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0"><span className="block font-semibold">{l.nom}</span><span className="block text-xs text-gray-500">{l.duree_jours} jours</span></span>
                  <span className="shrink-0 font-semibold">{fcfa(l.prix)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-creme p-3">
                <span className="font-bold">Total à payer</span><span className="text-xl font-bold text-primary" data-testid="resume-total">{fcfa(resume.total)}</span>
              </li>
            </ul>
            <p className="text-xs text-gray-500">Un seul paiement pour toutes ces formules. Si l'une d'elles est déjà active, sa durée s'ajoute au temps restant.</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payer {fcfa(resume.total)} avec</p>
            <button type="button" className="btn-primary w-full justify-start gap-3" disabled={!!enCours} onClick={acheter}>
              <LogoMode mode="pawapay" />
              <span className="flex-1 text-left">{enCours === "pawapay" ? "Patientez…" : <>PawaPay<span className="block text-xs font-normal opacity-90">Orange, Moov, Telecel (Mobile Money)</span></>}</span>
            </button>
            <button type="button" className="btn-outline w-full justify-start gap-3" disabled={!!enCours} onClick={payerParPispi}>
              <LogoMode mode="pispi" />
              <span className="flex-1 text-left">{enCours === "pispi" ? "Patientez…" : <>Virement PI-SPI<span className="block text-xs font-normal text-gray-500">Avec l'application de votre banque</span></>}</span>
            </button>
          </div>
        )}
      </Modal>

      {/* Paiement PI-SPI (version manuelle) */}
      <Modal ouvert={!!pispi} titre="Payer par PI-SPI" onFermer={() => setPispi(null)}>
        {pispi && (
          <div className="space-y-3 text-sm">
            <p><b>{pispi.libelle}</b> · <span className="text-lg font-bold text-primary">{pispi.bloc.montant_texte}</span></p>
            <div className="flex justify-center"><img src={pispi.bloc.qr_data_url} alt="QR code PI-SPI de la banque" className="h-48 w-48 rounded-lg border border-gray-200 bg-white p-2" /></div>
            <dl className="space-y-1 rounded-lg bg-creme p-3">
              <div><dt className="inline text-gray-500">Banque : </dt><dd className="inline font-semibold">{pispi.bloc.banque}</dd></div>
              {pispi.bloc.titulaire && <div><dt className="inline text-gray-500">Bénéficiaire : </dt><dd className="inline font-semibold">{pispi.bloc.titulaire}</dd></div>}
              <div><dt className="inline text-gray-500">Adresse de paiement : </dt><dd className="inline font-mono">{pispi.bloc.adresse_paiement}</dd></div>
              <div className="flex items-center gap-2"><dt className="text-gray-500">Référence à indiquer :</dt><dd className="font-mono font-bold">{pispi.reference}</dd>
                <button type="button" className="btn-outline btn-sm" onClick={copierReference}>Copier</button></div>
            </dl>
            <p className="text-gray-600">{pispi.bloc.consigne}</p>
            {pispi.statut === "pispi_verification" ? (
              <p className="rounded-lg bg-amber-50 p-3 text-amber-900" role="status">⏳ Paiement déclaré : il est en cours de vérification. Votre formule s'activera dès la confirmation (cette fenêtre se met à jour toute seule).</p>
            ) : (
              <form onSubmit={declarerPispi} className="space-y-2 border-t border-gray-100 pt-3">
                <label className="label" htmlFor="ref-banque">Après le virement : référence bancaire de l'opération</label>
                <input id="ref-banque" className="input" required minLength={4} maxLength={120} placeholder="Numéro reçu de votre banque" value={refBanque} onChange={(e) => setRefBanque(e.target.value)} autoComplete="off" />
                <button type="submit" className="btn-primary w-full" disabled={envoiPispi || refBanque.trim().length < 4}>{envoiPispi ? "Patientez…" : "J'ai payé"}</button>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
