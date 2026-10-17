import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// QR d'une plaque d'opérateur (lot 38) : le QR ne contient pas le code marchand, écrit à la main sur la plaque.
// 1re fois : l'utilisateur saisit le code, le site mémorise le lien. Ensuite le code est proposé et il suffit de confirmer.
// Props : qr = { operateur, identifiant } | null ; onUtiliser(operateur, code) ; onFermer().
export default function QrOperateur({ qr, onUtiliser, onFermer }) {
  const toast = useToast();
  const [lien, setLien] = useState(null);      // réponse du serveur ; null = chargement
  const [saisie, setSaisie] = useState(false); // saisie (ou correction) du code
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!qr) return undefined;
    let actif = true;
    setLien(null); setSaisie(false); setCode(""); setLibelle("");
    apiClient.get(`/qr-operateurs/${encodeURIComponent(qr.operateur)}/${qr.identifiant}`)
      .then(({ data }) => { if (actif) { setLien(data); setSaisie(!data.trouve); } })
      .catch((err) => { if (actif) { toast.erreur(messageErreur(err, "Lecture impossible")); setLien({ trouve: false }); setSaisie(true); } });
    return () => { actif = false; };
  }, [qr, toast]);

  // Enregistre (ou confirme) le lien puis ouvre le paiement avec ce code
  const valider = async (codeChoisi, libelleChoisi) => {
    setEnvoi(true);
    try {
      await apiClient.post("/qr-operateurs", { operateur: qr.operateur, identifiant: qr.identifiant, code: codeChoisi, libelle: libelleChoisi || null });
      onUtiliser(qr.operateur, codeChoisi);
    } catch (err) { toast.erreur(messageErreur(err, "Code invalide (3 à 12 chiffres, nom : lettres, chiffres, espaces)")); } finally { setEnvoi(false); }
  };

  return (
    <Modal ouvert={!!qr} titre={`QR ${qr?.operateur || ""}`} onFermer={onFermer}>
      {lien === null && <p className="text-gray-500">Lecture du QR code…</p>}
      {lien && !saisie && lien.trouve && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Ce QR {qr.operateur} est déjà connu. Vérifiez le code marchand écrit sur la plaque :</p>
          <p className="rounded-xl bg-creme p-3 text-center">
            <span className="block font-mono text-3xl font-bold tracking-widest">{lien.code}</span>
            {lien.libelle && <span className="block text-sm text-gray-600">{lien.libelle}</span>}
            <span className="mt-1 block text-xs text-gray-500">
              {lien.source === "moi" ? "Enregistré par vous" : "Proposé par la communauté"} · {lien.confirmations} confirmation{lien.confirmations > 1 ? "s" : ""}
            </span>
          </p>
          <p className="text-xs text-amber-800">Comparez avec le numéro écrit sur la plaque avant de payer.</p>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary" disabled={envoi} onClick={() => valider(lien.code, "")}>{envoi ? "Patientez…" : "C'est bien ce code : continuer"}</button>
            <button type="button" className="btn-outline" onClick={() => setSaisie(true)}>Ce n'est pas le bon code</button>
          </div>
        </div>
      )}
      {lien && saisie && (
        <form onSubmit={(e) => { e.preventDefault(); valider(code.trim(), libelle.trim()); }} className="space-y-3">
          <p className="text-sm text-gray-600">
            Le QR de la plaque {qr?.operateur} ne contient pas le code marchand. Saisissez <b>une seule fois</b> le numéro écrit sur la plaque :
            le site s'en souviendra pour vos prochains paiements.
          </p>
          <div>
            <label className="label" htmlFor="qro-code">Code marchand de la plaque</label>
            <input id="qro-code" className="input font-mono text-lg tracking-widest" required inputMode="numeric" pattern="[0-9]{3,12}" maxLength={12}
              placeholder="Ex. 3366444" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="qro-nom">Nom du marchand <span className="font-normal text-gray-400">(facultatif)</span></label>
            <input id="qro-nom" className="input" maxLength={60} placeholder="Ex. Pharmacie du Marché" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onFermer}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={envoi || code.length < 3}>{envoi ? "Patientez…" : "Enregistrer et continuer"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
