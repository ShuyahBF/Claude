import { useEffect, useState } from "react";
import CarteCodeUssd from "@/components/CarteCodeUssd";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, couleurOperateur, dateHeure, fcfa, messageErreur } from "@/lib/api";

const STATUTS = {
  prepare: ["Préparé", "bg-gray-100 text-gray-700"],
  effectue: ["Payé", "bg-green-100 text-green-800"],
  abandonne: ["Abandonné", "bg-red-100 text-red-700"],
};

// Historique des paiements préparés par l'utilisateur : on peut réafficher le
// QR code (pour refaire le même paiement), changer le statut ou supprimer.
export default function Historique() {
  const toast = useToast();
  const [paiements, setPaiements] = useState(null);
  const [ouvert, setOuvert] = useState(null);

  useEffect(() => {
    apiClient.get("/paiements").then(({ data }) => setPaiements(data)).catch(() => setPaiements([]));
  }, []);

  const changerStatut = async (statut) => {
    try {
      const { data } = await apiClient.put(`/paiements/${ouvert.id}/statut`, { statut });
      setPaiements((liste) => liste.map((p) => (p.id === data.id ? data : p)));
      setOuvert(null);
    } catch (err) {
      toast.erreur(messageErreur(err));
    }
  };

  const supprimer = async (p) => {
    if (!window.confirm("Supprimer ce paiement de l'historique ?")) return;
    try {
      await apiClient.delete(`/paiements/${p.id}`);
      setPaiements((liste) => liste.filter((x) => x.id !== p.id));
      setOuvert(null);
    } catch (err) {
      toast.erreur(messageErreur(err));
    }
  };

  if (paiements === null) return <Chargement />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Historique</h1>
      {paiements.length === 0 && <p className="card text-gray-500">Aucun paiement préparé pour le moment.</p>}
      <ul className="space-y-2">
        {paiements.map((p) => {
          const [libelle, style] = STATUTS[p.statut] || STATUTS.prepare;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setOuvert(p)} className="choix">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurOperateur(p.operateur) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.service_nom}{p.marchand?.libelle ? ` · ${p.marchand.libelle}` : ""}</p>
                  <p className="text-xs text-gray-500">{p.operateur} · {dateHeure(p.cree_le)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fcfa(p.montant)}</p>
                  <span className={`badge ${style}`}>{libelle}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal ouvert={!!ouvert} titre="Paiement" onFermer={() => setOuvert(null)}>
        {ouvert && (
          <>
            <CarteCodeUssd paiement={ouvert} onStatut={changerStatut} />
            <button type="button" className="mt-4 w-full text-sm text-red-600 hover:underline" onClick={() => supprimer(ouvert)}>
              Supprimer de l'historique
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
