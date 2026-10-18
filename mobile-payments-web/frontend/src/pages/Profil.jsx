import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";
import ChampMotDePasse from "@/components/ChampMotDePasse";
import ChampTelephone from "@/components/ChampTelephone";
import { etatAutorisation, geolocalisationDisponible, positionActuelle } from "@/lib/geoloc";
import { abonnerPush, activerNotifications, CHOIX_TONALITE, declencherAlerteRenforcee, desabonnerPush, ecrirePreferences, etatNotifications, jouerSon, lirePreferences, pushDisponible, vibrer } from "@/lib/alertes";

// Suppression de son compte (lot 80, exigée par Google Play) : le mot de passe confirme ; le serveur efface le compte, ses archives en ligne
// et toutes ses données, puis la session est fermée. Le compte administrateur ne s'affiche pas ici.
function ZoneSuppression() {
  const toast = useToast();
  const { deconnexion } = useAuth();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [mdp, setMdp] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const supprimer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      await apiClient.post("/compte/supprimer", { mot_de_passe: mdp }, { timeout: 90000 });
      toast.succes("Votre compte et vos données ont été supprimés.");
      try { await deconnexion(); } catch { /* la session est déjà fermée par le serveur */ }
      navigate("/connexion", { replace: true });
    } catch (err) { toast.erreur(messageErreur(err, "Suppression impossible")); } finally { setEnvoi(false); }
  };
  return (
    <section className="card space-y-3 border-red-200" data-testid="suppression-compte">
      <h2 className="text-lg font-bold text-red-800">Supprimer mon compte</h2>
      <p className="text-sm text-gray-600">
        Votre compte et toutes vos données seront effacés définitivement : paiements préparés, rappels, anniversaires, cartes, archives en ligne, appareils de notification.
        Un abonnement en cours n'est pas remboursé. <Link to="/suppression-compte" className="font-semibold text-primary underline">Comment ça marche</Link>
      </p>
      {!ouvert ? (
        <button type="button" className="btn-outline" onClick={() => setOuvert(true)}>Supprimer mon compte…</button>
      ) : (
        <form onSubmit={supprimer} className="space-y-3">
          <label className="label" htmlFor="suppr-mdp">Tapez votre mot de passe pour confirmer</label>
          <ChampMotDePasse id="suppr-mdp" required value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary bg-red-700 hover:bg-red-800" disabled={envoi || !mdp}>{envoi ? "Suppression…" : "Supprimer définitivement"}</button>
            <button type="button" className="btn-clair" disabled={envoi} onClick={() => { setOuvert(false); setMdp(""); }}>Annuler</button>
          </div>
        </form>
      )}
    </section>
  );
}

