import { useState } from "react";
import { useToast } from "@/components/Toast";
import ChampMotDePasse from "@/components/ChampMotDePasse";
import { apiClient } from "@/lib/api";
import { empreinteConnexionDisponible, empreinteConnexionMemorisee, empreinteConnexionMemoriser, empreinteConnexionOublier } from "@/lib/pontAndroid";

// Bloc du profil (application Android seulement) : se connecter avec l'empreinte du téléphone au lieu du mot de passe.
// Activer demande le mot de passe (règle 21) ; retirer oublie le secret de ce téléphone ET annule les empreintes du compte sur le serveur.
export default function EmpreinteProfil() {
  const toast = useToast();
  const [actif, setActif] = useState(empreinteConnexionMemorisee());
  const [mdp, setMdp] = useState("");
  const [occupe, setOccupe] = useState(false);
  if (!empreinteConnexionDisponible()) return null;

  const activer = async (e) => {
    e.preventDefault(); setOccupe(true); toast.info("Activation de l'empreinte en cours…");
    try {
      const { data } = await apiClient.post("/auth/empreinte/activer", { mot_de_passe: mdp, appareil: navigator.userAgent.slice(0, 60) });
      const r = await empreinteConnexionMemoriser(data.id, data.secret);
      if (r?.ok) { setActif(true); setMdp(""); toast.succes("🖐️ Empreinte activée : la prochaine connexion se fera avec le doigt."); }
      else toast.erreur(r?.erreur || "Activation impossible");
    } catch (err) { toast.erreur(err?.response?.data?.detail || "Activation impossible"); } finally { setOccupe(false); }
  };
  const retirer = async () => {
    setOccupe(true);
    try { await apiClient.post("/auth/empreinte/retirer"); } catch { /* le secret local est de toute façon oublié */ }
    empreinteConnexionOublier(); setActif(false); setOccupe(false);
    toast.succes("Empreinte retirée : la connexion demandera le mot de passe.");
  };
  return (
    <section className="card space-y-2" data-testid="empreinte-profil">
      <h2 className="text-lg font-bold">🖐️ Connexion par l'empreinte</h2>
      <p className="text-sm text-gray-600">Se connecter à auRor avec l'empreinte du téléphone, sans retaper le mot de passe. Un secret propre à ce téléphone est rangé dans son coffre
        et ne sert qu'après reconnaissance de votre doigt. Changer de mot de passe annule l'empreinte.</p>
      {actif ? (
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={occupe} onClick={retirer}>🗑️ Retirer l'empreinte</button>
      ) : (
        <form onSubmit={activer} className="space-y-2">
          <ChampMotDePasse required value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="Votre mot de passe" autoComplete="current-password" />
          <button type="submit" className="btn-primary" disabled={occupe || !mdp}>🖐️ Activer l'empreinte</button>
        </form>
      )}
    </section>
  );
}
