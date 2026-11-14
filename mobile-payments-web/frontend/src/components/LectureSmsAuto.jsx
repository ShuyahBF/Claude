// LECTURE AUTOMATIQUE des SMS de paiement (application Android « direct »), sans appuyer sur « Relire mes SMS » :
//   - à l'ouverture de l'application, puis chaque fois qu'elle revient au premier plan (on revient du composeur, d'une autre application…),
//   - puis toutes les minutes tant que l'application est affichée.
// Silencieuse quand il n'y a rien de nouveau ; un toast annonce les NOUVEAUX paiements trouvés. Si la lecture est refusée (autorisation « SMS »), elle s'arrête
// (aucune demande répétée) : le bouton « Lire mes SMS » de l'Historique reste disponible et donne la marche à suivre.
import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { synchroniserSms } from "@/lib/lectureSms";
import { capacites } from "@/lib/pontAndroid";

const PAS_MS = 60_000;
const JOURS = 7;

export default function LectureSmsAuto() {
  const toast = useToast();
  const enCours = useRef(false);
  const arret = useRef(false);

  useEffect(() => {
    if (!capacites()?.sms) return undefined;
    const lire = async () => {
      if (enCours.current || arret.current || document.visibilityState !== "visible") return;
      enCours.current = true;
      try {
        const r = await synchroniserSms(JOURS);
        if (r.erreur) arret.current = true;
        else if (r.nouvelles > 0) toast.succes(`${r.nouvelles} nouveau(x) paiement(s) lu(s) dans vos SMS`);
      } finally { enCours.current = false; }
    };
    lire();
    const t = setInterval(lire, PAS_MS);
    document.addEventListener("visibilitychange", lire);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", lire); };
  }, [toast]);

  return null;
}