// Profil : coordonnées (téléphone et e-mail servent à se connecter) et mot de passe.
export default function Profil() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ nom: user.nom, prenom: user.prenom, telephone: user.telephone, email: user.email || "" });
  const [mdp, setMdp] = useState({ ancien: "", nouveau: "" });
  // Sons et notifications (lot 40) : réglages gardés dans le navigateur de cet appareil
  const [alertes, setAlertes] = useState(lirePreferences);
  const [etatNotif, setEtatNotif] = useState(etatNotifications);
  const tester = async () => {
    jouerSon("medicament", { force: true }); vibrer();
    try { await apiClient.post("/push/test"); toast.succes("Notification d'essai envoyée par le serveur : elle doit apparaître dans quelques secondes."); }
    catch (err) { toast.erreur(messageErreur(err, "Envoi d'essai impossible")); }
  };
  // Super-administrateur : « mode démo » = soumis à l'abonnement comme un utilisateur (sinon fonctions payantes ouvertes sans paiement)
  const basculerModeDemo = async (actif) => {
    try { const { data } = await apiClient.put("/auth/mode-demo", { actif }); setUser(data); toast.succes(actif ? "Mode démo activé : l'abonnement s'applique aussi à vous" : "Mode démo désactivé : fonctions payantes ouvertes pour vous"); }
    catch (err) { toast.erreur(messageErreur(err, "Réglage impossible")); }
  };
  // Géolocalisation du compte (lot 49) : activer demande d'abord l'autorisation au navigateur (fenêtre du téléphone)
  const [geoEnCours, setGeoEnCours] = useState(false);
  const basculerGeoloc = async (voulu) => {
    setGeoEnCours(true);
    try {
      if (voulu) {
        if (!geolocalisationDisponible()) { toast.erreur("Ce navigateur ne sait pas géolocaliser."); return; }
        const pos = await positionActuelle({ delaiMs: 12000, ageMaxMs: 0 });      // déclenche la demande d'autorisation
        if (!pos) {
          const etat = await etatAutorisation();
          toast.erreur(etat === "denied" ? "Localisation refusée : autorisez-la pour ce site dans les réglages du navigateur." : "Position introuvable : activez le GPS du téléphone et réessayez.");
          return;
        }
      }
      const { data } = await apiClient.put("/auth/geolocalisation", { actif: voulu });
      setUser(data);
      toast.succes(voulu ? "Géolocalisation activée" : "Géolocalisation désactivée");
    } catch (err) { toast.erreur(messageErreur(err, "Réglage impossible")); } finally { setGeoEnCours(false); }
  };
  const regler = (maj) => { const p = { ...alertes, ...maj }; setAlertes(p); ecrirePreferences(p); };
  const basculerNotifications = async (voulu) => {
    if (!voulu) { await desabonnerPush(apiClient); regler({ notifications: false }); return; }
    const etat = await activerNotifications();          // demande l'autorisation au navigateur
    setEtatNotif(etat);
    regler({ notifications: etat === "granted" });
    if (etat === "granted") {
      // Abonnement push : le serveur pourra alerter même application fermée
      const abonne = await abonnerPush(apiClient);
      toast.succes(abonne ? "Notifications activées, même application fermée" : "Notifications activées (application ouverte seulement)");
    }
    else if (etat === "denied") toast.erreur("Notifications bloquées : autorisez-les dans les réglages du navigateur pour ce site.");
    else if (etat === "indisponible") toast.erreur("Les notifications ne sont pas disponibles sur cet appareil.");
  };

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
          <ChampTelephone id="p-tel" required valeur={form.telephone} onChange={(v) => setForm((f) => ({ ...f, telephone: v }))} />
        </div>
        <div>
          <label className="label" htmlFor="p-email">E-mail <span className="font-normal text-gray-400">(facultatif)</span></label>
          <input id="p-email" className="input" type="email" value={form.email} onChange={champ("email")} />
        </div>
        <p className="text-xs text-gray-500">Vous pouvez vous connecter avec votre téléphone ou votre e-mail.</p>
        <button type="submit" className="btn-primary">Enregistrer</button>
      </form>

      {/* Géolocalisation du compte (lot 49) */}
      <section className="card space-y-2" data-testid="geolocalisation">
        <h2 className="text-lg font-bold">📍 Géolocalisation des paiements</h2>
        <p className="text-sm text-gray-600">Activée, elle garde le lieu de vos paiements dans votre historique et rattache le code marchand à son
          emplacement. À l'ouverture de l'application, si vous êtes chez un marchand déjà connu, elle propose d'ouvrir le paiement avec lui.
          Désactivée, aucune position n'est utilisée. Le site ne suit pas vos déplacements : votre position n'est pas conservée en dehors de vos paiements.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!user.geoloc} disabled={geoEnCours} onChange={(e) => basculerGeoloc(e.target.checked)} /> Activer la géolocalisation sur mon compte
        </label>
      </section>

      {/* Réservé au super-administrateur : dispense d'abonnement et mode démo (lot 44) */}
      {user.role === "admin" && (
        <section className="card space-y-2" data-testid="mode-demo">
          <h2 className="text-lg font-bold">🛡️ Abonnement du super-administrateur</h2>
          <p className="text-sm text-gray-600">Les fonctions payantes (lecture OCR, transcription vocale) vous sont ouvertes sans abonnement.
            Activez le mode démo pour voir ce que voit un utilisateur (refus avec le prix de la formule).</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!user.mode_demo} onChange={(e) => basculerModeDemo(e.target.checked)} /> Mode démo (m'appliquer l'abonnement)
          </label>
        </section>
      )}

      {/* Sons et notifications des rappels (médicaments, paiements, anniversaires) et du support */}
      <section className="card space-y-4" data-testid="alertes">
        <h2 className="text-lg font-bold">🔔 Sons et notifications</h2>
        <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alertes.son} onChange={(e) => regler({ son: e.target.checked })} />
          <span className="font-semibold">Jouer un son à chaque rappel</span></label>
        <div className={alertes.son ? "" : "opacity-50"}>
          <label className="label" htmlFor="volume">Intensité du son : <span className="tabular-nums">{alertes.volume} %</span></label>
          <div className="flex items-center gap-3">
            <input id="volume" type="range" min={0} max={100} step={5} className="w-full" value={alertes.volume} disabled={!alertes.son}
              onChange={(e) => regler({ volume: Number(e.target.value) })} />
            <button type="button" className="btn-outline btn-sm shrink-0" onClick={() => { jouerSon("medicament", { force: true }); vibrer(); }}>▶ Tester le son</button>
          </div>
          <label className="label mt-3" htmlFor="tonalite">Tonalité du son</label>
          <select id="tonalite" className="input" value={alertes.tonalite} disabled={!alertes.son}
            onChange={(e) => { regler({ tonalite: e.target.value }); setTimeout(() => jouerSon("medicament", { force: true }), 0); }}>
            {CHOIX_TONALITE.map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-500">Chaque type de rappel a sa mélodie : médicament (double appel), paiement, anniversaire, support. Le son suit le volume « multimédia » du téléphone : montez-le avec les touches de volume si le son reste faible.</p>
        </div>
        <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alertes.vibration} onChange={(e) => regler({ vibration: e.target.checked })} />
          <span className="font-semibold">Vibrer (téléphone)</span></label>
        {/* Alerte renforcée pour les malvoyants (lot 52) */}
        <div className="space-y-2 rounded-xl border border-gray-200 p-3">
          <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alertes.renforcee} onChange={(e) => regler({ renforcee: e.target.checked })} />
            <span><b>♿ Alerte renforcée (malvoyants)</b><span className="block text-sm text-gray-500">À chaque rappel : écran qui clignote en jaune et noir avec de très gros caractères, vibration longue répétée, son répété. Dure jusqu'au toucher de « J'ai compris ».</span></span></label>
          <div className={alertes.renforcee ? "space-y-2 pl-8" : "space-y-2 pl-8 opacity-50"}>
            <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alertes.lecture} disabled={!alertes.renforcee} onChange={(e) => regler({ lecture: e.target.checked })} />
              <span>Lire le rappel à voix haute</span></label>
            <button type="button" className="btn-outline btn-sm" disabled={!alertes.renforcee}
              onClick={() => declencherAlerteRenforcee([{ cle: "essai", type: "medicament", titre: "Essai", texte: "Prise de médicament à 10 heures" }])}>Tester l'alerte renforcée</button>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alertes.notifications && etatNotif === "granted"} disabled={etatNotif === "indisponible"}
            onChange={(e) => basculerNotifications(e.target.checked)} /><span className="font-semibold">Afficher une notification</span></label>
          {alertes.notifications && etatNotif === "granted" && <button type="button" className="btn-outline btn-sm mt-2" onClick={tester}>🔔 Tester une notification (envoyée par le serveur)</button>}
          <p className="mt-1 text-xs text-gray-500">
            {etatNotif === "granted" && (pushDisponible() ? "Autorisées : le serveur vous alerte même application fermée." : "Autorisées (application ouverte seulement : ce navigateur ne gère pas le push).")}
            {etatNotif === "denied" && "Bloquées dans le navigateur : autorisez-les dans les réglages du site pour pouvoir les activer."}
            {etatNotif === "default" && "Le navigateur vous demandera l'autorisation à l'activation."}
            {etatNotif === "indisponible" && "Non disponibles sur cet appareil."}
          </p>
        </div>
        <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
          Avec les notifications activées, le serveur vous alerte même application fermée (prise de médicament à l'heure, paiement à régler, anniversaire). Le son choisi ici
          accompagne les alertes affichées dans l'application ouverte. Sur iPhone, ajoutez d'abord auRor à l'écran d'accueil. Ces réglages sont propres à cet appareil.
        </p>
      </section>

      <form onSubmit={changerMotDePasse} className="card space-y-4">
        <h2 className="text-lg font-bold">Mot de passe</h2>
        <div><label className="label" htmlFor="m-ancien">Mot de passe actuel</label>
          <ChampMotDePasse id="m-ancien" required value={mdp.ancien} onChange={(e) => setMdp({ ...mdp, ancien: e.target.value })} autoComplete="current-password" /></div>
        <div><label className="label" htmlFor="m-nouveau">Nouveau mot de passe (8 caractères minimum)</label>
          <ChampMotDePasse id="m-nouveau" required minLength={8} value={mdp.nouveau} onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })} autoComplete="new-password" /></div>
        <button type="submit" className="btn-outline">Changer le mot de passe</button>
      </form>

      {user.role !== "admin" && <ZoneSuppression />}
    </div>
  );
}
