import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { positionActuelle } from "@/lib/geoloc";

// Arrivée chez un marchand (lot 49) : si le compte a activé sa géolocalisation et que l'application est ouverte, la position est
// regardée toutes les 45 s (seulement quand l'écran est visible). Marchand connu à moins de 80 m → l'application demande si elle doit
// ouvrir le paiement avec ce marchand. Une même invitation n'est pas répétée avant 6 heures (« Plus tard » ou « Non »).
// Le serveur ne garde JAMAIS la position demandée ; il ne fait que chercher les marchands proches.
const INTERVALLE_MS = 45000;
const SILENCE_MS = 6 * 3600 * 1000;
const DEPLACEMENT_MIN_M = 30;          // pas de nouvelle question au serveur tant qu'on n'a pas bougé de 30 m (ou 5 min)
const CLE = "mpw_geo_invitations";

const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; } };
const noter = (cle) => { try { localStorage.setItem(CLE, JSON.stringify({ ...lire(), [cle]: Date.now() })); } catch { /* sans importance */ } };

// Distance approximative en mètres entre deux positions
function ecart(a, b) {
  const k = 111000, dx = (a.lon - b.lon) * k * Math.cos((a.lat * Math.PI) / 180), dy = (a.lat - b.lat) * k;
  return Math.hypot(dx, dy);
}

export default function ArriveeMarchand() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trouve, setTrouve] = useState(null);
  const derniere = useRef({ pos: null, le: 0 });
  const actif = !!user?.geoloc;

  useEffect(() => {
    if (!actif) return undefined;
    let annule = false;
    const regarder = async () => {
      if (document.visibilityState !== "visible") return;
      const pos = await positionActuelle({ delaiMs: 6000 });
      if (annule || !pos) return;
      const d = derniere.current;
      if (d.pos && ecart(d.pos, pos) < DEPLACEMENT_MIN_M && Date.now() - d.le < 5 * 60 * 1000) return;
      derniere.current = { pos, le: Date.now() };
      try {
        const { data } = await apiClient.get("/marchands/proches", { params: { lat: pos.lat, lon: pos.lon } });
        const vus = lire();
        const m = (data.marchands || []).find((x) => !(vus[`${x.operateur}:${x.code}`] > Date.now() - SILENCE_MS));
        if (m && !annule) { setTrouve(m); try { navigator.vibrate?.(150); } catch { /* sans importance */ } }
      } catch { /* silencieux : la fonction ne doit jamais gêner */ }
    };
    regarder();
    const t = setInterval(regarder, INTERVALLE_MS);
    const surVisibilite = () => { if (document.visibilityState === "visible") regarder(); };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => { annule = true; clearInterval(t); document.removeEventListener("visibilitychange", surVisibilite); };
  }, [actif, setTrouve]);

  const fermer = () => { if (trouve) noter(`${trouve.operateur}:${trouve.code}`); setTrouve(null); };
  const payer = () => {
    const m = trouve;
    noter(`${m.operateur}:${m.code}`);
    setTrouve(null);
    // Même adresse que le QR code d'un marchand : l'écran Payer s'ouvre avec le marchand déjà choisi
    navigate(`/?operateur=${encodeURIComponent(m.operateur)}&service=&code=${encodeURIComponent(m.code)}`);
  };

  return (
    <Modal ouvert={!!trouve} titre="📍 Vous êtes chez un marchand" onFermer={fermer}>
      {trouve && (
        <div className="space-y-3 text-sm">
          <p className="text-base"><b>{trouve.libelle || `Code ${trouve.code}`}</b> <span className="text-gray-500">({trouve.operateur}, à {trouve.distance_m} m)</span></p>
          <p className="text-gray-600">Ouvrir le paiement avec ce marchand ?</p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={payer}>Payer ici</button>
            <button type="button" className="btn-outline flex-1" onClick={fermer}>Pas maintenant</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
