import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chargement from "@/components/Chargement";
import LogoMode from "@/components/LogoMode";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, fcfa, messageErreur } from "@/lib/api";

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
  const [enCours, setEnCours] = useState("");        // formule en cours d'achat
  const [code, setCode] = useState("");
  const [envoiCode, setEnvoiCode] = useState(false);
  const [pispi, setPispi] = useState(null);          // paiement PI-SPI en cours : { formule, reference, bloc, statut } (null = fenêtre fermée)
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

  const acheter = async (f) => {
    setEnCours(f.id);
    try {
      const { data } = await apiClient.post("/abonnement/acheter", { formule_id: f.id });
      window.location.href = data.redirect_url;     // page de paiement PawaPay (Orange / Moov / Telecel)
    } catch (err) { toast.erreur(messageErreur(err, "Paiement indisponible")); setEnCours(""); }
  };
  // Paiement PI-SPI (version manuelle) : 1. on affiche le QR de la banque et la référence ; 2. l'utilisateur paie puis déclare la référence bancaire ;
  // 3. l'administrateur confirme chez SAWALI, la formule s'active (la fenêtre le vérifie toutes les 15 s).
  const payerParPispi = async (f) => {
    setEnCours(f.id);
    try {
      const { data } = await apiClient.post("/abonnement/pispi", { formule_id: f.id });
      setRefBanque("");
      setPispi({ formule: f, reference: data.reference, bloc: data.bloc, statut: data.statut });
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
        if (data.statut === "paye" || data.statut === "echec") { setPispi(null); setAchat(data.statut); charger(); }
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
            return (
              <li key={f.id} className="card space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-semibold">{f.nom}</p>{f.description && <p className="text-sm text-gray-600">{f.description}</p>}</div>
                  <div className="shrink-0 text-right"><p className="text-lg font-bold text-primary">{fcfa(f.prix)}</p><p className="text-xs text-gray-500">pour {f.duree_jours} jours</p></div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payer avec</p>
                <button type="button" className="btn-primary w-full justify-start gap-3" disabled={!!enCours} onClick={() => acheter(f)}>
                  <LogoMode mode="pawapay" />
                  <span className="flex-1 text-left">{enCours === f.id ? "Patientez…" : <>{deja ? `Prolonger de ${f.duree_jours} jours` : "S'abonner"} · PawaPay<span className="block text-xs font-normal opacity-90">Orange, Moov, Telecel (Mobile Money)</span></>}</span>
                </button>
                <button type="button" className="btn-outline w-full justify-start gap-3" disabled={!!enCours} onClick={() => payerParPispi(f)}>
                  <LogoMode mode="pispi" />
                  <span className="flex-1 text-left">Virement PI-SPI<span className="block text-xs font-normal text-gray-500">Avec l'application de votre banque</span></span>
                </button>
                {deja && <p className="text-xs text-gray-500">La durée s'ajoute au temps qu'il vous reste.</p>}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-gray-500">Paiement sécurisé par PawaPay (Orange, Moov, Telecel) : la formule s'active dès la confirmation du paiement. Par virement PI-SPI, elle s'active après vérification de votre paiement.</p>
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

      {/* Paiement PI-SPI (version manuelle) */}
      <Modal ouvert={!!pispi} titre="Payer par PI-SPI" onFermer={() => setPispi(null)}>
        {pispi && (
          <div className="space-y-3 text-sm">
            <p><b>{pispi.formule.nom}</b> · <span className="text-lg font-bold text-primary">{pispi.bloc.montant_texte}</span></p>
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
