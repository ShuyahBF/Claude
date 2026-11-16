import { useState } from "react";
import { useToast } from "@/components/Toast";
import { coffreTelephoneDisponible, coffreTelephoneMemorise, coffreTelephoneMemoriser, coffreTelephoneOublier, coffreTelephoneRetrouver } from "@/lib/pontAndroid";

// Ouverture du coffre par l'EMPREINTE ou le CODE DU TÉLÉPHONE (application Android seulement).
// Le secret (code PIN / phrase) est rangé chiffré dans le coffre Android (Keystore) : il ne sert qu'après reconnaissance de l'utilisateur par le téléphone.
// Sécurité (règle 21) : si la double vérification (application d'authentification) est activée, on ne mémorise PAS le secret, pour ne pas la contourner.

/** Vrai si on peut proposer la mémorisation / l'ouverture par le téléphone pour ce coffre. */
export const telephonePossible = (etat) => coffreTelephoneDisponible() && !etat?.a2f;

/** Bouton « Ouvrir avec l'empreinte ou le code du téléphone » : visible seulement si un secret est déjà mémorisé. `onSecret(secret)` reçoit le secret retrouvé. */
export function BoutonOuvrirTelephone({ etat, onSecret, disabled }) {
  const toast = useToast();
  const [occupe, setOccupe] = useState(false);
  if (!telephonePossible(etat) || !coffreTelephoneMemorise()) return null;
  const ouvrir = async () => {
    setOccupe(true); toast.info("Reconnaissance par le téléphone en cours…");
    try {
      const r = await coffreTelephoneRetrouver();
      if (r?.secret) onSecret(r.secret); else toast.erreur(r?.erreur || "Ouverture impossible : tapez votre secret.");
    } finally { setOccupe(false); }
  };
  return (
    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900" disabled={disabled || occupe} onClick={ouvrir} data-testid="ouvrir-telephone">
      🖐️ Ouvrir avec l'empreinte ou le code du téléphone
    </button>
  );
}

/** Case « Ouvrir ensuite avec l'empreinte ou le code du téléphone » (visible si possible et pas encore mémorisé). */
export function CaseMemoriserTelephone({ etat, coche, setCoche }) {
  if (!telephonePossible(etat) || coffreTelephoneMemorise()) return null;
  return (
    <label className="flex items-start gap-2 text-sm text-gray-800">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={coche} onChange={(e) => setCoche(e.target.checked)} data-testid="case-telephone" />
      <span>🖐️ Ouvrir ensuite avec <b>l'empreinte ou le code du téléphone</b> (le secret est rangé chiffré dans le coffre du téléphone ; vous pourrez le retirer à tout moment).</span>
    </label>
  );
}

/** À appeler après une ouverture réussie avec un secret tapé : mémorise le secret si la case est cochée (le téléphone demande alors l'empreinte ou son code). */
export async function memoriserSiDemande(coche, secret, toast) {
  if (!coche || !coffreTelephoneDisponible()) return;
  toast.info("Mémorisation par le téléphone en cours…");
  const r = await coffreTelephoneMemoriser(secret);
  if (r?.ok) toast.succes("🖐️ Secret mémorisé : le coffre s'ouvrira avec l'empreinte ou le code du téléphone."); else toast.erreur(r?.erreur || "Mémorisation impossible");
}

/** Bloc « Retirer » (réglage) : oublie le secret mémorisé sur ce téléphone. */
export function BoutonRetirerTelephone({ etat, apres }) {
  const toast = useToast();
  if (!telephonePossible(etat) || !coffreTelephoneMemorise()) return null;
  return (
    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => { coffreTelephoneOublier(); toast.succes("Secret retiré de ce téléphone : il faudra le taper."); apres?.(); }}>
      🗑️ Ne plus ouvrir avec le téléphone
    </button>
  );
}
