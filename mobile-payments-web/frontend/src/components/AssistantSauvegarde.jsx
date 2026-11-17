import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import CoffreAcces from "@/components/CoffreAcces";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { messageErreur } from "@/lib/api";
import { cleDuJournal, lireCleCoffre, pourUtilisateur } from "@/lib/journalIntime";
import { cleCourante } from "@/lib/archiveCrypto";
import {
  choixReporte, definirModeServeur, derniereSauvegardeLocale, lireEtatServeur, lireInstantane, memoriserCoffreOuvert, reporterChoix, restaurerInstantane,
  sauvegarder, telechargerSauvegarde, instantaneVide, comptesInstantane, resumeComptes,
} from "@/lib/sauvegarde";
import { VERSION } from "@/version";

// Assistant de la sauvegarde en ligne chiffrée (lot 168), monté une fois dans la page principale :
//  - au PREMIER LANCEMENT (aucun choix encore) : l'utilisateur choisit LUI-MÊME « en ligne chiffrée » ou « ce téléphone seulement » ;
//  - NOUVEAU TÉLÉPHONE (une sauvegarde en ligne existe, mais ce téléphone n'a pas la clé) : il remet sa phrase secrète / son code et ses données reviennent ;
//  - le bloc sécurisé du profil peut le rouvrir à tout moment (événement « auror-sauvegarde » : activer | restaurer).
// Détails et choix dans une FENÊTRE MODALE (règle 20) ; chaque action a un pictogramme (règle 15).
export const EVENEMENT_ASSISTANT = "auror-sauvegarde";
export const EVENEMENT_MAJ = "auror-sauvegarde-maj";
const dateFr = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }); } catch { return ""; } };

