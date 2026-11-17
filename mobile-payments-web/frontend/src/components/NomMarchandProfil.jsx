// « Nom du marchand » dans le Profil (lot 190) : après le SMS de l'opérateur, auRor PROPOSE de corriger le nom du marchand enregistré quand il est vide
// ou différent de celui du SMS (nom non doublé). Réglage de ce compte, actif par défaut ; la case enregistre tout de suite et le confirme par un toast.
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";
import { capacites } from "@/lib/pontAndroid";

export default function NomMarchandProfil() {
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [occupe, setOccupe] = useState(false);
  if (!capacites()?.direct) return null;                                        // sans objet hors de l'application « direct »
  const actif = user.proposer_nom_marchand !== false;                           // absent = actif
  const regler = async (valeur) => {
    setOccupe(true);
    try { const { data } = await apiClient.put("/auth/proposer-nom-marchand", { actif: valeur }); setUser(data); toast.succes(valeur ? "Proposition du nom du marchand activée (enregistré)" : "Proposition du nom du marchand désactivée (enregistré)"); }
    catch (err) { toast.erreur(messageErreur(err, "Réglage impossible")); } finally { setOccupe(false); }
  };
  return (
    <section className="card space-y-2" data-testid="nom-marchand-profil">
      <h2 className="text-lg font-bold">🏪 Nom du marchand</h2>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
        <input type="checkbox" className="h-5 w-5" checked={actif} disabled={occupe} data-testid="proposer-nom-marchand" onChange={(e) => regler(e.target.checked)} />
        <span className="flex-1 text-sm"><b>Proposer le nom du marchand d'après le SMS</b> : après un paiement, si le nom donné par l'opérateur est différent de celui enregistré (ou si le marchand n'a pas de nom), auRor propose de le corriger. Rien n'est changé sans votre accord.</span>
      </label>
    </section>
  );
}
