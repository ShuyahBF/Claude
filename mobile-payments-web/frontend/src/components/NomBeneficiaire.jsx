// Nom du bénéficiaire modifiable APRÈS la transaction (lot 96 — auRor) : transferts d'argent, paiements marchands et argent reçu.
// Vide = on retrouve le nom d'origine (annuaire des marchands, ou numéro). Appel serveur : PUT /api/paiements/{id}/nom.
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Catégories de services dont on peut nommer le bénéficiaire (identiques à celles du serveur)
export const CATEGORIES_NOMMABLES = ["money_transfer", "merchant_payment", "money_receipt"];
const NOM_MAX = 80;

export default function NomBeneficiaire({ paiement, onChange }) {
  const toast = useToast();
  const [nom, setNom] = useState(paiement.nom_beneficiaire || "");
  const [occupe, setOccupe] = useState(false);
  if (!CATEGORIES_NOMMABLES.includes(paiement.categorie)) return null;
  const recu = paiement.categorie === "money_receipt";

  const enregistrer = async () => {
    setOccupe(true);
    try {
      const { data } = await apiClient.put(`/paiements/${paiement.id}/nom`, { nom });
      onChange(data);
      toast.succes("Nom enregistré");
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };

  return (
    <section className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm" data-testid="nom-beneficiaire">
      <label className="label" htmlFor="nom-benef">{recu ? "Nom de l'expéditeur" : "Nom du bénéficiaire"}</label>
      <input id="nom-benef" className="input" maxLength={NOM_MAX} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Maman, Boutique Sawadogo…" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">Modifiable à tout moment ; laissez vide pour revenir au numéro.</span>
        <button type="button" className="btn-outline btn-sm" disabled={occupe || nom.trim() === (paiement.nom_beneficiaire || "")} onClick={enregistrer}>Enregistrer le nom</button>
      </div>
    </section>
  );
}
