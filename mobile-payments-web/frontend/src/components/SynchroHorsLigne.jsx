// SynchroHorsLigne.jsx — Lot 192 : envoie au serveur, sans doublon, les paiements préparés hors connexion et leurs changements d'état (file chiffrée du téléphone).
// Rien à l'écran tant que la file est vide. Essais : au démarrage, au retour du réseau (événement « online »), puis toutes les minutes tant que la file n'est pas vide.
// Un petit bandeau indique ce qui attend ; un toast dit ce qui vient d'être transmis (jamais de transmission silencieuse).
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { fileNombre, fileSynchroniser } from "@/lib/horsLigne";
import { pourUtilisateur } from "@/lib/journalIntime";

export default function SynchroHorsLigne() {
  const { user } = useAuth();
  const toast = useToast();
  const [attente, setAttente] = useState(0);

  const essayer = useCallback(async () => {
    if (!user) return;
    pourUtilisateur(user.id);
    try {
      if ((await fileNombre()) === 0) { setAttente(0); return; }
      const r = await fileSynchroniser(apiClient);
      setAttente(r.restants);
      if (r.envoyes > 0) toast.succes(`${r.envoyes} élément(s) préparé(s) hors connexion transmis au serveur`);
      if (r.abandonnes > 0) toast.erreur(`${r.abandonnes} élément(s) refusé(s) par le serveur (saisie ou service devenu invalide) : ils ne seront pas renvoyés`);
    } catch { /* la file reste en place : nouvel essai plus tard */ }
  }, [user, toast]);

  useEffect(() => {
    essayer();
    const surReseau = () => essayer();
    window.addEventListener("online", surReseau);
    const minuterie = setInterval(() => { if (document.visibilityState === "visible") essayer(); }, 60000);
    return () => { window.removeEventListener("online", surReseau); clearInterval(minuterie); };
  }, [essayer]);

  if (attente === 0) return null;
  return (
    <p role="status" className="fixed bottom-2 left-2 right-2 z-40 mx-auto max-w-md rounded-lg bg-amber-100 px-3 py-2 text-center text-xs text-amber-950 shadow" data-testid="synchro-en-attente">
      📴 {attente} élément(s) en attente d'envoi : transmission automatique dès que le réseau revient.
    </p>
  );
}
