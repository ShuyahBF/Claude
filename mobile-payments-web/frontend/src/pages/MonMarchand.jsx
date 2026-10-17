import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import LogoMode from "@/components/LogoMode";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, fcfa, messageErreur } from "@/lib/api";
import { reduireImage } from "@/lib/archiveMedia";

// Mon compte marchand (lot 58) : nom de la boutique, codes marchands, informations PI-SPI (banque, titulaire, adresse, QR fourni par la banque).
// ANTI-FRAUDE : l'administrateur VÉRIFIE le compte avant que les clients voient le QR ; toute modification remet le compte en vérification.
// Le marchand confirme lui-même la réception des paiements PI-SPI après contrôle de son relevé bancaire.
const STATUTS = {
  en_attente: ["⏳ En cours de vérification", "bg-amber-50 text-amber-900", "L'équipe vérifie votre compte et votre QR. Tant que ce n'est pas fait, vos clients ne peuvent pas payer par PI-SPI chez vous."],
  verifie: ["✅ Compte vérifié", "bg-green-50 text-green-800", "Vos clients peuvent payer par PI-SPI chez vous (le mode apparaît dans l'écran Payer quand ils saisissent votre code)."],
  suspendu: ["⛔ Compte suspendu", "bg-red-50 text-red-800", "Ce compte est suspendu : contactez le support."],
};
const VIDE = { nom: "", codes: [{ operateur: "", code: "" }], avecPispi: true, banque: "Ecobank", banqueAutre: "", titulaire: "", adresse_paiement: "", consigne: "" };

