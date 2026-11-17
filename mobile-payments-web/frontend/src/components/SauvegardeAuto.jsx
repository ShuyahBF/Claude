import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { EVENEMENT_MAJ } from "@/components/AssistantSauvegarde";
import { cleDuJournal, pourUtilisateur } from "@/lib/journalIntime";
import { lireEtatServeur, poserAlerte, resumeComptes, sauvegarder } from "@/lib/sauvegarde";
import { VERSION } from "@/version";

// Sauvegarde AUTOMATIQUE (lot 168), sans écran : si l'utilisateur a choisi la sauvegarde en ligne ET que ce téléphone connaît la clé de son coffre,
// les données CHANGÉES sont chiffrées puis envoyées : peu après l'ouverture, toutes les 10 minutes, et quand l'application passe en arrière-plan.
// Une sauvegarde identique à la précédente n'est jamais renvoyée. Les échecs sont silencieux (réessai plus tard) : la fenêtre « Sécurité et sauvegarde » du profil montre l'état.
const PERIODE_MS = 10 * 60 * 1000;

export default function SauvegardeAuto() {
  const { user } = useAuth();
  const enCours = useRef(false);
  useEffect(() => {
    if (!user?.id) return undefined;
    pourUtilisateur(user.id);
    let arrete = false;
    const lancer = async () => {
      if (enCours.current || arrete) return;
      enCours.current = true;
      try {
        pourUtilisateur(user.id);
        const e = await lireEtatServeur();
        if (!e || e.mode !== "cloud") return;
        const r = await sauvegarder(await cleDuJournal(), { app: String(VERSION) });
        if (r.fait) window.dispatchEvent(new Event(EVENEMENT_MAJ));
        else if (r.raison === "moins" || r.raison === "vide") {      // les contrôles protègent la bonne sauvegarde : on suspend et on le DIT dans le profil
          poserAlerte(r.raison === "vide" ? "La sauvegarde automatique est suspendue : ce téléphone ne contient aucune donnée alors qu'une sauvegarde existe en ligne. Utilisez « Retrouver mes données »."
            : `La sauvegarde automatique est suspendue : elle contiendrait moins de données (${resumeComptes(r.comptes)}) que la dernière sauvegarde vérifiée (${resumeComptes(r.ancien)}).`);
          window.dispatchEvent(new Event(EVENEMENT_MAJ));
        }
      } catch (err) {
        if (err?.name === "SauvegardeRefusee") { poserAlerte(err.message); window.dispatchEvent(new Event(EVENEMENT_MAJ)); }   // refus des contrôles : visible, jamais silencieux
        /* autre échec (réseau…) : réessai à la prochaine échéance */
      } finally { enCours.current = false; }
    };
    const debut = setTimeout(lancer, 8000);
    const minuterie = setInterval(lancer, PERIODE_MS);
    const surVisibilite = () => { if (document.visibilityState === "hidden") lancer(); };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => { arrete = true; clearTimeout(debut); clearInterval(minuterie); document.removeEventListener("visibilitychange", surVisibilite); };
  }, [user?.id]);
  return null;
}
