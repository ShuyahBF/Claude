import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";
import Version from "../components/Version.jsx";
import { useMoi } from "../App.jsx";
import WhatsApp from "./WhatsApp.jsx";

// Page Paramètres : rubriques dépliables ; chaque carte « Nouveautés » ouvre la rubrique où se règle la nouveauté (règle 5).
export default function Parametres() {
  const [nv, setNv] = useState(null);
  const [perf, setPerf] = useState([]);
  const [ouverte, setOuverte] = useState("Version Et Nouveautés");
  const moi = useMoi(); const toast = useToast();
  const charger = async () => {
    const [n, p] = await Promise.all([api("/nouveautes"), api("/performances")]);
    setNv(n); setPerf(p);
    return n.cartes.length + p.length;
  };
  useEffect(() => { charger().catch((e) => toast(e.message, "erreur")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rubrique = (titre, contenu) => (
    <section className="rubrique" id={titre}>
      <button className="rubrique-titre" onClick={() => setOuverte(ouverte === titre ? "" : titre)}>{ouverte === titre ? "▼" : "▶"} {titre}</button>
      {ouverte === titre && <div className="rubrique-corps">{contenu}</div>}
    </section>);
  return (
    <>
      <Entete titre="Paramètres" charger={charger} unite="ligne(s)" />
      {rubrique("Version Et Nouveautés", <>
        <p><Version complet /></p>
        <div className="cartes-nouveautes">{nv?.cartes.map((c) => (
          <div className="carte-nv" key={c.lot}>
            <b>Lot {c.lot} — {c.titre}</b><p>{c.description}</p><small>{c.date}</small>
            <button onClick={() => { setOuverte(c.rubrique); document.getElementById(c.rubrique)?.scrollIntoView(); }}>⚙ Ouvrir « {c.rubrique} »</button>
          </div>))}</div></>)}
      {rubrique("WhatsApp Et Clés HMAC", <WhatsApp integre />)}
      {rubrique("Performances", <>
        <p className="aide">Appels les plus lents (objectif : moins de 1 s côté serveur).</p>
        <Tableau lignes={perf.map((p) => ({ ...p, id: p.route }))} vide="Aucun appel mesuré." colonnes={[
          { titre: "Route", valeur: (p) => p.route }, { titre: "Appels", valeur: (p) => p.nombre, nombre: true },
          { titre: "Moyenne (ms)", valeur: (p) => p.moyenne_ms, nombre: true, rendu: (p) => <b className={p.lente ? "alerte-texte" : "ok-texte"}>{p.moyenne_ms}</b> },
          { titre: "Dernier (ms)", valeur: (p) => p.dernier_ms, nombre: true }, { titre: "Max (ms)", valeur: (p) => p.max_ms, nombre: true }]} /></>)}
      {moi.role === "super_admin" && <p className="aide">Super-administrateur : choisissez un client pour voir ses rubriques.</p>}
    </>
  );
}
