import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { pourUtilisateur } from "@/lib/journalIntime";
import { arreterSynchro, demarrerSynchro, synchroActive } from "@/lib/synchroTempsReel";

// SYNCHRONISATION EN TEMPS RÉEL (lot 223), sans écran : si elle est activée sur ce téléphone, elle démarre à l'ouverture de l'application (compte connecté)
// et s'arrête à la déconnexion. Le réglage et l'état se voient dans « Profil → Synchronisation entre appareils ».
export default function SynchroAuto() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return undefined;
    pourUtilisateur(user.id);
    if (synchroActive()) demarrerSynchro();
    return () => arreterSynchro();
  }, [user?.id]);
  return null;
}
