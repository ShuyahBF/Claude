import { useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import QrCode from "@/components/QrCode";
import { useToast } from "@/components/Toast";
import { apiClient, couleurOperateur, messageErreur } from "@/lib/api";

// Annuaire des codes marchands + création d'un « QR marchand » imprimable.
// Le QR contient l'adresse du site avec l'opérateur, le service et le code :
// le client le scanne avec son téléphone, choisit le montant, puis compose.
export default function Marchands() {
  const toast = useToast();
  const [operateurs, setOperateurs] = useState([]);
  const [services, setServices] = useState([]); // services « code marchand » de tous les opérateurs
  const [marchands, setMarchands] = useState(null);
  const [filtre, setFiltre] = useState({ operateur: "", q: "" });
  const [form, setForm] = useState({ operateur: "", code: "", libelle: "" });
  const [affiche, setAffiche] = useState(null); // marchand dont on affiche le QR

  useEffect(() => {
    apiClient.get("/operateurs").then(({ data }) => {
      setOperateurs(data);
      setForm((f) => ({ ...f, operateur: f.operateur || data[0] || "" }));
    }).catch(() => {});
    apiClient.get("/services").then(({ data }) => setServices(data.filter((s) => s.champs.some((c) => c.isMerchantCode))))
      .catch(() => {});
  }, []);

  // Recherche (petit délai pendant la frappe)
  useEffect(() => {
    const minuterie = setTimeout(() => {
      apiClient.get("/marchands", { params: { operateur: filtre.operateur || undefined, q: filtre.q || undefined } })
        .then(({ data }) => setMarchands(data)).catch(() => setMarchands([]));
    }, 300);
    return () => clearTimeout(minuterie);
  }, [filtre]);

  const ajouter = async (e) => {
    e.preventDefault();
    try {
      const { data } = await apiClient.post("/marchands", form);
      setMarchands((m) => [data, ...(m || []).filter((x) => !(x.code === data.code && x.operateur === data.operateur))]);
      setForm({ ...form, code: "", libelle: "" });
      toast.succes("Marchand enregistré");
      setAffiche(data);
    } catch (err) {
      toast.erreur(messageErreur(err, "Vérifiez le code (chiffres) et le nom (lettres, chiffres)"));
    }
  };

  // Service de paiement marchand de l'opérateur (le premier qui a un champ « code marchand »)
  const serviceDe = (op) => services.find((s) => s.operateur === op && s.categorie === "merchant_payment")
    || services.find((s) => s.operateur === op);
  const lienQr = (m) => {
    const s = serviceDe(m.operateur);
    const q = new URLSearchParams({ operateur: m.operateur, code: m.code, ...(s ? { service: s.id } : {}) });
    return `${window.location.origin}/?${q.toString()}`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="no-print text-2xl font-bold">Marchands</h1>

      {/* Ajout d'un marchand (ou de son propre code marchand) */}
      <form onSubmit={ajouter} className="no-print card grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="op">Opérateur</label>
          <select id="op" className="input" value={form.operateur} onChange={(e) => setForm({ ...form, operateur: e.target.value })}>
            {operateurs.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="code">Code marchand</label>
          <input id="code" className="input font-mono" inputMode="numeric" pattern="[0-9]+" required value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.trim() })} />
        </div>
        <div>
          <label className="label" htmlFor="libelle">Nom</label>
          <input id="libelle" className="input" required minLength={2} placeholder="Ex. : Boutique Étoile" value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
        </div>
        <button type="submit" className="btn-primary">Ajouter</button>
      </form>

      {/* Recherche */}
      <div className="no-print flex gap-2">
        <select className="input max-w-[11rem]" value={filtre.operateur} onChange={(e) => setFiltre({ ...filtre, operateur: e.target.value })}>
          <option value="">Tous les opérateurs</option>
          {operateurs.map((o) => <option key={o}>{o}</option>)}
        </select>
        <input className="input" placeholder="Rechercher un nom ou un code" value={filtre.q}
          onChange={(e) => setFiltre({ ...filtre, q: e.target.value })} />
      </div>

      {marchands === null ? <Chargement /> : (
        <ul className="no-print space-y-2">
          {marchands.length === 0 && <li className="card text-gray-500">Aucun marchand trouvé.</li>}
          {marchands.map((m) => (
            <li key={`${m.operateur}-${m.code}`} className="card flex items-center gap-3 p-4">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurOperateur(m.operateur) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.libelle}</p>
                <p className="text-xs text-gray-500">{m.operateur} · <span className="font-mono">{m.code}</span></p>
              </div>
              <button type="button" className="btn-outline btn-sm" onClick={() => setAffiche(m)}>QR marchand</button>
            </li>
          ))}
        </ul>
      )}

      {/* Affiche imprimable du QR marchand */}
      <Modal ouvert={!!affiche} titre="QR marchand" onFermer={() => setAffiche(null)} imprimable>
        {affiche && (
          <div className="space-y-4 text-center">
            <div className="rounded-xl border-2 border-dashed border-gray-300 p-5">
              <p className="surtitre">Payez par {affiche.operateur}</p>
              <p className="mt-1 font-display text-2xl font-bold">{affiche.libelle}</p>
              <div className="my-4 flex justify-center"><QrCode valeur={lienQr(affiche)} taille={240} /></div>
              <p className="text-sm text-gray-600">Scannez avec votre téléphone, saisissez le montant, puis composez.</p>
              <p className="mt-2 font-mono text-sm">Code marchand : {affiche.code}</p>
            </div>
            {!serviceDe(affiche.operateur) && (
              <p className="text-sm text-amber-700">Aucun service de paiement marchand n'est actif pour cet opérateur.</p>
            )}
            <button type="button" className="btn-primary no-print w-full" onClick={() => window.print()}>🖨 Imprimer l'affiche</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
