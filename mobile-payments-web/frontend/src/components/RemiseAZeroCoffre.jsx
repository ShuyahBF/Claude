import { useState } from "react";
import ChampMotDePasse from "@/components/ChampMotDePasse";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import { verrouiller } from "@/lib/archiveCrypto";
import { coffreTelephoneOublier } from "@/lib/pontAndroid";
import { oublierResultat } from "@/lib/sauvegarde";

// COFFRE PERDU (lot 178) : le secret ET le code de secours sont oubliés. Personne ne peut rouvrir l'ancien coffre (ni auRor ni SAWALI) :
// la seule issue est de repartir d'un coffre NEUF. Les documents et la sauvegarde EN LIGNE (déjà illisibles) sont supprimés ;
// les données du TÉLÉPHONE ne sont pas touchées et seront de nouveau sauvegardées avec le nouveau secret.
// Garde-fous (règle 21) : mot de passe du compte + mot « EFFACER » tapé. Fenêtre modale (règle 20), pictogrammes sur les actions (règle 15).

/** Lien « Code de secours perdu aussi ? » + sa fenêtre. `onFait()` est appelé après la remise à zéro (l'écran relit alors l'état du coffre). */
export default function RemiseAZeroCoffre({ onFait }) {
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [mdp, setMdp] = useState(""); const [mot, setMot] = useState(""); const [occupe, setOccupe] = useState(false);
  const fermer = () => { setOuvert(false); setMdp(""); setMot(""); };
  const valider = async (e) => {
    e.preventDefault(); setOccupe(true); toast.info("Remise à zéro du coffre en cours…");
    try {
      const { data } = await apiClient.post("/archives/reinitialiser", { mot_de_passe: mdp, confirmation: mot });
      verrouiller(); coffreTelephoneOublier(); oublierResultat();        // plus aucune trace de l'ancien secret sur ce téléphone
      toast.succes(`Coffre remis à zéro (${data.supprimes} document${data.supprimes > 1 ? "s" : ""} en ligne supprimé${data.supprimes > 1 ? "s" : ""}). Choisissez un nouveau secret.`);
      fermer(); onFait?.();
    } catch (err) { toast.erreur(messageErreur(err, "Remise à zéro impossible")); } finally { setOccupe(false); }
  };
  return (
    <>
      <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 underline" onClick={() => setOuvert(true)} data-testid="coffre-perdu">
        🧹 Secret ET code de secours perdus ? Repartir d'un coffre neuf
      </button>
      <Modal ouvert={ouvert} titre="🧹 Repartir d'un coffre neuf" onFermer={occupe ? undefined : fermer}>
        <form className="space-y-3" onSubmit={valider}>
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">Sans votre secret ni votre code de secours, <b>personne</b> ne peut rouvrir l'ancien coffre. En continuant, vos <b>documents archivés en ligne</b> et votre <b>sauvegarde en ligne</b> sont <b>supprimés définitivement</b>.</p>
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">✅ Les données de <b>ce téléphone</b> (contacts, rappels, journal…) ne sont <b>pas</b> touchées : elles seront de nouveau sauvegardées avec votre nouveau secret.</p>
          <div><label className="label" htmlFor="cz-mdp">Mot de passe de votre compte auRor</label>
            <ChampMotDePasse id="cz-mdp" className="input" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} /></div>
          <div><label className="label" htmlFor="cz-mot">Tapez <b>EFFACER</b> pour confirmer</label>
            <input id="cz-mot" className="input font-mono" autoComplete="off" autoCapitalize="characters" value={mot} onChange={(e) => setMot(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={fermer} disabled={occupe}>↩️ Annuler</button>
            <button type="submit" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={occupe || !mdp || mot.trim().toUpperCase() !== "EFFACER"}>{occupe ? "⏳ Patientez…" : "🧹 Effacer et repartir à zéro"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
