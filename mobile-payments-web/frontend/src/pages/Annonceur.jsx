import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Chargement from "@/components/Chargement";
import LogoMode from "@/components/LogoMode";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, fcfa, messageErreur } from "@/lib/api";

// Espace annonceur (lot 60) : un ABONNÉ passe une annonce affichée en haut de l'écran Payer.
//  1. Il règle son annonce (format, dates, options) : le DEVIS se met à jour en direct. Le calcul est fait par SAWALI, jamais ici :
//     le montant payé ne peut donc pas être modifié depuis le navigateur ; seul SAWALI peut le corriger.
//  2. Il envoie son image (réduite automatiquement) ou sa vidéo ; le média est chiffré par SAWALI.
//  3. Il reçoit son devis, paie (PawaPay ou PI-SPI) et suit ses statistiques (vues, clics, taux de clic, jour par jour).
const ETATS = {
  devis: ["📝 Devis à payer", "bg-gray-100 text-gray-800"], paiement_en_cours: ["⏳ Paiement en cours", "bg-amber-50 text-amber-900"],
  pispi_attente: ["🏦 Virement attendu", "bg-amber-50 text-amber-900"], pispi_verification: ["🔎 Paiement en vérification", "bg-amber-50 text-amber-900"],
  active: ["✅ Annonce en ligne", "bg-green-50 text-green-800"], programmee: ["🗓️ Programmée", "bg-sky-50 text-sky-900"],
  suspendue: ["⛔ Suspendue", "bg-red-50 text-red-800"], terminee: ["🏁 Terminée", "bg-gray-100 text-gray-700"],
};
const jourISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const lireFichier = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
const octets = (dataUrl) => Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);

// Réduit une image pour passer sous la limite fixée par SAWALI (côté long 1 280 px, puis qualité décroissante). Renvoie une data URL JPEG.
async function imageSousLimite(fichier, limiteOctets) {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  for (const bord of [1280, 960, 720]) {
    const e = Math.min(1, bord / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * e); c.height = Math.round(bitmap.height * e);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.55]) { const url = c.toDataURL("image/jpeg", q); if (octets(url) <= limiteOctets) { bitmap.close?.(); return url; } }
  }
  bitmap.close?.();
  throw new Error("Image trop lourde même réduite : choisissez-en une plus simple.");
}

