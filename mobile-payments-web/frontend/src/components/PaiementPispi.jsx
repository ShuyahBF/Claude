import { useState } from "react";
import LogoMode from "@/components/LogoMode";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Paiement PI-SPI chez un marchand (lot 58) : bloc de paiement du marchand VÉRIFIÉ (QR de sa banque, montant, référence à indiquer).
// Le client paie avec l'application de SA banque, puis déclare la référence bancaire ; le MARCHAND confirme la réception.
// `donnees` = {paiement, bloc} renvoyé par POST /paiements/pispi ; `onTermine` est appelé quand la référence est déclarée.
export default function PaiementPispi({ donnees, onFermer, onTermine }) {
  const toast = useToast();
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [declare, setDeclare] = useState(false);
  const bloc = donnees?.bloc;

  const declarer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      await apiClient.post(`/paiements/${donnees.paiement.id}/pispi/declarer`, { reference_bancaire: reference.trim() });
      setDeclare(true);
      toast.succes("Paiement déclaré : le marchand va le confirmer");
      onTermine?.();
    } catch (err) { toast.erreur(messageErreur(err, "Déclaration impossible")); } finally { setEnvoi(false); }
  };
  const copier = async () => { try { await navigator.clipboard.writeText(bloc.reference); toast.succes("Référence copiée"); } catch { toast.info(bloc.reference); } };

  return (
    <Modal ouvert={!!donnees} titre="Payer par PI-SPI" onFermer={onFermer}>
      {bloc && (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2"><LogoMode mode="pispi" taille={28} /> <b>{bloc.marchand}</b> <span className="badge bg-green-100 text-green-800">marchand vérifié</span></p>
          <p className="text-lg font-bold text-primary">{bloc.montant_texte}</p>
          <div className="flex justify-center"><img src={bloc.qr_data_url} alt="QR code PI-SPI de la banque du marchand" className="h-48 w-48 rounded-lg border border-gray-200 bg-white p-2" /></div>
          <dl className="space-y-1 rounded-lg bg-creme p-3">
            <div><dt className="inline text-gray-500">Banque : </dt><dd className="inline font-semibold">{bloc.banque}</dd></div>
            <div><dt className="inline text-gray-500">Bénéficiaire : </dt><dd className="inline font-semibold">{bloc.titulaire}</dd></div>
            <div><dt className="inline text-gray-500">Adresse de paiement : </dt><dd className="inline font-mono">{bloc.adresse_paiement}</dd></div>
            <div className="flex items-center gap-2"><dt className="text-gray-500">Référence à indiquer :</dt><dd className="font-mono font-bold">{bloc.reference}</dd>
              <button type="button" className="btn-outline btn-sm" onClick={copier}>Copier</button></div>
          </dl>
          <p className="text-gray-600">{bloc.consigne}</p>
          {declare ? (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900" role="status">⏳ Paiement déclaré. Le marchand vérifie son relevé bancaire puis confirme : le paiement passera à « Payé » dans votre historique.</p>
          ) : (
            <form onSubmit={declarer} className="space-y-2 border-t border-gray-100 pt-3">
              <label className="label" htmlFor="pispi-ref">Après le virement : référence bancaire de l'opération</label>
              <input id="pispi-ref" className="input" required minLength={4} maxLength={120} placeholder="Numéro reçu de votre banque" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
              <button type="submit" className="btn-primary w-full" disabled={envoi || reference.trim().length < 4}>{envoi ? "Patientez…" : "J'ai payé"}</button>
              <p className="text-xs text-gray-500">Vous n'avez pas encore payé ? Fermez cette fenêtre : le paiement reste dans l'historique et vous pourrez le déclarer plus tard.</p>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
