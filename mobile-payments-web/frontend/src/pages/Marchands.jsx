import { useEffect, useState } from "react";
import BoutonOcr from "@/components/BoutonOcr";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import QrCode from "@/components/QrCode";
import { useToast } from "@/components/Toast";
import SelecteurOperateur from "@/components/SelecteurOperateur";   // lot 89 : listes d'opérateurs avec logos
import { apiClient, couleurOperateur, messageErreur } from "@/lib/api";
import { analyserQr } from "@/lib/qrOperateurs";

// Annuaire des codes marchands + création d'un « QR marchand » imprimable.
// Le QR contient l'adresse du site avec l'opérateur, le service et le code :
// le client le scanne avec son téléphone, choisit le montant, puis compose.
// Pendant que l'affiche est ouverte, l'impression est permise (classe lue par index.css et ProtectionCaptures)
function AutoriserImpression({ actif }) {
  useEffect(() => {
    if (!actif) return undefined;
    document.body.classList.add("impression-autorisee");
    return () => document.body.classList.remove("impression-autorisee");
  }, [actif]);
  return null;
}

export default function Marchands() {
  const toast = useToast();
  const [operateurs, setOperateurs] = useState([]);
  const [services, setServices] = useState([]); // services « code marchand » de tous les opérateurs
  const [marchands, setMarchands] = useState(null);
  const [filtre, setFiltre] = useState({ operateur: "", q: "" });
  const [form, setForm] = useState({ operateur: "", code: "", libelle: "" });
  const [affiche, setAffiche] = useState(null); // marchand dont on affiche le QR
  const [lecture, setLecture] = useState(null);  // plaque photographiée : { identifiantQr, incertains, texte } (lot 39)

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

  // Photo d'une plaque (lot 39) : le QR est décodé dans le navigateur, le texte est lu par l'IA (abonnés) ;
  // le formulaire est PRÉ-REMPLI, jamais enregistré tout seul : l'utilisateur vérifie, surtout le code écrit à la main.
  const surPlaque = async (d, fichier) => {
    let identifiantQr = null;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const texte = await new Html5Qrcode("zone-qr-cachee").scanFile(fichier, false);
      const qr = analyserQr(texte);
      if (qr?.type === "operateur") { identifiantQr = qr.identifiant; d = { ...d, operateur: d.operateur || qr.operateur }; }
    } catch { /* pas de QR lisible sur la photo : sans importance */ }
    setForm((f) => ({ operateur: operateurs.includes(d.operateur) ? d.operateur : f.operateur, code: d.code || "", libelle: d.nom || "" }));
    setLecture({ identifiantQr: identifiantQr || null, incertains: d.incertains || [], texte: d.texte, aucun: !d.code && !d.nom });
    toast.succes(d.code ? "Plaque lue : vérifiez le code avant d'enregistrer" : "Plaque lue : complétez ce qui manque");
  };

  const ajouter = async (e) => {
    e.preventDefault();
    try {
      const { data } = await apiClient.post("/marchands", form);
      // QR de plaque lu sur la photo : on mémorise « identifiant du QR → code marchand » (lot 38)
      if (lecture?.identifiantQr) {
        apiClient.post("/qr-operateurs", { operateur: form.operateur, identifiant: lecture.identifiantQr, code: form.code, libelle: form.libelle }).catch(() => {});
      }
      setLecture(null);
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
      <div id="zone-qr-cachee" className="hidden" />

      {/* Ajout d'un marchand (ou de son propre code marchand) */}
      <form onSubmit={ajouter} className="no-print card grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="op">Opérateur</label>
          <SelecteurOperateur id="op" valeur={form.operateur} onChange={(v) => setForm({ ...form, operateur: v })} options={operateurs} />
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
        {/* Photo de la plaque : QR + texte imprimé ou écrit à la main (réservé aux abonnés) */}
        <div className="sm:col-span-4">
          <BoutonOcr type="plaque_marchand" libelle="📷 Lire une plaque (photo : QR + texte)" onResultat={surPlaque} />
          {lecture && (
            <p className="mt-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-900" role="status">
              {lecture.aucun ? "Rien de lisible : refaites la photo de face, bien nette." : "Lecture automatique : comparez avec la plaque avant d'enregistrer."}
              {lecture.incertains.length > 0 && ` Champs incertains : ${lecture.incertains.join(", ")}.`}
              {lecture.identifiantQr && " QR de plaque reconnu : le lien sera mémorisé."}
            </p>
          )}
        </div>
      </form>

      {/* Recherche */}
      <div className="no-print flex gap-2">
        <SelecteurOperateur className="w-56 shrink-0" ariaLabel="Opérateur" valeur={filtre.operateur} onChange={(v) => setFiltre({ ...filtre, operateur: v })} options={operateurs} vide="Tous les opérateurs" />
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

      {/* Affiche imprimable du QR marchand (seule page autorisée à l'impression : le reste du site est blanc à l'impression) */}
      <AutoriserImpression actif={!!affiche} />
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