export default function AssistantSauvegarde() {
  const toast = useToast();
  const { user } = useAuth();
  const [etape, setEtape] = useState(null);          // null | choix | reprise | coffre | secours | travail
  const [but, setBut] = useState("activer");         // activer | restaurer
  const [serveur, setServeur] = useState(null);
  const [coche, setCoche] = useState(false);
  const [code, setCode] = useState(null);            // code de secours à montrer une fois { code, confirme }
  const lance = useRef("");

  // Ouverture automatique : premier lancement, ou nouveau téléphone
  useEffect(() => {
    if (!user?.id || lance.current === user.id) return undefined;
    lance.current = user.id;
    pourUtilisateur(user.id);
    let actif = true;
    (async () => {
      const e = await lireEtatServeur();
      if (!actif || !e || choixReporte()) return;
      setServeur(e);
      if (!e.mode) { setBut("activer"); setEtape("choix"); return; }
      if (e.mode === "cloud" && e.existe && !cleCourante() && !(await lireCleCoffre())) { setBut("restaurer"); setEtape("reprise"); }
    })();
    return () => { actif = false; };
  }, [user?.id]);

  // Demandes venues du profil
  useEffect(() => {
    const surDemande = async (ev) => {
      pourUtilisateur(user?.id);
      setServeur(await lireEtatServeur()); setCoche(false);
      setBut(ev.detail?.action === "restaurer" ? "restaurer" : "activer"); setEtape("coffre");
    };
    window.addEventListener(EVENEMENT_ASSISTANT, surDemande);
    return () => window.removeEventListener(EVENEMENT_ASSISTANT, surDemande);
  }, [user?.id]);

  const fermer = () => { setEtape(null); setCode(null); setCoche(false); };
  const plusTard = () => { reporterChoix(); fermer(); toast.info("D'accord : vous pourrez choisir dans votre profil (bloc « Sécurité »)."); };

  const choisirLocal = async () => {
    toast.info("Enregistrement de votre choix en cours…");
    try { await definirModeServeur("local"); toast.succes("Vos données restent uniquement sur ce téléphone. Vous pouvez changer d'avis dans votre profil."); window.dispatchEvent(new Event(EVENEMENT_MAJ)); fermer(); }
    catch (err) { toast.erreur(messageErreur(err, "Choix non enregistré")); }
  };

  // Le coffre est ouvert : on termine (activer = mode en ligne + première sauvegarde ; restaurer = retour des données)
  const finaliser = useCallback(async (resultat) => {
    setEtape("travail");
    try {
      pourUtilisateur(user?.id);
      const cleLocale = await cleDuJournal();
      await memoriserCoffreOuvert();
      if (but === "restaurer") {
        let inst;
        const e = await lireEtatServeur();
        if (e?.existe) {
          toast.info("Restauration de votre sauvegarde en cours…");
          try { inst = await lireInstantane((await telechargerSauvegarde(false)).contenu, cleCourante()); }
          catch { if (e.versions > 1) inst = await lireInstantane((await telechargerSauvegarde(true)).contenu, cleCourante()); else throw new Error("Cette sauvegarde ne s'ouvre pas avec ce secret."); }
          if (instantaneVide(inst) && e.versions > 1) {      // la dernière sauvegarde est vide : on essaie la précédente avant de conclure
            toast.info("La dernière sauvegarde est vide : essai de la version précédente…");
            inst = await lireInstantane((await telechargerSauvegarde(true)).contenu, cleCourante());
          }
          if (instantaneVide(inst)) throw new Error("Cette sauvegarde est VIDE : rien à retrouver. Vos données actuelles n'ont pas été touchées.");
          const r = await restaurerInstantane(inst, cleLocale);
          toast.succes(`La sauvegarde contenait ${resumeComptes(comptesInstantane(inst))}. Ajoutés sur ce téléphone : ${r.journal} page(s) de journal, ${r.carnet} contact(s), ${r.sms} ligne(s) de SMS (rien n'est écrasé).`);
        } else toast.info("Aucune sauvegarde en ligne à restaurer.");
      }
      toast.info("Sauvegarde en cours…");
      await definirModeServeur("cloud");
      const sv = await sauvegarder(cleLocale, { force: true, app: String(VERSION) }).catch((err) => ({ fait: false, raison: "erreur", message: err?.message }));
      if (sv.fait) toast.succes(`Sauvegarde en ligne chiffrée activée et vérifiée : ${resumeComptes(sv.comptes)}.`);
      else if (sv.raison === "vide" || sv.raison === "rien") toast.info("Sauvegarde en ligne activée. Rien à sauvegarder pour l'instant : une sauvegarde existante n'a PAS été remplacée.");
      else toast.erreur(`Sauvegarde en ligne activée, mais la première sauvegarde n'a pas été faite : ${sv.message || "contrôles non satisfaits"}`);
      window.dispatchEvent(new Event(EVENEMENT_MAJ));
      if (resultat?.codeSecours) { setCode({ code: resultat.codeSecours, confirme: false }); setEtape("secours"); } else fermer();
    } catch (err) { toast.erreur(messageErreur(err, err?.message || "Opération impossible")); fermer(); }
  }, [user?.id, but, toast]);

  const surCoffre = (resultat) => finaliser(resultat);

  if (!etape) return null;
  return (
    <Modal ouvert titre={etape === "secours" ? "🔑 Votre code de secours" : but === "restaurer" ? "📲 Retrouver mes données" : "☁️ Sauvegarde en ligne chiffrée"} onFermer={etape === "secours" || etape === "travail" ? undefined : plusTard} large>
      {etape === "choix" && (
        <div className="space-y-3" data-testid="choix-sauvegarde">
          <p className="text-sm text-gray-700">Votre téléphone peut être perdu, volé ou cassé. Voulez-vous que vos données (journal intime, carnet de contacts, lignes de paiement de vos SMS) puissent être retrouvées sur un nouveau téléphone ? <b>C'est vous qui choisissez.</b></p>
          <ul className="space-y-2 text-sm">
            <li className="rounded-xl border border-gray-200 p-3"><b>☁️ Sauvegarde en ligne chiffrée</b> — vos données sont chiffrées <b>sur votre téléphone</b> avec votre secret (code PIN ou phrase) avant d'être envoyées. Ni auRor ni SAWALI ne peuvent les lire. Sur un nouveau téléphone : vous vous connectez, vous remettez votre secret, et tout revient (comme WhatsApp). <b>Si vous perdez votre secret ET votre code de secours, personne ne pourra récupérer vos données.</b> Gratuit.</li>
            <li className="rounded-xl border border-gray-200 p-3"><b>📱 Ce téléphone seulement</b> — rien n'est envoyé. Si le téléphone est perdu, volé ou effacé, vos données sont perdues définitivement.</li>
          </ul>
          <p className="text-xs text-gray-600">Vous pourrez changer ce choix à tout moment dans votre profil, bloc « Sécurité et sauvegarde ».</p>
          <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1 h-5 w-5" checked={coche} onChange={(e) => setCoche(e.target.checked)} data-testid="case-sauvegarde" /><span>J'ai lu ces explications et je choisis moi-même.</span></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!coche} onClick={() => { setBut("activer"); setEtape("coffre"); }} data-testid="choisir-cloud">☁️ Sauvegarder en ligne</button>
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={!coche} onClick={choisirLocal}>📱 Ce téléphone seulement</button>
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={plusTard}>⏳ Décider plus tard</button>
          </div>
        </div>
      )}
      {etape === "reprise" && (
        <div className="space-y-3" data-testid="reprise-sauvegarde">
          <p className="text-sm text-gray-700">Une sauvegarde chiffrée de votre compte existe{serveur?.maj_le ? <> (du <b>{dateFr(serveur.maj_le)}</b>)</> : null}. Nouveau téléphone ? Remettez votre secret pour retrouver vos données.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => setEtape("coffre")}>🔓 Retrouver mes données</button>
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={plusTard}>⏳ Plus tard</button>
          </div>
        </div>
      )}
      {etape === "coffre" && <CoffreAcces onPret={surCoffre} onAnnuler={plusTard} libelleOuverture={but === "restaurer" ? "Retrouver mes données" : "Ouvrir et sauvegarder"} />}
      {etape === "travail" && <p className="text-sm text-gray-700">⏳ Un instant…</p>}
      {etape === "secours" && code && (
        <div className="space-y-3" data-testid="code-secours">
          <p className="text-sm text-gray-700">Voici votre <b>code de secours</b>. Il ne sera <b>plus jamais affiché</b>. Notez-le sur papier et gardez-le en lieu sûr : si vous oubliez votre secret, c'est lui qui rouvre votre coffre.</p>
          <p className="select-all rounded-xl bg-amber-50 p-4 text-center font-mono text-xl font-bold tracking-wider text-amber-900">{code.code}</p>
          <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1 h-5 w-5" checked={code.confirme} onChange={(e) => setCode({ ...code, confirme: e.target.checked })} /><span>Je l'ai noté en lieu sûr.</span></label>
          <button type="button" className="btn-primary" disabled={!code.confirme} onClick={fermer}>✅ Terminé</button>
        </div>
      )}
    </Modal>
  );
}
