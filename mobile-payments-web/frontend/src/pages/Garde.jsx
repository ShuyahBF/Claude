import { useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import { lireAvecAttente } from "@/lib/attente";

// Pharmacies de garde (lot 43) : reprend le contenu de sawalismartsystems.com/garde (lu par le serveur chez SAWALI).
// Afficher la liste est libre ; la RECHERCHE (nom, quartier, ville) est limitée à 10 par jour.

// Date « 2026-10-10 » → « 10/10/2026 »
const jj = (d) => (d ? d.split("-").reverse().join("/") : "");

// Carte d'une pharmacie : nom, lieu, bouton d'appel et WhatsApp
function Fiche({ o, appui }) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <p className={`font-semibold ${appui ? "italic" : ""}`}>{o.name}</p>
      {o.intitule && o.intitule !== o.name && <p className="text-xs italic text-gray-500">{o.intitule}</p>}
      {(o.location_hint || o.address) && (
        <p className="mt-1 text-sm text-gray-700">📍 {o.location_hint || o.address}{o.city ? <span className="text-gray-500">, {o.city}</span> : null}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {o.phone && <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="btn-outline btn-sm">📞 {o.phone}</a>}
        {o.whatsapp && <a href={`https://wa.me/${o.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">WhatsApp</a>}
      </div>
    </li>
  );
}

export default function Garde() {
  const toast = useToast();
  const [garde, setGarde] = useState(null);        // null = chargement
  const [indispo, setIndispo] = useState(false);
  const [restantes, setRestantes] = useState(null);
  const [terme, setTerme] = useState("");
  const [filtre, setFiltre] = useState("");        // recherche appliquée (vide = liste complète)
  const [cherche, setCherche] = useState(false);

  // Liste complète (affichage libre, non décomptée)
  const charger = () => {
    setGarde(null); setIndispo(false);
    lireAvecAttente("/garde").then((r) => {
      if (r.garde) { setGarde(r.garde); setRestantes(r.recherches_restantes); } else setIndispo(true);
    }).catch(() => setIndispo(true));
  };
  useEffect(() => { charger(); }, []);

  // Recherche : décomptée côté serveur (10 par jour)
  const rechercher = async (e) => {
    e.preventDefault();
    if (terme.trim().length < 2) return;
    setCherche(true);
    try {
      const { data } = await apiClient.post("/garde/recherche", { q: terme.trim() });
      if (data.garde) { setGarde(data.garde); setRestantes(data.recherches_restantes); setFiltre(terme.trim()); }
      else toast.info("Liste en cours de chargement, réessayez dans un instant");
    } catch (err) {
      toast.erreur(messageErreur(err, "Recherche impossible"));
      if (err.response?.status === 429) setRestantes(0);
    } finally { setCherche(false); }
  };

  const effacer = () => { setTerme(""); setFiltre(""); charger(); };

  if (garde === null && !indispo) return <Chargement />;
  if (indispo) return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold">🏥 Pharmacies de garde</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Liste indisponible pour le moment.</p>
      <button type="button" className="btn-outline" onClick={charger}>Réessayer</button>
    </div>
  );
  const vide = !garde.ok || (garde.officines.length === 0 && garde.appui.length === 0);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">🏥 Pharmacies de garde</h1>
      {garde.entete && <p className="whitespace-pre-wrap rounded-lg bg-sky-50 p-3 text-center text-sm text-sky-900">{garde.entete}</p>}
      {garde.ok && (
        <p className="text-sm text-gray-700">
          Semaine <strong>{garde.semaine}</strong> · du {jj(garde.du)} au {jj(garde.au)} · Groupe <strong>{garde.groupe}</strong>
        </p>
      )}
      <p className="text-xs italic text-gray-500">Liste mise à jour automatiquement chaque semaine (source : sawalismartsystems.com/garde).</p>

      <form onSubmit={rechercher} className="flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1" placeholder="Nom, quartier, ville…" value={terme} maxLength={60}
          onChange={(e) => setTerme(e.target.value)} disabled={restantes === 0} />
        <button type="submit" className="btn-primary" disabled={cherche || restantes === 0 || terme.trim().length < 2}>Rechercher</button>
        {filtre && <button type="button" className="btn-outline" onClick={effacer}>Tout afficher</button>}
      </form>
      <p className="text-xs text-gray-500">
        {restantes === 0 ? "Limite atteinte : 10 recherches par jour. La liste complète reste affichée ; réessayez demain."
          : `Recherches restantes aujourd'hui : ${restantes} sur 10`}
      </p>

      {vide ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {filtre ? `Aucune pharmacie ne correspond à « ${filtre} ».` : "Aucune pharmacie de garde n'est définie pour cette semaine."}
        </p>
      ) : (
        <>
          {garde.officines.length > 0 && <ul className="grid gap-3 sm:grid-cols-2">{garde.officines.map((o) => <Fiche key={o.id} o={o} />)}</ul>}
          {garde.appui.length > 0 && (
            <>
              <h2 className="pt-2 text-lg font-semibold">Pharmacies d'appui</h2>
              <ul className="grid gap-3 sm:grid-cols-2">{garde.appui.map((o) => <Fiche key={o.id} o={o} appui />)}</ul>
            </>
          )}
        </>
      )}
      {garde.pied && <p className="whitespace-pre-wrap text-center text-xs text-gray-500">{garde.pied}</p>}
    </div>
  );
}
