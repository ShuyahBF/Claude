import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// Charge une liste de l'API ; `charger()` relit et renvoie le nombre de lignes (pour le toast d'Actualiser).
export function useListe(chemin) {
  const [lignes, setLignes] = useState([]);
  const [erreur, setErreur] = useState("");
  const charger = useCallback(async () => {
    const d = await api(chemin);
    setLignes(d); setErreur("");
    return d.length;
  }, [chemin]);
  useEffect(() => { charger().catch((e) => setErreur(e.message)); }, [charger]);
  return { lignes, charger, erreur };
}
