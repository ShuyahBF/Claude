import QrCode from "@/components/QrCode";
import { useToast } from "@/components/Toast";
import { couleurOperateur, fcfa } from "@/lib/api";

// Affiche un paiement préparé : code USSD, QR code à scanner avec le téléphone,
// bouton « Composer » (ouvre le composeur quand le site est ouvert sur le téléphone).
// onStatut(statut) : l'utilisateur indique « payé » ou « abandonné ».
// iPhone / iPad : iOS refuse de pré-remplir un code contenant * ou # depuis un lien
const SUR_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

export default function CarteCodeUssd({ paiement, onStatut }) {
  const toast = useToast();

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(paiement.code_ussd);
      toast.succes("Code copié");
    } catch {
      toast.erreur("Copie impossible : sélectionnez le code à la main");
    }
  };

  return (
    <div className="space-y-5">
      {/* Récapitulatif */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="badge text-white" style={{ background: couleurOperateur(paiement.operateur) }}>{paiement.operateur}</span>
        <span className="font-semibold">{paiement.service_nom}</span>
        {paiement.montant ? <span className="ml-auto text-lg font-bold text-accent">{fcfa(paiement.montant)}</span> : null}
      </div>
      {paiement.marchand && (
        <p className="text-sm text-gray-600">
          Marchand : <b>{paiement.marchand.libelle || "sans nom"}</b> <span className="font-mono">({paiement.marchand.code})</span>
        </p>
      )}

      <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
        {/* QR code : lien « tel: » lu par l'appareil photo du téléphone */}
        <div className="order-2 mx-auto rounded-xl border border-gray-200 bg-white p-3 sm:order-none">
          <QrCode valeur={paiement.lien_tel} taille={220} />
        </div>
        {/* Sur téléphone, le bouton « Composer » passe avant le QR code */}
        <div className="order-1 space-y-3 sm:order-none">
          <p className="text-sm text-gray-600">
            <b>Sur ordinateur :</b> scannez ce QR code avec l'appareil photo de votre téléphone. Le composeur s'ouvre
            avec le code : il ne reste qu'à appuyer sur <b>Appeler</b> et à valider avec votre code secret Mobile Money.
          </p>
          <div className="rounded-lg bg-nuit-900 px-4 py-3 text-center font-mono text-xl tracking-wider text-white sm:text-2xl">
            {paiement.code_ussd}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Sur téléphone : ouvre directement le composeur */}
            <a href={paiement.lien_tel} className="btn-primary flex-1">📞 Composer sur ce téléphone</a>
            <button type="button" onClick={copier} className="btn-outline">Copier</button>
          </div>
          {SUR_IOS && (
            <p className="text-xs text-gray-500">Sur iPhone, le code n'est pas pré-rempli : copiez-le, puis collez-le dans le clavier d'appel.</p>
          )}
        </div>
      </div>

      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        Le site ne connaît pas le résultat de l'opération : c'est votre opérateur qui le confirme par SMS.
        Votre code secret n'est jamais demandé ici.
      </p>

      {onStatut && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline flex-1" onClick={() => onStatut("effectue")}>✅ J'ai payé</button>
          <button type="button" className="btn-outline flex-1" onClick={() => onStatut("abandonne")}>✖ Abandonné</button>
        </div>
      )}
    </div>
  );
}
