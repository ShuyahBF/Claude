import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { EVENEMENT_ASSISTANT, EVENEMENT_MAJ } from "@/components/AssistantSauvegarde";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { messageErreur } from "@/lib/api";
import { cleCourante } from "@/lib/archiveCrypto";
import { cleDuJournal, lireCleCoffre, oublierCleCoffre, pourUtilisateur } from "@/lib/journalIntime";
import { alerteSauvegarde, definirModeServeur, effacerAlerte, effacerSauvegardeServeur, lireEtatServeur, oublierResultat, resumeComptes, sauvegarder } from "@/lib/sauvegarde";
import { VERSION } from "@/version";

// Bloc « Sécurité et sauvegarde » du profil (lot 168) : l'utilisateur voit et CHANGE son mode (en ligne chiffrée / ce téléphone seulement),
// sauvegarde tout de suite, retrouve ses données, efface la sauvegarde en ligne ou oublie la clé sur ce téléphone.
const dateFr = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }); } catch { return ""; } };
const taille = (o) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

export default function BlocSauvegarde() {
  const toast = useToast();
  const { user } = useAuth();
  const [e, setE] = useState(undefined);              // undefined = lecture ; null = indisponible
  const [cleAppareil, setCleAppareil] = useState(false);
  const [confirm, setConfirm] = useState(null);       // null | "local" | "effacer" | "oublier" | "moins"
  const [refus, setRefus] = useState(null);           // { raison, comptes, ancien } : sauvegarde retenue par les contrôles, en attente de décision
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    pourUtilisateur(user?.id);
    setE(await lireEtatServeur());
    setCleAppareil(!!cleCourante() || !!(await lireCleCoffre()));
  }, [user?.id]);
  useEffect(() => { charger(); window.addEventListener(EVENEMENT_MAJ, charger); return () => window.removeEventListener(EVENEMENT_MAJ, charger); }, [charger]);

  const demander = (action) => window.dispatchEvent(new CustomEvent(EVENEMENT_ASSISTANT, { detail: { action } }));
  const changerMode = (mode) => { if (mode === "cloud") demander("activer"); else setConfirm("local"); };
  const maintenant = async (confirmerMoins = false) => {
    setOccupe(true); toast.info("Sauvegarde et vérification en cours…");
    try {
      pourUtilisateur(user?.id);
      const r = await sauvegarder(await cleDuJournal(), { force: true, app: String(VERSION), confirmerMoins });
      if (r.fait) toast.succes(`Sauvegarde terminée et VÉRIFIÉE : ${resumeComptes(r.comptes)} (chiffrées).`);
      else if (r.raison === "coffre_ferme") { toast.info("Remettez votre secret pour sauvegarder."); demander("activer"); }
      else if (r.raison === "moins" || r.raison === "vide") { setRefus(r); setConfirm("moins"); }      // protège la bonne sauvegarde : on demande avant de la remplacer
      await charger();
    } catch (err) { toast.erreur(err?.name === "SauvegardeRefusee" ? err.message : messageErreur(err, "Sauvegarde impossible")); } finally { setOccupe(false); }
  };
  const passerLocal = async (effacer) => {
    setOccupe(true); toast.info("Changement de mode en cours…");
    try {
      if (effacer) { await effacerSauvegardeServeur(); oublierResultat(); } else await definirModeServeur("local");
      await oublierCleCoffre();
      toast.succes(effacer ? "Sauvegarde en ligne effacée : vos données restent sur ce téléphone." : "Mode « ce téléphone seulement » : la sauvegarde en ligne n'est plus mise à jour.");
      setConfirm(null); await charger();
    } catch (err) { toast.erreur(messageErreur(err, "Changement impossible")); } finally { setOccupe(false); }
  };
  const effacerEnLigne = async () => {
    setOccupe(true); toast.info("Effacement en cours…");
    try { await effacerSauvegardeServeur(); oublierResultat(); toast.succes("Sauvegarde en ligne effacée."); setConfirm(null); await charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Effacement impossible")); } finally { setOccupe(false); }
  };
  const oublier = async () => { await oublierCleCoffre(); toast.succes("Ce téléphone ne connaît plus votre clé : votre secret sera redemandé pour sauvegarder."); setConfirm(null); await charger(); };

  if (e === undefined) return <section className="card"><p className="text-sm text-gray-600">⏳ Lecture de votre sauvegarde…</p></section>;
  const cloud = e?.mode === "cloud";
  return (
    <section className="card space-y-3" data-testid="bloc-sauvegarde">
      <h2 className="text-lg font-bold">🛡️ Sécurité et sauvegarde</h2>
      {e === null && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">Service de sauvegarde indisponible pour le moment.</p>}
      {e && (<>
        <p className="text-sm text-gray-600">Votre journal intime, votre carnet de contacts et les lignes de paiement de vos SMS peuvent être sauvegardés en ligne, <b>chiffrés sur votre téléphone</b> : ni auRor ni SAWALI ne peuvent les lire. Sur un nouveau téléphone, vous remettez votre secret et tout revient.</p>
        <div>
          <label className="label" htmlFor="mode-sauv">Où garder mes données ?</label>
          <select id="mode-sauv" className="input" value={cloud ? "cloud" : "local"} onChange={(ev) => changerMode(ev.target.value)} disabled={occupe}>
            <option value="cloud">☁️ En ligne, chiffrées (recommandé)</option>
            <option value="local">📱 Sur ce téléphone seulement</option>
          </select>
          {!e.mode && <p className="mt-1 text-xs text-amber-700">⏳ Vous n'avez pas encore choisi : choisissez ci-dessus.</p>}
        </div>
        {cloud && alerteSauvegarde() && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900" data-testid="alerte-sauvegarde">⚠️ {alerteSauvegarde()} <button type="button" className="underline" onClick={() => { effacerAlerte(); charger(); }}>Masquer</button></p>
        )}
        {cloud && (
          <div className="space-y-2 rounded-xl bg-gray-50 p-3 text-sm" data-testid="etat-sauvegarde">
            <p>{e.existe ? <>✅ Dernière sauvegarde : <b>{dateFr(e.maj_le)}</b> ({taille(e.taille)})</> : "⏳ Aucune sauvegarde envoyée pour l'instant."}</p>
            <p className={cleAppareil ? "text-green-800" : "text-amber-800"}>{cleAppareil ? "🔓 Ce téléphone sauvegarde automatiquement." : "🔒 Ce téléphone ne connaît pas votre clé : votre secret est nécessaire pour sauvegarder."}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={occupe} onClick={() => maintenant()}>💾 Sauvegarder maintenant</button>
              <button type="button" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" onClick={() => demander("restaurer")}>📲 Retrouver mes données</button>
              {cleAppareil && <button type="button" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" onClick={() => setConfirm("oublier")}>🔒 Oublier ma clé sur ce téléphone</button>}
              {e.existe && <button type="button" className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700" onClick={() => setConfirm("effacer")}>🗑️ Effacer la sauvegarde en ligne</button>}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500">Votre secret (code PIN ou phrase), votre code de secours et l'application d'authentification se gèrent dans <Link to="/archives" className="underline">Archives</Link> : c'est le même coffre. Secret et code de secours perdus = données en ligne irrécupérables.</p>
      </>)}

      <Modal ouvert={confirm === "moins"} titre="Remplacer la sauvegarde par une version plus petite ?" onFermer={() => setConfirm(null)}>
        <p className="text-sm">{refus?.raison === "vide" ? "Ce téléphone ne contient AUCUNE donnée alors qu'une sauvegarde existe en ligne. Pour la récupérer, utilisez « Retrouver mes données »."
          : <>La nouvelle sauvegarde contiendrait <b>{refus?.comptes && resumeComptes(refus.comptes)}</b>, alors que la dernière sauvegarde vérifiée contenait <b>{refus?.ancien && resumeComptes(refus.ancien)}</b>.</>}</p>
        <p className="mt-2 text-sm text-red-800">La sauvegarde précédente est gardée une fois, puis remplacée à la sauvegarde suivante.</p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-primary" onClick={() => setConfirm(null)}>↩️ Ne pas remplacer</button>
          <button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" disabled={occupe} onClick={() => { setConfirm(null); maintenant(true); }}>💾 Remplacer quand même</button>
        </div>
      </Modal>
      <Modal ouvert={confirm === "local"} titre="Garder mes données sur ce téléphone seulement ?" onFermer={() => setConfirm(null)}>
        <p className="text-sm">La sauvegarde en ligne ne sera plus mise à jour. Que faire de celle qui existe déjà ?</p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setConfirm(null)}>↩️ Annuler</button>
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={occupe} onClick={() => passerLocal(false)}>📦 La garder (figée)</button>
          <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white" disabled={occupe} onClick={() => passerLocal(true)}>🗑️ L'effacer</button>
        </div>
      </Modal>
      <Modal ouvert={confirm === "effacer"} titre="Effacer la sauvegarde en ligne ?" onFermer={() => setConfirm(null)}>
        <p className="text-sm">Vos données restent sur ce téléphone, mais <b>plus aucune copie n'existera en ligne</b> : si le téléphone est perdu, elles seront perdues. Le mode « en ligne » reste actif : une nouvelle sauvegarde sera faite au prochain changement.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setConfirm(null)}>↩️ Non, garder</button>
          <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white" disabled={occupe} onClick={effacerEnLigne}>🗑️ Oui, effacer</button>
        </div>
      </Modal>
      <Modal ouvert={confirm === "oublier"} titre="Oublier ma clé sur ce téléphone ?" onFermer={() => setConfirm(null)}>
        <p className="text-sm">Ce téléphone ne sauvegardera plus automatiquement : votre secret sera redemandé. Utile si vous prêtez ou revendez ce téléphone.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setConfirm(null)}>↩️ Annuler</button>
          <button type="button" className="btn-primary" onClick={oublier}>🔒 Oublier ma clé</button>
        </div>
      </Modal>
    </section>
  );
}
