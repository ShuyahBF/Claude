import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import OngletsAdmin from "@/components/OngletsAdmin";
import PastilleOperateur from "@/components/PastilleOperateur";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";
import { formaterTelephone } from "@/lib/operateurs";

// Comptes marchands (administrateur, lot 58) : vérification AVANT que les clients voient le QR PI-SPI d'un marchand.
// Contrôle conseillé : comparer le QR et le titulaire avec ceux de la banque, et appeler le marchand.
const STATUTS = { en_attente: ["À vérifier", "bg-amber-100 text-amber-900"], verifie: ["Vérifié", "bg-green-100 text-green-800"], suspendu: ["Suspendu", "bg-red-100 text-red-700"] };

export default function AdminMarchands() {
  const toast = useToast();
  const [liste, setListe] = useState(null);
  const [qr, setQr] = useState(null);                       // {nom, pispi} du compte dont on regarde le QR
  const charger = useCallback(() => apiClient.get("/admin/marchands").then(({ data }) => setListe(data.marchands)).catch((e) => { toast.erreur(messageErreur(e, "Liste indisponible")); setListe([]); }), [toast]);
  useEffect(() => { charger(); }, [charger]);

  const statut = async (m, nouveau) => {
    try { await apiClient.put(`/admin/marchands/${m.id}/statut`, { statut: nouveau }); toast.succes(nouveau === "verifie" ? "Compte vérifié : les clients peuvent payer par PI-SPI" : "Statut modifié"); charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };
  const voirQr = async (m) => {
    try { const { data } = await apiClient.get(`/admin/marchands/${m.id}/qr`); setQr({ nom: m.nom, pispi: data.pispi }); }
    catch (err) { toast.erreur(messageErreur(err, "QR indisponible")); }
  };

  if (liste === null) return <Chargement />;
  return (
    <div className="space-y-4">
      <OngletsAdmin />
      <h1 className="text-2xl font-bold">Comptes marchands <span className="text-base font-normal text-gray-500">({liste.length})</span></h1>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ne vérifiez un compte qu'après avoir comparé le QR et le titulaire avec ceux de la banque du marchand : un QR détourné ferait payer vos utilisateurs à la mauvaise personne.</p>
      {liste.length === 0 && <p className="card text-gray-500">Aucun compte marchand pour le moment.</p>}
      <ul className="space-y-2">
        {liste.map((m) => {
          const [libelle, style] = STATUTS[m.statut] || STATUTS.en_attente;
          return (
            <li key={m.id} className="card space-y-2 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-semibold">{m.nom}</p>
                  <p className="text-xs text-gray-500">{m.titulaire_compte} · {formaterTelephone(m.telephone)}<PastilleOperateur telephone={m.telephone} /></p></div>
                <span className={`badge shrink-0 ${style}`}>{libelle}</span>
              </div>
              <p className="text-gray-600">Codes : {m.codes.length ? m.codes.map((c) => `${c.operateur} ${c.code}`).join(" · ") : "aucun"}</p>
              {m.pispi ? <p className="text-gray-600">{m.pispi.banque} · {m.pispi.titulaire} · <span className="font-mono">{m.pispi.adresse_paiement}</span></p> : <p className="text-gray-400">Sans PI-SPI</p>}
              <p className="text-xs text-gray-400">Modifié le {dateHeure(m.modifie_le)}</p>
              <div className="flex flex-wrap gap-1.5">
                {m.pispi?.qr_present && <button type="button" className="btn-outline btn-sm" onClick={() => voirQr(m)}>👁 Voir le QR</button>}
                {m.statut !== "verifie" && <button type="button" className="btn-primary btn-sm" onClick={() => statut(m, "verifie")}>✓ Vérifier</button>}
                {m.statut !== "suspendu" && <button type="button" className="btn-outline btn-sm text-red-700" onClick={() => statut(m, "suspendu")}>Suspendre</button>}
                {m.statut === "suspendu" && <button type="button" className="btn-outline btn-sm" onClick={() => statut(m, "en_attente")}>Remettre en vérification</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <Modal ouvert={!!qr} titre={`QR PI-SPI · ${qr?.nom || ""}`} onFermer={() => setQr(null)}>
        {qr && <div className="space-y-2 text-center text-sm"><img src={qr.pispi.qr_data_url} alt="QR PI-SPI du marchand" className="mx-auto h-56 w-56 rounded-lg border border-gray-200 bg-white p-2" />
          <p>{qr.pispi.banque} · {qr.pispi.titulaire}</p><p className="font-mono">{qr.pispi.adresse_paiement}</p></div>}
      </Modal>
    </div>
  );
}