export default function Annonceur() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [tarifs, setTarifs] = useState(null);
  const [abonne, setAbonne] = useState(true);
  const [offre, setOffre] = useState([]);                    // formules « Annonceur » proposées (nom, prix, durée) tant que l'utilisateur n'en a pas
  const [campagnes, setCampagnes] = useState([]);
  const [form, setForm] = useState({ nom: "", annonceur: "", lien: "https://", format: "", debut: jourISO(1), fin: jourISO(7), options: [] });
  const [media, setMedia] = useState(null);                    // { url (data URL), nom, taille }
  const [devis, setDevis] = useState(null);
  const [erreurDevis, setErreurDevis] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [paiement, setPaiement] = useState(null);              // campagne à payer (fenêtre de choix)
  const [pispi, setPispi] = useState(null);                    // { campagne, reference, bloc, statut }
  const [refBanque, setRefBanque] = useState("");
  const [stats, setStats] = useState(null);
  const fichierRef = useRef(null);

  const charger = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([apiClient.get("/annonceur/tarifs"), apiClient.get("/annonceur/campagnes")]);
      setTarifs(t.data.tarifs); setAbonne(t.data.est_abonne); setOffre(t.data.formules || []); setCampagnes(c.data.campagnes);
      setForm((f) => (f.format ? f : { ...f, format: t.data.tarifs.formats[0]?.code || "" }));
    } catch (err) { toast.erreur(messageErreur(err, "Espace annonceur indisponible")); setTarifs(false); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  // Retour de la page de paiement : ?campagne=… → on relit l'état (SAWALI interroge PawaPay) quelques fois
  const retour = params.get("campagne");
  useEffect(() => {
    if (!retour) return undefined;
    let essais = 0;
    const id = setInterval(async () => {
      essais += 1;
      try {
        const { data } = await apiClient.post("/annonceur/etat", { campagne_id: retour });
        if (data.campagne.statut === "active" || data.campagne.statut === "devis" || essais >= 10) { clearInterval(id); charger(); if (data.campagne.statut === "active") toast.succes("Paiement reçu : votre annonce est publiée"); }
      } catch { if (essais >= 10) clearInterval(id); }
    }, 2000);
    return () => clearInterval(id);
  }, [retour, charger, toast]);

  const format = tarifs?.formats?.find((f) => f.code === form.format);
  // DEVIS EN DIRECT : à chaque changement (après une courte pause de saisie), SAWALI recalcule.
  useEffect(() => {
    if (!tarifs || !form.format || !abonne) return undefined;
    const id = setTimeout(async () => {
      try {
        const { data } = await apiClient.post("/annonceur/devis", { format: form.format, debut: form.debut, fin: form.fin, options: form.options });
        setDevis(data.devis); setErreurDevis("");
      } catch (err) { setDevis(null); setErreurDevis(messageErreur(err, "Devis indisponible")); }
    }, 350);
    return () => clearTimeout(id);
  }, [tarifs, abonne, form.format, form.debut, form.fin, form.options]);

  const champ = (cle) => (e) => setForm({ ...form, [cle]: e.target.value });
  const basculerOption = (code) => setForm({ ...form, options: form.options.includes(code) ? form.options.filter((o) => o !== code) : [...form.options, code] });
  // Le changement de format peut changer le type de média attendu (image ↔ vidéo) : on oublie l'ancien fichier
  const changerFormat = (e) => { setForm({ ...form, format: e.target.value }); setMedia(null); if (fichierRef.current) fichierRef.current.value = ""; };

  const choisirFichier = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (format.media === "image") {
        if (!f.type.startsWith("image/")) throw new Error("Choisissez une image (JPEG, PNG ou WebP).");
        const url = await imageSousLimite(f, tarifs.image_max_ko * 1000 * 0.95);
        setMedia({ url, nom: f.name, taille: octets(url) });
      } else {
        if (!/^video\/(mp4|webm)$/.test(f.type)) throw new Error("Choisissez une vidéo MP4 ou WebM.");
        if (f.size > tarifs.video_max_mo * 1_000_000) throw new Error(`Vidéo trop lourde : ${tarifs.video_max_mo} Mo au plus.`);
        setMedia({ url: await lireFichier(f), nom: f.name, taille: f.size });
      }
    } catch (err) { setMedia(null); e.target.value = ""; toast.erreur(err.message || "Fichier refusé"); }
  };

  const recevoirDevis = async (e) => {
    e.preventDefault();
    if (!media) { toast.erreur("Ajoutez d'abord votre image ou votre vidéo"); return; }
    setOccupe(true);
    try {
      const { data } = await apiClient.post("/annonceur/creer", { ...form, media: media.url }, { timeout: 120000 });
      toast.succes("Devis enregistré : vous pouvez payer");
      setMedia(null); if (fichierRef.current) fichierRef.current.value = "";
      setForm((f) => ({ ...f, nom: "" }));
      await charger();
      setPaiement(data.campagne);
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };

  const payer = async (c, mode) => {
    setOccupe(true);
    try {
      const { data } = await apiClient.post("/annonceur/payer", { campagne_id: c.id, mode });
      if (data.statut === "paye") { toast.succes("Annonce publiée"); setPaiement(null); charger(); return; }
      if (mode === "pawapay") { window.location.href = data.redirect_url; return; }      // page de paiement PawaPay (Orange / Moov / Telecel)
      setPaiement(null); setRefBanque(""); setPispi({ campagne: c, reference: data.reference, bloc: data.bloc, statut: data.statut });
    } catch (err) { toast.erreur(messageErreur(err, "Paiement indisponible")); } finally { setOccupe(false); }
  };
  const declarer = async (e) => {
    e.preventDefault();
    setOccupe(true);
    try {
      await apiClient.post("/annonceur/declarer", { campagne_id: pispi.campagne.id, reference_bancaire: refBanque.trim() });
      toast.succes("Paiement déclaré : SAWALI le vérifie"); setPispi(null); charger();
    } catch (err) { toast.erreur(messageErreur(err, "Déclaration impossible")); } finally { setOccupe(false); }
  };
  const voirStats = async (c) => {
    try { const { data } = await apiClient.post("/annonceur/stats", { campagne_id: c.id }); setStats(data); }
    catch (err) { toast.erreur(messageErreur(err, "Statistiques indisponibles")); }
  };
  const maxJour = useMemo(() => Math.max(1, ...(stats?.par_jour || []).map((j) => j.impressions)), [stats]);

  if (tarifs === null) return <Chargement />;
  if (tarifs === false) return <p className="text-gray-600">L'espace annonceur n'est pas disponible pour le moment.</p>;
  const nonPayee = (c) => ["devis", "paiement_en_cours", "pispi_attente", "pispi_verification"].includes(c.statut);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">📣 {abonne ? "Mon espace annonceur" : "Devenir annonceur"}</h1>
      {!abonne && (
        <div className="card space-y-3" role="status" data-testid="devenir-annonceur">
          <h2 className="text-lg font-semibold">Devenir annonceur</h2>
          <p className="text-gray-700">Affichez votre annonce (image ou vidéo) en haut de l'écran Payer, voyez votre devis en direct et suivez vos statistiques. Il suffit de prendre l'abonnement Annonceur.</p>
          {offre.length > 0 ? offre.map((f) => (
            <p key={f.id} className="rounded-lg bg-creme p-3"><b>{f.nom}</b> · <span className="text-lg font-bold text-primary">{fcfa(f.prix)}</span> pour {f.duree_jours} jours</p>
          )) : <p className="rounded-lg bg-amber-50 p-3 text-amber-900">L'abonnement Annonceur n'est pas encore proposé : revenez bientôt.</p>}
          {offre.length > 0 && <Link to="/abonnement" className="btn-primary w-full">Prendre l'abonnement Annonceur</Link>}
          <p className="text-sm text-gray-500">Une fois l'abonnement payé, vous revenez ici pour préparer votre annonce.</p>
        </div>
      )}
      {!tarifs.actif && <p className="rounded-xl bg-gray-100 p-3 text-gray-700">Les annonces ne sont pas ouvertes pour le moment.</p>}

      {abonne && tarifs.actif && (
        <form onSubmit={recevoirDevis} className="card space-y-4">
          <h2 className="text-lg font-semibold">Nouvelle annonce</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="a-nom">Nom de l'annonce</label><input id="a-nom" className="input" required minLength={2} maxLength={80} value={form.nom} onChange={champ("nom")} /></div>
            <div><label className="label" htmlFor="a-ann">Annonceur (nom affiché)</label><input id="a-ann" className="input" required minLength={2} maxLength={80} value={form.annonceur} onChange={champ("annonceur")} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="a-lien">Lien ouvert au clic (https://…)</label><input id="a-lien" className="input" type="url" required value={form.lien} onChange={champ("lien")} /></div>
            <div><label className="label" htmlFor="a-format">Format</label>
              <select id="a-format" className="input" value={form.format} onChange={changerFormat}>{tarifs.formats.map((f) => <option key={f.code} value={f.code}>{f.libelle} — {fcfa(f.prix_jour)} / jour</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label" htmlFor="a-debut">Début</label><input id="a-debut" className="input" type="date" required min={jourISO(0)} value={form.debut} onChange={champ("debut")} /></div>
              <div><label className="label" htmlFor="a-fin">Fin (incluse)</label><input id="a-fin" className="input" type="date" required min={form.debut} value={form.fin} onChange={champ("fin")} /></div>
            </div>
          </div>
          {tarifs.options.length > 0 && (
            <fieldset><legend className="label">Options</legend>
              {tarifs.options.map((o) => (
                <label key={o.code} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.options.includes(o.code)} onChange={() => basculerOption(o.code)} /> {o.libelle} (+{o.majoration_pct} %)</label>
              ))}
            </fieldset>
          )}
          <div>
            <label className="label" htmlFor="a-media">{format?.media === "video" ? `Votre vidéo MP4 ou WebM (${tarifs.video_max_mo} Mo au plus)` : `Votre image (réduite automatiquement à ${tarifs.image_max_ko} Ko au plus)`}</label>
            <input id="a-media" ref={fichierRef} className="input" type="file" accept={format?.media === "video" ? "video/mp4,video/webm" : "image/*"} onChange={choisirFichier} />
            {media && (
              <div className="mt-2 flex items-center gap-3 text-sm text-gray-600">
                {format.media === "image" ? <img src={media.url} alt="Aperçu de l'annonce" className="h-16 rounded border border-gray-200" /> : <video src={media.url} className="h-16 rounded border border-gray-200" muted />}
                <span>{media.nom} · {Math.round(media.taille / 1000)} Ko · 🔒 chiffré à l'envoi</span>
              </div>
            )}
          </div>

          {/* DEVIS EN DIRECT */}
          <div className="rounded-xl bg-creme p-4" aria-live="polite" data-testid="devis">
            <p className="mb-2 font-semibold">Votre devis</p>
            {erreurDevis && <p className="text-red-700">{erreurDevis}</p>}
            {devis && !erreurDevis && (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt>{devis.format_libelle} × {devis.jours} jour(s) ({fcfa(devis.prix_jour)})</dt><dd>{fcfa(devis.base)}</dd></div>
                {devis.options.map((o) => <div key={o.code} className="flex justify-between"><dt>{o.libelle}</dt><dd>+ {fcfa(o.montant)}</dd></div>)}
                {devis.remise > 0 && <div className="flex justify-between text-green-700"><dt>Remise de durée ({devis.remise_pct} %)</dt><dd>− {fcfa(devis.remise)}</dd></div>}
                <div className="flex justify-between border-t border-gray-300 pt-2 text-lg font-bold text-primary"><dt>Total</dt><dd>{fcfa(devis.total)}</dd></div>
              </dl>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={occupe || !devis || !media}>{occupe ? "Patientez…" : "Recevoir mon devis"}</button>
        </form>
      )}

      {campagnes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Mes annonces</h2>
          {campagnes.map((c) => {
            const [libelle, couleur] = ETATS[c.statut] || [c.statut, "bg-gray-100"];
            return (
              <article key={c.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{c.nom} <span className="font-normal text-gray-500">· {c.format}</span></p>
                  <span className={`badge ${couleur}`}>{libelle}</span>
                </div>
                <p className="text-sm text-gray-600">Du {c.debut} au {c.fin} ({c.jours} jour(s)) · <b>{fcfa(c.montant)}</b>{c.montant_corrige && " (montant ajusté par SAWALI)"}</p>
                <div className="boutons-distincts flex flex-wrap gap-2">
                  {nonPayee(c) && <button type="button" className="btn-primary btn-sm" onClick={() => setPaiement(c)}>Payer</button>}
                  {!nonPayee(c) && <button type="button" className="btn-outline btn-sm" onClick={() => voirStats(c)}>📊 Statistiques</button>}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <Modal ouvert={!!paiement} titre="Payer mon annonce" onFermer={() => setPaiement(null)}>
        {paiement && (
          <div className="space-y-3 text-sm">
            <p><b>{paiement.nom}</b> · <span className="text-lg font-bold text-primary">{fcfa(paiement.montant)}</span></p>
            <button type="button" className="btn-outline w-full justify-start gap-3" disabled={occupe} onClick={() => payer(paiement, "pawapay")}><LogoMode mode="pawapay" /> Payer par Mobile Money (PawaPay)</button>
            <button type="button" className="btn-outline w-full justify-start gap-3" disabled={occupe} onClick={() => payer(paiement, "pispi")}><LogoMode mode="pispi" /> Payer par PI-SPI</button>
          </div>
        )}
      </Modal>

      <Modal ouvert={!!pispi} titre="Payer par PI-SPI" onFermer={() => setPispi(null)}>
        {pispi && (
          <div className="space-y-3 text-sm">
            <p className="text-lg font-bold text-primary">{pispi.bloc.montant_texte}</p>
            <div className="flex justify-center"><img src={pispi.bloc.qr_data_url} alt="QR code PI-SPI" className="h-48 w-48 rounded-lg border border-gray-200 bg-white p-2" /></div>
            <p>Référence à indiquer : <b className="font-mono">{pispi.reference}</b></p>
            <p className="text-gray-600">{pispi.bloc.consigne}</p>
            <form onSubmit={declarer} className="space-y-2 border-t border-gray-100 pt-3">
              <label className="label" htmlFor="a-refb">Après le virement : référence bancaire de l'opération</label>
              <input id="a-refb" className="input" required minLength={4} maxLength={120} value={refBanque} onChange={(e) => setRefBanque(e.target.value)} autoComplete="off" />
              <button type="submit" className="btn-primary w-full" disabled={occupe || refBanque.trim().length < 4}>J'ai payé</button>
            </form>
          </div>
        )}
      </Modal>

      <Modal ouvert={!!stats} titre="Statistiques de l'annonce" onFermer={() => setStats(null)}>
        {stats && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{stats.campagne.nom} · {(ETATS[stats.campagne.statut] || [stats.campagne.statut])[0]}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-creme p-2"><p className="text-xl font-bold">{stats.impressions}</p><p className="text-gray-500">Vues</p></div>
              <div className="rounded-lg bg-creme p-2"><p className="text-xl font-bold">{stats.clics}</p><p className="text-gray-500">Clics</p></div>
              <div className="rounded-lg bg-creme p-2"><p className="text-xl font-bold">{stats.taux_clic} %</p><p className="text-gray-500">Taux de clic</p></div>
            </div>
            {stats.par_jour.length > 0 ? (
              <ul className="space-y-1">{stats.par_jour.map((j) => (
                <li key={j.date} className="flex items-center gap-2"><span className="w-24 shrink-0 tabular-nums text-gray-500">{j.date}</span>
                  <span className="h-3 rounded bg-primary" style={{ width: `${Math.max(2, (j.impressions / maxJour) * 100)}%` }} />
                  <span className="tabular-nums">{j.impressions} · {j.clics} clic(s)</span></li>
              ))}</ul>
            ) : <p className="text-gray-500">Pas encore de statistiques : elles apparaissent dès les premières vues.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
