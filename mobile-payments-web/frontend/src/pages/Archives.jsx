import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import { chiffrer, chiffrerJson, cleDeverrouillee, creerPhrase, dechiffrer, dechiffrerJson, depuisBase64, deverrouiller, verrouiller, versBase64 } from "@/lib/archiveCrypto";
import { ajouterCategorie, ajouterLocal, categoriesPerso, demanderStockageDurable, listerLocal, lireContenuLocal, modifierLocal, nouvelId, supprimerLocal } from "@/lib/archiveLocal";
import { anneeDe, aujourdhui, captureEcranDisponible, capturerEcran, reduireImage, taille, telecharger } from "@/lib/archiveMedia";

// ============================================================================
// Archives (lot 56) : reçus, factures, pièces d'identité, pages de passeport, TVM, carte grise… et captures d'écran.
//   - SANS abonnement : tout est gardé SUR L'APPAREIL (mémoire privée du navigateur) ; rien n'est envoyé à Paiement Mobile.
//   - AVEC l'abonnement « Archives en ligne chiffrées » : stockage en ligne PROFESSIONNEL et CHIFFRÉ. Le chiffrement se fait ici, dans le
//     navigateur, avec une phrase secrète que personne d'autre ne connaît : le serveur ne garde que des octets illisibles.
//   - Étiquettes (tags) : l'année du document est ajoutée automatiquement ; l'utilisateur ajoute les siennes et ses propres catégories.
//   - Recherche : texte libre (titre, catégorie, étiquettes, année) + filtres catégorie, année et étiquette.
// ============================================================================
const CATEGORIES_BASE = ["Reçu", "Facture", "Carte d'identité", "Passeport (pages)", "TVM (taxe véhicule à moteur)", "Carte grise", "Permis de conduire",
  "Assurance", "Acte (naissance, mariage…)", "Diplôme / attestation", "Ordonnance", "Contrat", "Capture d'écran", "Autre"];
const NOUVELLE = "__nouvelle";
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const VIDE = { titre: "", categorie: CATEGORIES_BASE[0], nouvelleCategorie: "", date: aujourdhui(), tags: [], saisieTag: "", stockage: "local" };