export default function MonMarchand() {
  const toast = useToast();
  const [d, setD] = useState(null);                  // {compte, banques, consigne_defaut}
  const [operateurs, setOperateurs] = useState([]);
  const [form, setForm] = useState(VIDE);
  const [paiements, setPaiements] = useState([]);
  const [occupe, setOccupe] = useState(false);

  const remplir = useCallback((compte, banques) => {
    if (!compte) { setForm(VIDE); return; }
    const p = compte.pispi;
    const connue = p && banques.includes(p.banque);
    setForm({ nom: compte.nom, codes: compte.codes.length ? compte.codes : [{ operateur: "", code: "" }], avecPispi: !!p,
      banque: p ? (connue ? p.banque : "Autre") : "Ecobank", banqueAutre: p && !connue ? p.banque : "", titulaire: p?.titulaire || "", adresse_paiement: p?.adresse_paiement || "", consigne: p?.consigne || "" });
  }, []);
  const charger = useCallback(async () => {
    try {
      const [{ data }, ops] = await Promise.all([apiClient.get("/mon-marchand"), apiClient.get("/operateurs")]);
      setD(data); setOperateurs(ops.data); remplir(data.compte, data.banques);
      if (data.compte) apiClient.get("/mon-marchand/paiements").then((r) => setPaiements(r.data.paiements)).catch(() => {});
    } catch (err) { toast.erreur(messageErreur(err, "Compte marchand indisponible")); setD({ compte: null, banques: [] }); }
  }, [remplir, toast]);
  useEffect(() => { charger(); }, [charger]);

  const maj = (cle, v) => setForm((f) => ({ ...f, [cle]: v }));
  const majCode = (i, cle, v) => setForm((f) => ({ ...f, codes: f.codes.map((c, j) => (j === i ? { ...c, [cle]: v } : c)) }));

  const enregistrer = async (e) => {
    e.preventDefault();
    setOccupe(true);
    try {
      const codes = form.codes.filter((c) => c.operateur && c.code).map((c) => ({ operateur: c.operateur, code: c.code.replace(/\D/g, "") }));
      const banque = form.banque === "Autre" ? form.banqueAutre.trim() || "Autre" : form.banque;
      const corps = { nom: form.nom.trim(), codes, pispi: form.avecPispi ? { banque, titulaire: form.titulaire.trim(), adresse_paiement: form.adresse_paiement.trim(), consigne: form.consigne.trim() } : null };
      const { data } = await apiClient.put("/mon-marchand", corps);
      setD((x) => ({ ...x, compte: data.compte }));
      toast.succes("Compte enregistré : il sera vérifié avant que vos clients puissent payer par PI-SPI");
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };

  const envoyerQr = async (fichier) => {
    if (!fichier) return;
    setOccupe(true);
    try {
      const prepare = fichier.size > 450_000 ? await reduireImage(fichier, 1400, 0.92) : fichier;       // QR gardé net, sous 500 Ko
      const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(prepare); });
      const { data } = await apiClient.post("/mon-marchand/qr", { image: url });
      setD((x) => ({ ...x, compte: data.compte }));
      toast.succes("QR enregistré : il sera vérifié");
    } catch (err) { toast.erreur(messageErreur(err, "Image refusée (PNG ou JPEG, 500 Ko au plus)")); } finally { setOccupe(false); }
  };

  const decider = async (p, action) => {
    if (action === "confirmer" && !window.confirm(`Confirmer que vous avez reçu ${fcfa(p.montant)} (référence bancaire ${p.reference_bancaire}) sur votre compte ?`)) return;
    try { await apiClient.post(`/mon-marchand/paiements/${p.id}/${action}`); toast.succes(action === "confirmer" ? "Paiement confirmé" : "Paiement refusé"); charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };

  if (!d) return <Chargement />;
  const compte = d.compte;
  const [titreStatut, styleStatut, texteStatut] = STATUTS[compte?.statut] || [];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><LogoMode mode="pispi" taille={34} /> Mon compte marchand</h1>
      <p className="text-sm text-gray-600">Recevez des paiements <b>PI-SPI</b> de vos clients avec le QR de votre banque. Enregistrez vos codes marchands : le mode PI-SPI s'affiche chez vos clients quand ils les saisissent.</p>
      {compte && <div className={`rounded-lg p-3 text-sm ${styleStatut}`} role="status"><p className="font-semibold">{titreStatut}</p><p>{texteStatut}</p></div>}

      <form onSubmit={enregistrer} className="card space-y-3 p-4">
        <div><label className="label" htmlFor="mm-nom">Nom de la boutique</label>
          <input id="mm-nom" className="input" required minLength={2} maxLength={60} value={form.nom} onChange={(e) => maj("nom", e.target.value)} placeholder="Ex. Boutique Salif" /></div>
        <div className="space-y-2">
          <p className="label">Mes codes marchands</p>
          {form.codes.map((c, i) => (
            <div key={i} className="flex gap-2">
              <select className="input w-auto shrink-0" value={c.operateur} onChange={(e) => majCode(i, "operateur", e.target.value)} aria-label="Opérateur">
                <option value="">Opérateur…</option>{operateurs.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input className="input min-w-0 flex-1 font-mono" inputMode="numeric" pattern="[0-9]*" maxLength={20} placeholder="Code marchand" value={c.code} onChange={(e) => majCode(i, "code", e.target.value)} aria-label="Code marchand" />
              {form.codes.length > 1 && <button type="button" className="btn-outline btn-sm" aria-label="Retirer ce code" onClick={() => maj("codes", form.codes.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
          {form.codes.length < 5 && <button type="button" className="btn-outline btn-sm" onClick={() => maj("codes", [...form.codes, { operateur: "", code: "" }])}>+ Autre code</button>}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.avecPispi} onChange={(e) => maj("avecPispi", e.target.checked)} /> Accepter les paiements PI-SPI</label>
        {form.avecPispi && (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label" htmlFor="mm-banque">Banque</label>
                <select id="mm-banque" className="input" value={form.banque} onChange={(e) => maj("banque", e.target.value)}>{d.banques.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
              <div><label className="label" htmlFor="mm-tit">Titulaire du compte</label>
                <input id="mm-tit" className="input" required minLength={2} maxLength={80} value={form.titulaire} onChange={(e) => maj("titulaire", e.target.value)} /></div>
            </div>
            {form.banque === "Autre" && <input className="input" required maxLength={60} placeholder="Nom de la banque" value={form.banqueAutre} onChange={(e) => maj("banqueAutre", e.target.value)} />}
            <div><label className="label" htmlFor="mm-adr">Adresse de paiement PI-SPI</label>
              <input id="mm-adr" className="input" required minLength={3} maxLength={120} value={form.adresse_paiement} onChange={(e) => maj("adresse_paiement", e.target.value)} placeholder="Telle que fournie par votre banque" /></div>
            <div><label className="label" htmlFor="mm-cons">Consigne pour vos clients <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="mm-cons" className="input" maxLength={200} value={form.consigne} onChange={(e) => maj("consigne", e.target.value)} placeholder={d.consigne_defaut} /></div>
          </div>
        )}
        <button type="submit" className="btn-primary w-full" disabled={occupe}>{occupe ? "Patientez…" : "Enregistrer"}</button>
        <p className="text-xs text-gray-500">Toute modification (nom, codes, informations ou QR) remet le compte en vérification : c'est ce qui protège vos clients contre les détournements.</p>
      </form>

      {compte?.pispi && (
        <section className="card space-y-2 p-4">
          <h2 className="text-lg font-bold">QR PI-SPI de ma banque</h2>
          {compte.pispi.qr_data_url ? <img src={compte.pispi.qr_data_url} alt="QR PI-SPI enregistré" className="h-44 w-44 rounded-lg border border-gray-200 bg-white p-2" /> : <p className="text-sm text-amber-800">Aucun QR enregistré : ajoutez l'image fournie par votre banque (capture ou photo nette).</p>}
          <label className="btn-outline inline-flex cursor-pointer">📁 {compte.pispi.qr_present ? "Remplacer le QR" : "Ajouter le QR"}
            <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={occupe} onChange={(e) => { envoyerQr(e.target.files?.[0]); e.target.value = ""; }} /></label>
        </section>
      )}

      {compte && (
        <section className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Paiements PI-SPI reçus</h2><button type="button" className="btn-outline btn-sm" onClick={charger}>↻ Actualiser</button></div>
          {paiements.length === 0 && <p className="card text-gray-500">Aucun paiement PI-SPI pour le moment.</p>}
          <ul className="space-y-2">
            {paiements.map((p) => (
              <li key={p.id} className="card space-y-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold">{p.payeur} · {fcfa(p.montant)}</p><p className="text-xs text-gray-500">{dateHeure(p.declare_le || p.cree_le)} · réf. {p.reference}</p></div>
                  <span className={`badge ${p.statut === "effectue" ? "bg-green-100 text-green-800" : p.statut === "refuse" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-900"}`}>{p.statut === "effectue" ? "Reçu" : p.statut === "refuse" ? "Refusé" : "À confirmer"}</span>
                </div>
                <p className="text-gray-600">Référence bancaire déclarée : <span className="font-mono font-semibold">{p.reference_bancaire}</span></p>
                {p.statut === "declare" && (
                  <div className="flex gap-2 pt-1">
                    <button type="button" className="btn-primary btn-sm flex-1" onClick={() => decider(p, "confirmer")}>✓ J'ai reçu l'argent</button>
                    <button type="button" className="btn-outline btn-sm flex-1" onClick={() => decider(p, "refuser")}>Refuser</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">Vérifiez toujours votre relevé bancaire avant de confirmer : une confirmation vaut reçu pour votre client.</p>
        </section>
      )}
    </div>
  );
}
