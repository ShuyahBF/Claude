// « Envoi du code secret » dans le Profil (paiement direct, application Android « direct »).
// Réglage PAR OPÉRATEUR et PROPRE À CE COMPTE :
//   - « PIN envoyé en même temps » COCHÉ  : le code secret part avec la séquence en un seul envoi (ex. *144*10*code*montant*PIN#) ;
//   - NON coché (départ)                  : le code est composé sans code secret, puis l'application le tape dans la fenêtre que l'opérateur affiche.
// Débogage : une case permet d'afficher, dans la zone des résultats d'un paiement, la chaîne exactement envoyée (code secret en clair).
// Chaque case enregistre tout de suite et le confirme par un toast (le code secret lui-même n'est jamais enregistré).
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";
import { capacites } from "@/lib/pontAndroid";

export default function PinProfil() {
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [operateurs, setOperateurs] = useState([]);
  const [occupe, setOccupe] = useState(false);

  // Liste finie des opérateurs (celle du catalogue des portefeuilles)
  useEffect(() => { apiClient.get("/portefeuille/operateurs").then(({ data }) => setOperateurs(data.catalogue || [])).catch(() => setOperateurs([])); }, []);

  // Cette rubrique n'a de sens que dans l'application « direct »
  if (!capacites()?.direct) return null;

  const regler = async (route, corps, message) => {
    setOccupe(true);
    try { const { data } = await apiClient.put(route, corps); setUser(data); toast.succes(message); }
    catch (err) { toast.erreur(messageErreur(err, "Réglage impossible")); } finally { setOccupe(false); }
  };

  return (
    <section className="card space-y-3" data-testid="pin-profil">
      <h2 className="text-lg font-bold">⌨️ Envoi du code secret (paiement direct)</h2>
      <p className="text-sm text-gray-600">Pour chaque opérateur, choisissez comment le code secret est envoyé. <b>Coché</b> : il part avec la séquence, en un seul envoi.
        <b> Non coché</b> : le code est composé sans code secret, puis l'application le tape dans la fenêtre de l'opérateur.</p>
      <ul className="space-y-2">
        {operateurs.map((o) => (
          <li key={o} className="rounded-xl border border-gray-200 px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={!!user.pin_simultane?.[o]} disabled={occupe} data-testid={`pin-sim-${o}`}
                onChange={(e) => regler("/auth/pin-simultane", { operateur: o, actif: e.target.checked }, e.target.checked ? `${o} : le code secret part avec la séquence (enregistré)` : `${o} : le code secret est demandé dans la fenêtre de l'opérateur (enregistré)`)} />
              <span className="flex-1 font-medium">{o} : PIN envoyé en même temps</span>
            </label>
          </li>
        ))}
      </ul>
      {/* Débogage : visible et réglable par le SUPER-ADMINISTRATEUR seulement */}
      {user.role === "admin" && (
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
        <input type="checkbox" className="h-5 w-5" checked={!!user.debug_chaine} disabled={occupe} data-testid="debug-chaine"
          onChange={(e) => regler("/auth/debug-chaine", { actif: e.target.checked }, e.target.checked ? "Débogage activé (enregistré)" : "Débogage désactivé (enregistré)")} />
        <span className="flex-1 text-sm"><b>🐞 Débogage :</b> afficher la chaîne envoyée en clair (code secret visible à l'écran)</span>
      </label>
      )}
    </section>
  );
}