export default function Archives() {
  const toast = useToast();
  const [chargement, setChargement] = useState(true);
  const [locaux, setLocaux] = useState([]);
  const [cloud, setCloud] = useState(null);                 // documents en ligne déchiffrés (null = verrouillé ou indisponible)
  const [etat, setEtat] = useState(null);                   // {abonne, sel, verif, quota_octets, utilise_octets, nombre, fichier_max_octets} | false = service indisponible
  const [deverrouille, setDeverrouille] = useState(cleDeverrouillee());
  const [perso, setPerso] = useState([]);                   // catégories ajoutées par l'utilisateur
  const [recherche, setRecherche] = useState("");
  const [filtres, setFiltres] = useState({ categorie: "", annee: "", tag: "" });
  const [phrase, setPhrase] = useState({ a: "", b: "" });
  const [occupe, setOccupe] = useState(false);
  const [ajout, setAjout] = useState(null);                 // formulaire d'ajout / de modification (null = fermé)
  const [fichier, setFichier] = useState(null);             // fichier à archiver (photo, PDF, capture)
  const [apercu, setApercu] = useState("");
  const [vue, setVue] = useState(null);                     // document ouvert {titre, mime, url}
  const photo = useRef(null);
  const choisir = useRef(null);

  // ---- Chargements -------------------------------------------------------------------------
  const chargerLocal = useCallback(async () => {
    try { setLocaux(await listerLocal()); setPerso(await categoriesPerso()); } catch { toast.erreur("Les archives de cet appareil sont illisibles (navigation privée ?)"); }
  }, [toast]);
  const chargerCloud = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/archives");
      const lignes = await Promise.all(data.archives.map(async (a) => {
        try { return { ...(await dechiffrerJson(a.meta)), id: a.id, source: "cloud", taille: a.taille, cree_le: a.cree_le, metaChiffree: a.meta }; } catch { return null; }
      }));
      setCloud(lignes.filter(Boolean));
    } catch (err) { toast.erreur(messageErreur(err, "Archives en ligne indisponibles")); setCloud([]); }
  }, [toast]);
  const chargerEtat = useCallback(async () => {
    try { const { data } = await apiClient.get("/archives/etat"); setEtat(data); } catch { setEtat(false); }
  }, []);
  useEffect(() => {
    demanderStockageDurable();
    Promise.all([chargerLocal(), chargerEtat()]).finally(() => setChargement(false));
  }, [chargerLocal, chargerEtat]);
  useEffect(() => { if (deverrouille) chargerCloud(); }, [deverrouille, chargerCloud]);
  useEffect(() => () => { if (vue?.url) URL.revokeObjectURL(vue.url); }, [vue]);

  // ---- Liste affichée : appareil + en ligne, recherche et filtres ------------------------------
  const tous = useMemo(() => [...locaux.map((d) => ({ ...d, source: "local" })), ...(cloud || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))), [locaux, cloud]);
  const categories = useMemo(() => [...new Set([...CATEGORIES_BASE, ...perso, ...tous.map((d) => d.categorie)])], [perso, tous]);
  const annees = useMemo(() => [...new Set(tous.map((d) => d.annee))].sort().reverse(), [tous]);
  const etiquettes = useMemo(() => {
    const n = {};
    tous.forEach((d) => (d.tags || []).forEach((t) => { n[t] = (n[t] || 0) + 1; }));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [tous]);
  const affiches = useMemo(() => {
    const mots = norm(recherche).split(/\s+/).filter(Boolean);
    return tous.filter((d) => (!filtres.categorie || d.categorie === filtres.categorie) && (!filtres.annee || d.annee === filtres.annee)
      && (!filtres.tag || (d.tags || []).includes(filtres.tag))
      && mots.every((m) => norm([d.titre, d.categorie, d.annee, d.nom_fichier, ...(d.tags || [])].join(" ")).includes(m)));
  }, [tous, recherche, filtres]);

  // ---- Phrase secrète (stockage en ligne) -------------------------------------------------------
  const activerEnLigne = async (e) => {
    e.preventDefault();
    if (phrase.a.length < 8) { toast.erreur("La phrase secrète doit compter au moins 8 caractères"); return; }
    if (phrase.a !== phrase.b) { toast.erreur("Les deux saisies ne sont pas identiques"); return; }
    setOccupe(true);
    try {
      const { sel, verif } = await creerPhrase(phrase.a);
      await apiClient.post("/archives/cle", { sel, verif });
      setPhrase({ a: "", b: "" });
      await chargerEtat();
      setCloud([]); setDeverrouille(true);
      toast.succes("Stockage en ligne chiffré activé");
    } catch (err) { verrouiller(); toast.erreur(messageErreur(err, "Activation impossible")); } finally { setOccupe(false); }
  };
  const ouvrirCoffre = async (e) => {
    e.preventDefault();
    setOccupe(true);
    try {
      if (await deverrouiller(phrase.a, etat.sel, etat.verif)) { setPhrase({ a: "", b: "" }); setDeverrouille(true); }
      else toast.erreur("Phrase secrète incorrecte");
    } finally { setOccupe(false); }
  };
  const fermerCoffre = () => { verrouiller(); setDeverrouille(false); setCloud(null); };

  // ---- Ajout / modification ----------------------------------------------------------------------
  const prendreFichier = async (f) => {
    if (!f) return;
    const prepare = await reduireImage(f);
    if (apercu) URL.revokeObjectURL(apercu);
    setFichier(prepare);
    setApercu(prepare.type.startsWith("image/") ? URL.createObjectURL(prepare) : "");
    setAjout((a) => (a && !a.titre ? { ...a, titre: f.name.replace(/\.\w+$/, ""), categorie: f.name.startsWith("capture-") ? "Capture d'écran" : a.categorie } : a));
  };
  const ouvrirAjout = () => { setFichier(null); setApercu(""); setAjout({ ...VIDE, date: aujourdhui(), tags: [] }); };
  const fermerAjout = () => { if (apercu) URL.revokeObjectURL(apercu); setApercu(""); setFichier(null); setAjout(null); };
  const capturer = async () => {
    const f = await capturerEcran();
    if (f) prendreFichier(f); else toast.info("Capture annulée");
  };
  const ajouterTag = () => {
    const t = ajout.saisieTag.trim().replace(/,$/, "").slice(0, 30);
    if (!t) return;
    setAjout((a) => ({ ...a, tags: a.tags.includes(t) || /^\d{4}$/.test(t) ? a.tags : [...a.tags, t].slice(0, 12), saisieTag: "" }));
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    const edition = !!ajout.id;
    if (!edition && !fichier) { toast.erreur("Choisissez d'abord un document, une photo ou une capture"); return; }
    setOccupe(true);
    try {
      let categorie = ajout.categorie;
      if (categorie === NOUVELLE) {
        categorie = ajout.nouvelleCategorie.trim().slice(0, 40);
        if (!categorie) { toast.erreur("Saisissez le nom de la nouvelle catégorie"); return; }
        await ajouterCategorie(categorie);
      }
      const tags = ajout.saisieTag.trim() ? [...new Set([...ajout.tags, ajout.saisieTag.trim()])].slice(0, 12) : ajout.tags;
      const base = { titre: ajout.titre.trim() || "Sans titre", categorie, tags, date: ajout.date || aujourdhui(), annee: anneeDe(ajout.date) };
      if (edition) {
        if (ajout.source === "cloud") {
          const meta = { ...base, id: ajout.id, mime: ajout.mime, taille: ajout.tailleFichier, nom_fichier: ajout.nom_fichier, cree_le: ajout.cree_le_doc };
          await apiClient.put(`/archives/${ajout.id}`, { meta: await chiffrerJson(meta) });
          await chargerCloud();
        } else {
          await modifierLocal({ ...ajout.original, ...base });
          await chargerLocal();
        }
      } else if (ajout.stockage === "cloud") {
        const meta = { ...base, id: nouvelId(), mime: fichier.type || "application/octet-stream", taille: fichier.size, nom_fichier: fichier.name, cree_le: new Date().toISOString() };
        const contenu = versBase64(await chiffrer(new Uint8Array(await fichier.arrayBuffer())));
        await apiClient.post("/archives", { meta: await chiffrerJson(meta), contenu });
        await Promise.all([chargerCloud(), chargerEtat()]);
      } else {
        await ajouterLocal({ ...base, id: nouvelId(), mime: fichier.type || "application/octet-stream", taille: fichier.size, nom_fichier: fichier.name, cree_le: new Date().toISOString() }, fichier);
        await chargerLocal();
      }
      toast.succes(edition ? "Modifié" : ajout.stockage === "cloud" ? "Archivé en ligne (chiffré)" : "Archivé sur cet appareil");
      fermerAjout();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.erreur(typeof d === "object" && d?.message ? d.message : messageErreur(err, "Archivage impossible"));
    } finally { setOccupe(false); }
  };

  // ---- Actions sur un document -------------------------------------------------------------------
  const lireBlob = async (d) => {
    if (d.source === "local") return lireContenuLocal(d.id);
    const { data } = await apiClient.get(`/archives/${d.id}`);
    return new Blob([await dechiffrer(depuisBase64(data.contenu))], { type: d.mime || "application/octet-stream" });
  };
  const ouvrir = async (d) => {
    setOccupe(true);
    try {
      const blob = await lireBlob(d);
      if (!blob) { toast.erreur("Document introuvable sur cet appareil"); return; }
      setVue({ titre: d.titre, mime: d.mime, nom: d.nom_fichier, blob, url: URL.createObjectURL(blob) });
    } catch (err) { toast.erreur(messageErreur(err, "Ouverture impossible")); } finally { setOccupe(false); }
  };
  const telechargerDoc = async (d) => {
    try { const blob = await lireBlob(d); if (blob) telecharger(blob, d.nom_fichier || `${d.titre}.${(d.mime || "").split("/")[1] || "bin"}`); }
    catch (err) { toast.erreur(messageErreur(err, "Téléchargement impossible")); }
  };
  const supprimer = async (d) => {
    if (!window.confirm(`Supprimer « ${d.titre} » ${d.source === "cloud" ? "des archives en ligne" : "de cet appareil"} ? Cette action est définitive.`)) return;
    try {
      if (d.source === "cloud") { await apiClient.delete(`/archives/${d.id}`); await Promise.all([chargerCloud(), chargerEtat()]); }
      else { await supprimerLocal(d.id); await chargerLocal(); }
      toast.succes("Supprimé");
    } catch (err) { toast.erreur(messageErreur(err, "Suppression impossible")); }
  };
  const modifier = (d) => setAjout({ ...VIDE, id: d.id, source: d.source, titre: d.titre, categorie: d.categorie, date: d.date, tags: d.tags || [], original: d,
    mime: d.mime, tailleFichier: d.taille, nom_fichier: d.nom_fichier, cree_le_doc: d.cree_le });
  // Déplacer un document de l'appareil vers le stockage en ligne chiffré
  const envoyerEnLigne = async (d) => {
    setOccupe(true);
    try {
      const blob = await lireContenuLocal(d.id);
      const { source, ...meta } = d;                                                // eslint-disable-line no-unused-vars
      const contenu = versBase64(await chiffrer(new Uint8Array(await blob.arrayBuffer())));
      await apiClient.post("/archives", { meta: await chiffrerJson(meta), contenu });
      await supprimerLocal(d.id);
      await Promise.all([chargerLocal(), chargerCloud(), chargerEtat()]);
      toast.succes("Envoyé en ligne (chiffré) ; la copie de l'appareil est retirée");
    } catch (err) {
      const det = err?.response?.data?.detail;
      toast.erreur(typeof det === "object" && det?.message ? det.message : messageErreur(err, "Envoi impossible"));
    } finally { setOccupe(false); }
  };
  // Copier un document en ligne sur l'appareil (il reste aussi en ligne)
  const copierSurAppareil = async (d) => {
    setOccupe(true);
    try {
      const blob = await lireBlob(d);
      const { source, metaChiffree, ...meta } = d;                                  // eslint-disable-line no-unused-vars
      await ajouterLocal({ ...meta, id: nouvelId() }, blob);
      await chargerLocal();
      toast.succes("Copié sur cet appareil");
    } catch (err) { toast.erreur(messageErreur(err, "Copie impossible")); } finally { setOccupe(false); }
  };

  if (chargement) return <Chargement />;
  const abonne = !!etat?.abonne;
  const enLigneConfigure = !!etat?.sel;
  const nbEnLigne = etat?.nombre || 0;
  const peutEnLigne = abonne && deverrouille;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">🗄️ Archives</h1>
        <button type="button" className="btn-primary" onClick={ouvrirAjout}>+ Archiver</button>
      </div>
      <p className="text-sm text-gray-600">Reçus, factures, carte d'identité, pages de passeport, TVM, carte grise… Ajoutez une photo, un fichier ou une capture d'écran,
        classez-les par catégorie et étiquettes, retrouvez-les par la recherche.</p>

      {/* Où sont gardés les documents */}
      <section className="card space-y-2 p-4" data-testid="stockage">
        <p className="font-semibold">📱 Sur cet appareil <span className="badge ml-1 bg-green-100 text-green-800">gratuit</span></p>
        <p className="text-sm text-gray-600">Vos documents restent dans la mémoire privée de ce navigateur : rien n'est envoyé. Si vous effacez les données du navigateur ou changez de téléphone, ils sont perdus :
          téléchargez-en une copie (bouton ⬇) pour les documents essentiels.</p>
        <hr className="border-gray-100" />
        <p className="font-semibold">☁️ En ligne, chiffré <span className={`badge ml-1 ${abonne ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{abonne ? "abonnement actif" : "abonnement"}</span></p>
        {etat === false && <p className="text-sm text-amber-800">Le service en ligne est momentanément indisponible. Vos archives de l'appareil restent accessibles.</p>}
        {etat && !enLigneConfigure && !abonne && (
          <p className="text-sm text-gray-600">Stockage professionnel dans le cloud : vos documents sont chiffrés sur votre téléphone avant l'envoi, avec une phrase secrète que vous seul connaissez.
            Réservé aux abonnés. <Link to="/abonnement" className="font-semibold text-primary underline">Voir les formules</Link></p>
        )}
        {etat && !enLigneConfigure && abonne && (
          <form onSubmit={activerEnLigne} className="space-y-2">
            <p className="text-sm text-gray-600">Choisissez la <b>phrase secrète</b> de vos archives (8 caractères au moins). Elle chiffre vos documents ici, sur votre téléphone. <b>Personne ne peut la retrouver, ni auRor ni SAWALI : si vous
              l'oubliez, vos documents en ligne sont perdus.</b> Notez-la en lieu sûr.</p>
            <input className="input" type="password" autoComplete="new-password" placeholder="Phrase secrète" value={phrase.a} onChange={(e) => setPhrase({ ...phrase, a: e.target.value })} />
            <input className="input" type="password" autoComplete="new-password" placeholder="Répétez la phrase secrète" value={phrase.b} onChange={(e) => setPhrase({ ...phrase, b: e.target.value })} />
            <button type="submit" className="btn-primary w-full" disabled={occupe}>{occupe ? "Patientez…" : "Activer le stockage en ligne chiffré"}</button>
          </form>
        )}
        {etat && enLigneConfigure && !deverrouille && (
          <form onSubmit={ouvrirCoffre} className="space-y-2">
            <p className="text-sm text-gray-600">{nbEnLigne} document{nbEnLigne > 1 ? "s" : ""} en ligne, verrouillé{nbEnLigne > 1 ? "s" : ""}. Saisissez votre phrase secrète pour les voir.{!abonne && " (Abonnement terminé : vous pouvez lire et supprimer, plus ajouter.)"}</p>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" type="password" autoComplete="current-password" placeholder="Phrase secrète" value={phrase.a} onChange={(e) => setPhrase({ ...phrase, a: e.target.value })} />
              <button type="submit" className="btn-primary" disabled={occupe || !phrase.a}>{occupe ? "…" : "🔓 Ouvrir"}</button>
            </div>
          </form>
        )}
        {etat && enLigneConfigure && deverrouille && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <span>🔓 Ouvert · {taille(etat.utilise_octets)} utilisés sur {taille(etat.quota_octets)}{!abonne && " · abonnement terminé : lecture et suppression seulement"}</span>
            <button type="button" className="btn-outline btn-sm" onClick={fermerCoffre}>🔒 Verrouiller</button>
          </div>
        )}
      </section>

      {/* Recherche et filtres */}
      <section className="space-y-2">
        <input className="input" type="search" placeholder="Rechercher : titre, catégorie, étiquette, année…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher dans les archives" />
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={filtres.categorie} onChange={(e) => setFiltres({ ...filtres, categorie: e.target.value })} aria-label="Catégorie">
            <option value="">Toutes les catégories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filtres.annee} onChange={(e) => setFiltres({ ...filtres, annee: e.target.value })} aria-label="Année">
            <option value="">Toutes les années</option>{annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {etiquettes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {etiquettes.map((t) => (
              <button key={t} type="button" onClick={() => setFiltres({ ...filtres, tag: filtres.tag === t ? "" : t })}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${filtres.tag === t ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-gray-700"}`}>#{t}</button>
            ))}
          </div>
        )}
      </section>

      {/* Documents */}
      {affiches.length === 0 ? (
        <p className="card text-center text-gray-500">{tous.length === 0 ? "Aucun document archivé pour le moment." : "Aucun document ne correspond à la recherche."}</p>
      ) : (
        <ul className="space-y-2">
          {affiches.map((d) => (
            <li key={`${d.source}-${d.id}`} className="card space-y-2 p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-2xl ring-1 ring-gray-200" aria-hidden="true">{(d.mime || "").startsWith("image/") ? "🖼️" : "📄"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.titre}</p>
                  <p className="text-xs text-gray-500">{d.categorie} · {d.date.split("-").reverse().join("/")} · {taille(d.taille)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700" title="Étiquette ajoutée automatiquement">#{d.annee}</span>
                    {(d.tags || []).map((t) => <span key={t} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800">#{t}</span>)}
                  </div>
                </div>
                <span className="shrink-0 text-lg" title={d.source === "cloud" ? "En ligne, chiffré" : "Sur cet appareil"}>{d.source === "cloud" ? "☁️" : "📱"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn-outline btn-sm" disabled={occupe} onClick={() => ouvrir(d)}>👁 Ouvrir</button>
                <button type="button" className="btn-outline btn-sm" onClick={() => telechargerDoc(d)}>⬇ Télécharger</button>
                <button type="button" className="btn-outline btn-sm" onClick={() => modifier(d)}>✏️ Modifier</button>
                {d.source === "local" && peutEnLigne && <button type="button" className="btn-outline btn-sm" disabled={occupe} onClick={() => envoyerEnLigne(d)}>☁️ Envoyer en ligne</button>}
                {d.source === "cloud" && <button type="button" className="btn-outline btn-sm" disabled={occupe} onClick={() => copierSurAppareil(d)}>📱 Copier ici</button>}
                <button type="button" className="btn-outline btn-sm text-red-700" onClick={() => supprimer(d)}>🗑</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Ajout / modification */}
      <Modal ouvert={!!ajout} titre={ajout?.id ? "Modifier le document" : "Archiver un document"} onFermer={fermerAjout} large>
        {ajout && (
          <form onSubmit={enregistrer} className="space-y-3"
            onPaste={(e) => { const f = !ajout.id && e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); prendreFichier(f); } }}>
            {!ajout.id && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-outline" onClick={() => photo.current?.click()}>📷 Photographier</button>
                  <button type="button" className="btn-outline" onClick={() => choisir.current?.click()}>📁 Choisir un fichier</button>
                  {captureEcranDisponible() && <button type="button" className="btn-outline col-span-2" onClick={capturer}>🖥️ Capturer l'écran</button>}
                </div>
                <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { prendreFichier(e.target.files?.[0]); e.target.value = ""; }} />
                <input ref={choisir} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { prendreFichier(e.target.files?.[0]); e.target.value = ""; }} />
                <p className="text-xs text-gray-500">Une capture d'écran déjà faite se choisit avec « Choisir un fichier » (galerie du téléphone). Vous pouvez aussi coller une image (Ctrl+V).</p>
                {fichier && (
                  <div className="flex items-center gap-3 rounded-lg bg-creme p-2">
                    {apercu ? <img src={apercu} alt="Aperçu du document" className="h-16 w-16 rounded object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded bg-white text-3xl">📄</span>}
                    <p className="min-w-0 text-sm"><span className="block truncate font-semibold">{fichier.name}</span><span className="text-gray-500">{taille(fichier.size)}</span></p>
                  </div>
                )}
              </div>
            )}
            <div><label className="label" htmlFor="ar-titre">Titre</label>
              <input id="ar-titre" className="input" maxLength={80} placeholder="Ex. Reçu SONABEL octobre" value={ajout.titre} onChange={(e) => setAjout({ ...ajout, titre: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label" htmlFor="ar-cat">Catégorie</label>
                <select id="ar-cat" className="input" value={ajout.categorie} onChange={(e) => setAjout({ ...ajout, categorie: e.target.value })}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  {!categories.includes(ajout.categorie) && ajout.categorie !== NOUVELLE && <option value={ajout.categorie}>{ajout.categorie}</option>}
                  <option value={NOUVELLE}>➕ Nouvelle catégorie…</option>
                </select></div>
              <div><label className="label" htmlFor="ar-date">Date du document</label>
                <input id="ar-date" className="input" type="date" max={aujourdhui()} value={ajout.date} onChange={(e) => setAjout({ ...ajout, date: e.target.value })} /></div>
            </div>
            {ajout.categorie === NOUVELLE && <input className="input" maxLength={40} placeholder="Nom de la nouvelle catégorie" value={ajout.nouvelleCategorie} onChange={(e) => setAjout({ ...ajout, nouvelleCategorie: e.target.value })} />}
            <div>
              <label className="label" htmlFor="ar-tag">Étiquettes</label>
              <div className="mb-1 flex flex-wrap gap-1">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700" title="Ajoutée automatiquement d'après la date">#{anneeDe(ajout.date)} (auto)</span>
                {ajout.tags.map((t) => (
                  <button key={t} type="button" className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800" aria-label={`Retirer l'étiquette ${t}`}
                    onClick={() => setAjout({ ...ajout, tags: ajout.tags.filter((x) => x !== t) })}>#{t} ✕</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input id="ar-tag" className="input min-w-0 flex-1" maxLength={30} placeholder="Ex. voiture, impôts, famille" value={ajout.saisieTag}
                  onChange={(e) => setAjout({ ...ajout, saisieTag: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); ajouterTag(); } }} />
                <button type="button" className="btn-outline" onClick={ajouterTag}>Ajouter</button>
              </div>
            </div>
            {!ajout.id && (
              <fieldset className="space-y-1">
                <legend className="label">Où garder ce document ?</legend>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="stockage" checked={ajout.stockage === "local"} onChange={() => setAjout({ ...ajout, stockage: "local" })} /> 📱 Sur cet appareil (gratuit)</label>
                <label className={`flex items-center gap-2 text-sm ${peutEnLigne ? "" : "opacity-50"}`}><input type="radio" name="stockage" disabled={!peutEnLigne} checked={ajout.stockage === "cloud"} onChange={() => setAjout({ ...ajout, stockage: "cloud" })} /> ☁️ En ligne, chiffré
                  {!peutEnLigne && <span className="text-xs text-gray-500">{!abonne ? "(abonnement requis)" : "(ouvrez d'abord vos archives en ligne)"}</span>}</label>
              </fieldset>
            )}
            <button type="submit" className="btn-primary w-full" disabled={occupe}>{occupe ? "Patientez…" : ajout.id ? "Enregistrer" : "Archiver"}</button>
          </form>
        )}
      </Modal>

      {/* Lecture d'un document */}
      <Modal ouvert={!!vue} titre={vue?.titre || ""} onFermer={() => setVue(null)} large>
        {vue && (
          <div className="space-y-3">
            {(vue.mime || "").startsWith("image/")
              ? <img src={vue.url} alt={vue.titre} className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg" />
              : <object data={vue.url} type={vue.mime || "application/pdf"} className="h-[60vh] w-full rounded-lg border border-gray-200"><p className="p-4 text-sm">Aperçu impossible : utilisez « Télécharger ».</p></object>}
            <button type="button" className="btn-outline w-full" onClick={() => telecharger(vue.blob, vue.nom || vue.titre)}>⬇ Télécharger</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
