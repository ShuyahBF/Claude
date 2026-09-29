import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";

// Profil : coordonnées (téléphone et e-mail servent à se connecter) et mot de passe.
export default function Profil() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ nom: user.nom, prenom: user.prenom, telephone: user.telephone, email: user.email || "" });
  const [mdp, setMdp] = useState({ ancien: "", nouveau: "" });

  const enregistrer = async (e) => {
    e.preventDefault();
    try {
      const { data } = await apiClient.put("/auth/profil", { ...form, email: form.email.trim() || null });
      setUser(data);
      setForm({ nom: data.nom, prenom: data.prenom, telephone: data.telephone, email: data.email || "" });
      toast.succes("Profil enregistré");
    } catch (err) {
      toast.erreur(messageErreur(err, "Enregistrement impossible"));
    }
  };

  const changerMotDePasse = async (e) => {
    e.preventDefault();
    try {
      await apiClient.put("/auth/mot-de-passe", mdp);
      setMdp({ ancien: "", nouveau: "" });
      toast.succes("Mot de passe changé : vos autres appareils sont déconnectés");
    } catch (err) {
      toast.erreur(messageErreur(err, "Changement impossible"));
    }
  };

  const champ = (cle) => (e) => setForm({ ...form, [cle]: e.target.value });
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      <form onSubmit={enregistrer} className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="p-prenom">Prénom</label><input id="p-prenom" className="input" required value={form.prenom} onChange={champ("prenom")} /></div>
          <div><label className="label" htmlFor="p-nom">Nom</label><input id="p-nom" className="input" required value={form.nom} onChange={champ("nom")} /></div>
        </div>
        <div>
          <label className="label" htmlFor="p-tel">Téléphone</label>
          <input id="p-tel" className="input" type="tel" required value={form.telephone} onChange={champ("telephone")} />
        </div>
        <div>
          <label className="label" htmlFor="p-email">E-mail <span className="font-normal text-gray-400">(facultatif)</span></label>
          <input id="p-email" className="input" type="email" value={form.email} onChange={champ("email")} />
        </div>
        <p className="text-xs text-gray-500">Vous pouvez vous connecter avec votre téléphone ou votre e-mail.</p>
        <button type="submit" className="btn-primary">Enregistrer</button>
      </form>

      <form onSubmit={changerMotDePasse} className="card space-y-4">
        <h2 className="text-lg font-bold">Mot de passe</h2>
        <div><label className="label" htmlFor="m-ancien">Mot de passe actuel</label>
          <input id="m-ancien" className="input" type="password" required value={mdp.ancien} onChange={(e) => setMdp({ ...mdp, ancien: e.target.value })} autoComplete="current-password" /></div>
        <div><label className="label" htmlFor="m-nouveau">Nouveau mot de passe (8 caractères minimum)</label>
          <input id="m-nouveau" className="input" type="password" required minLength={8} value={mdp.nouveau} onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })} autoComplete="new-password" /></div>
        <button type="submit" className="btn-outline">Changer le mot de passe</button>
      </form>
    </div>
  );
}
