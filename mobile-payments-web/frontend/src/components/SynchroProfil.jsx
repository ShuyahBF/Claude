// « Synchronisation entre appareils » dans le Profil (lot 223) : activer / désactiver la synchronisation EN TEMPS RÉEL de vos données (journal, carnet, SMS de paiement
// avec leurs détails, budget) entre vos appareils connectés au même compte. Tout est chiffré avec la clé de votre coffre : auRor ne lit rien.
// À activer sur CHAQUE appareil ; le coffre doit être ouvert (phrase secrète ou code) sur chacun. Les photos de tickets restent sur leur appareil.
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { EVENEMENT_SYNCHRO, activerSynchro, desactiverSynchro, statutSynchro, synchroniserMaintenant } from "@/lib/synchroTempsReel";

const dateHeure = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" }); } catch { return "—"; } };

export default function SynchroProfil() {
  const toast = useToast();
  const [s, setS] = useState(statutSynchro());
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    const maj = () => setS(statutSynchro());
    window.addEventListener(EVENEMENT_SYNCHRO, maj);
    return () => window.removeEventListener(EVENEMENT_SYNCHRO, maj);
  }, []);

  const activer = async () => {
    setOccupe(true);
    toast.info("Activation de la synchronisation en cours…");
    const r = await activerSynchro();
    setOccupe(false);
    if (!r.ok) { toast.erreur(r.raison === "coffre_ferme" ? "Ouvrez d'abord votre coffre (phrase secrète ou code) dans « Sécurité et sauvegarde »." : "Activation impossible pour l'instant."); return; }
    toast.succes("Synchronisation activée : vos appareils se tiennent à jour en quelques secondes.");
  };
  const desactiver = async (effacer) => {
    setOccupe(true);
    await desactiverSynchro({ effacerServeur: effacer });
    setOccupe(false);
    toast.succes(effacer ? "Synchronisation désactivée et flux effacé sur le serveur." : "Synchronisation désactivée sur ce téléphone.");
  };
  const actualiser = () => { toast.info("Synchronisation en cours…"); synchroniserMaintenant(); setTimeout(() => toast.succes(`Synchronisation relancée : ${statutSynchro().envoyes} envoyé(s), ${statutSynchro().recus} reçu(s) depuis l'ouverture.`), 1500); };

  return (
    <section className="card space-y-3" data-testid="synchro-profil">
      <h2 className="text-lg font-bold">🔄 Synchronisation entre appareils</h2>
      <p className="text-sm text-gray-600">Vos données (journal, carnet, SMS de paiement avec leurs détails, budget) restent identiques sur tous vos appareils, en quelques secondes. Rien n'est écrasé : pour chaque fiche, la modification la plus récente l'emporte. Tout est chiffré avec la clé de votre coffre : auRor ne lit rien. À activer sur chaque appareil. Les photos de tickets restent sur leur appareil.</p>
      {s.actif ? (
        <>
          <p className={`rounded-lg p-3 text-sm ${s.erreur ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`} role="status">
            {s.erreur ? `⚠️ ${s.erreur}` : s.tourne ? "✅ Synchronisation en temps réel active sur cet appareil." : "⏳ Démarrage…"}
            {s.derniere && <span className="block text-xs">Dernier échange : {dateHeure(s.derniere)} · {s.envoyes} envoyé(s), {s.recus} reçu(s) depuis l'ouverture</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={actualiser}>🔄 Actualiser</button>
            <button type="button" className="btn-secondary" disabled={occupe} onClick={() => desactiver(false)}>⏸️ Désactiver sur ce téléphone</button>
            <button type="button" className="btn-secondary" disabled={occupe} onClick={() => { if (window.confirm("Désactiver et effacer le flux de synchronisation sur le serveur ? Vos données restent sur chaque appareil et dans la sauvegarde en ligne.")) desactiver(true); }}>🧹 Désactiver et effacer le flux</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-primary" disabled={occupe} onClick={activer}>🔄 Activer la synchronisation en temps réel</button>
      )}
    </section>
  );
}
