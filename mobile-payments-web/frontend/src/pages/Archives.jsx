import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import { chiffrer, chiffrerJson, cleDeverrouillee, creerAvecSecret, dechiffrer, dechiffrerJson, depuisBase64, deverrouiller, deverrouillerAvecCode, deverrouillerAvecPoivre, nouveauSecours, nouveauSel, nouvelleEnveloppePin, preuveEtPartie, verrouiller, versBase64 } from "@/lib/archiveCrypto";
import { ajouterCategorie, ajouterLocal, categoriesPerso, demanderStockageDurable, listerLocal, lireContenuLocal, modifierLocal, nouvelId, supprimerLocal } from "@/lib/archiveLocal";
import { anneeDe, aujourdhui, captureEcranDisponible, capturerEcran, reduireImage, taille, telecharger } from "@/lib/archiveMedia";

// ============================================================================
// Archives (lot 56) : reçus, factures, pièces d'identité, pages de passeport, TVM, carte grise… et captures d'écran.
//   - Lot 92 : les documents sont gardés EN LIGNE, CHIFFRÉS, pour TOUT utilisateur (espace gratuit ; l'abonnement donne plus d'espace) : ils ne dépendent
//     plus de la mémoire du navigateur (changement d'adresse, données effacées, nouveau téléphone). Le chiffrement se fait ici, dans le navigateur,
//     avec un code PIN (ou une phrase) ET un code de secours que personne d'autre ne connaît : le serveur ne garde que des octets illisibles.
//   - Lot 93 : le code PIN ou la phrase (4 caractères au moins) est contrôlé par le serveur avec une limite d'essais (5, puis 15 min de pause ; 10 échecs : code de secours).
//   - Les documents qui ne sont encore que sur l'appareil (anciennes archives) montent automatiquement dès que les archives sont ouvertes.
//   - Étiquettes (tags) : l'année du document est ajoutée automatiquement ; l'utilisateur ajoute les siennes et ses propres catégories.
//   - Recherche : texte libre (titre, catégorie, étiquettes, année) + filtres catégorie, année et étiquette.
// ============================================================================
const CATEGORIES_BASE = ["Reçu", "Facture", "Carte d'identité", "Passeport (pages)", "TVM (taxe véhicule à moteur)", "Carte grise", "Permis de conduire",
  "Assurance", "Acte (naissance, mariage…)", "Diplôme / attestation", "Ordonnance", "Contrat", "Capture d'écran", "Autre"];
const NOUVELLE = "__nouvelle";
// Lot 93 : le secret des archives est un CODE PIN (chiffres) ou une PHRASE, d'au moins 4 caractères ; les essais sont limités par le serveur
const MIN_SECRET = 4;
const secretValide = (type, s) => (type === "pin" ? /^\d{4,12}$/.test(s) : s.length >= MIN_SECRET);
const MESSAGE_SECRET = (type) => (type === "pin" ? "Le code PIN compte de 4 à 12 chiffres" : `La phrase secrète doit compter au moins ${MIN_SECRET} caractères`);
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const VIDE = { titre: "", categorie: CATEGORIES_BASE[0], nouvelleCategorie: "", date: aujourdhui(), tags: [], saisieTag: "", stockage: "cloud" };

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
  const [codeSecours, setCodeSecours] = useState(null);     // lot 92 : code de secours à montrer UNE fois {code, confirme}
  const [typeSecret, setTypeSecret] = useState("pin");      // lot 93 : « pin » | « phrase » (choix à l'activation et au changement de code)
  const [modeCode, setModeCode] = useState(false);           // lot 92 : formulaire « phrase oubliée → code de secours »
  const [codeSaisi, setCodeSaisi] = useState("");
  const [synchro, setSynchro] = useState(null);              // lot 92 : mise en sécurité des documents locaux {fait, total}
  const synchroEnCours = useRef(false);
  const synchroRefusee = useRef(false);                  // refus du serveur (espace plein…) : pas de ré-essai automatique
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
  // Saisie du code : un PIN n'accepte que des chiffres
  const saisirSecret = (champ, valeur) => setPhrase((p) => ({ ...p, [champ]: typeSecret === "pin" ? valeur.replace(/\D/g, "").slice(0, 12) : valeur }));
  // Lot 93 : « code ou phrase » → { preuve (envoyée au serveur, qui limite les essais), partie (reste ici) }
  const etapeSecret = (secret, sel) => preuveEtPartie(secret, sel);

  const activerEnLigne = async (e) => {
    e.preventDefault();
    if (!secretValide(typeSecret, phrase.a)) { toast.erreur(MESSAGE_SECRET(typeSecret)); return; }
    if (phrase.a !== phrase.b) { toast.erreur("Les deux saisies ne sont pas identiques"); return; }
    setOccupe(true);
    try {
      const sel = nouveauSel();
      const { preuve, partie } = await etapeSecret(phrase.a, sel);
      const { data } = await apiClient.post("/archives/pin/enregistrer", { preuve, type_secret: typeSecret });
      const { verif, enveloppe, secours, code } = await creerAvecSecret(partie, data.poivre, sel);
      await apiClient.post("/archives/cle", { sel, verif, enveloppe, secours });
      setPhrase({ a: "", b: "" });
      await chargerEtat();
      setCloud([]); setDeverrouille(true);
      setCodeSecours({ code, confirme: false });                // le code de secours est montré une seule fois, avec obligation de confirmer
    } catch (err) { verrouiller(); toast.erreur(messageErreur(err, "Activation impossible")); } finally { setOccupe(false); }
  };
  const ouvrirCoffre = async (e) => {
    e.preventDefault();
    setOccupe(true);
    try {
      if (etat.pin) {
        // Archives protégées par code + poivre du serveur : le serveur contrôle la preuve et limite les essais
        const { preuve, partie } = await etapeSecret(phrase.a, etat.sel);
        const { data } = await apiClient.post("/archives/pin/ouvrir", { preuve });
        if (!(await deverrouillerAvecPoivre(partie, data.poivre, etat.verif, etat.enveloppe))) { toast.erreur("Ouverture impossible : réessayez"); return; }
      } else {
        // Archives créées avant le lot 93 (protégées par la phrase seule) : ouverture, puis mise à niveau vers code + poivre
        const r = await deverrouiller(phrase.a, etat.sel, etat.verif, etat.enveloppe);
        if (!r.ok) { toast.erreur("Phrase secrète incorrecte"); return; }
        const { preuve, partie } = await etapeSecret(phrase.a, etat.sel);
        const { data } = await apiClient.post("/archives/pin/enregistrer", { preuve, type_secret: "phrase", verif_actuelle: etat.verif });
        const enveloppe = await nouvelleEnveloppePin(partie, data.poivre);
        let maj = { verif_actuelle: etat.verif, enveloppe };
        if (!etat.secours) {                                    // très anciennes archives : on ajoute aussi un code de secours
          const s = await nouveauSecours(etat.sel);
          maj = { ...maj, secours: s.secours };
          setCodeSecours({ code: s.code, confirme: false });
        }
        await apiClient.post("/archives/cle/enveloppes", maj);
        await chargerEtat();
      }
      setPhrase({ a: "", b: "" }); setDeverrouille(true);
    } catch (err) { verrouiller(); toast.erreur(messageErreur(err, "Ouverture impossible")); } finally { setOccupe(false); }
  };
  // Code oublié : le code de secours rouvre la clé, puis on choisit un nouveau code ou une nouvelle phrase (les documents ne changent pas)
  const recupererAvecCode = async (e) => {
    e.preventDefault();
    if (!secretValide(typeSecret, phrase.a)) { toast.erreur(MESSAGE_SECRET(typeSecret)); return; }
    if (phrase.a !== phrase.b) { toast.erreur("Les deux saisies ne sont pas identiques"); return; }
    setOccupe(true);
    try {
      if (!etat.secours) { toast.erreur("Aucun code de secours n'a été enregistré pour ces archives"); return; }
      if (!(await deverrouillerAvecCode(codeSaisi, etat.sel, etat.verif, etat.secours))) { toast.erreur("Code de secours incorrect"); return; }
      const { preuve, partie } = await etapeSecret(phrase.a, etat.sel);
      const { data } = await apiClient.post("/archives/pin/enregistrer", { preuve, type_secret: typeSecret, verif_actuelle: etat.verif });
      const enveloppe = await nouvelleEnveloppePin(partie, data.poivre);
      await apiClient.post("/archives/cle/enveloppes", { verif_actuelle: etat.verif, enveloppe });
      setPhrase({ a: "", b: "" }); setCodeSaisi(""); setModeCode(false);
      await chargerEtat(); setDeverrouille(true);
      toast.succes("Archives rouvertes : votre nouveau code est enregistré");
    } catch (err) { verrouiller(); toast.erreur(messageErreur(err, "Récupération impossible")); } finally { setOccupe(false); }
  };
  const fermerCoffre = () => { verrouiller(); setDeverrouille(false); setCloud(null); synchroRefusee.current = false; };

  // ---- Ajout / modification ----------------------------------------------------------------------
  const prendreFichier = async (f) => {
    if (!f) return;
    const prepare = await reduireImage(f);
    if (apercu) URL.revokeObjectURL(apercu);
    setFichier(prepare);
    setApercu(prepare.type.startsWith("image/") ? URL.createObjectURL(prepare) : "");
    setAjout((a) => (a && !a.titre ? { ...a, titre: f.name.replace(/\.\w+$/, ""), categorie: f.name.startsWith("capture-") ? "Capture d'écran" : a.categorie } : a));
  };
  const ouvrirAjout = () => { setFichier(null); setApercu(""); setAjout({ ...VIDE, date: aujourdhui(), tags: [], stockage: deverrouille ? "cloud" : "local" }); };
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
  // Envoie UN document de l'appareil en ligne (chiffré) puis retire la copie locale, seulement après confirmation du serveur
  const televerserLocal = async (d) => {
    const blob = await lireContenuLocal(d.id);
    if (!blob) { await supprimerLocal(d.id); return; }            // contenu absent : ligne orpheline sans objet
    const { source, ...meta } = d;                                  // eslint-disable-line no-unused-vars
    const contenu = versBase64(await chiffrer(new Uint8Array(await blob.arrayBuffer())));
    const rep = await apiClient.post("/archives", { meta: await chiffrerJson(meta), contenu });
    if (!rep?.data?.id) throw new Error("Réponse du serveur incomplète");
    await supprimerLocal(d.id);
  };
  const messageRefus = (err, defaut) => {
    const det = err?.response?.data?.detail;
    return typeof det === "object" && det?.message ? det.message : messageErreur(err, defaut);
  };
  const envoyerEnLigne = async (d) => {
    setOccupe(true);
    try {
      await televerserLocal(d);
      await Promise.all([chargerLocal(), chargerCloud(), chargerEtat()]);
      toast.succes("Envoyé en ligne (chiffré) ; la copie de l'appareil est retirée");
    } catch (err) { toast.erreur(messageRefus(err, "Envoi impossible")); } finally { setOccupe(false); }
  };
  // Lot 92 : met en sécurité (en ligne, chiffrés) tous les documents qui ne sont que sur l'appareil. S'arrête si l'espace offert est plein :
  // les documents restants restent sur l'appareil et l'utilisateur en est averti.
  const mettreEnSecurite = useCallback(async () => {
    if (synchroEnCours.current) return;
    synchroEnCours.current = true;
    try {
      const liste = await listerLocal();
      if (!liste.length) return;
      let fait = 0;
      setSynchro({ fait, total: liste.length });
      for (const d of liste) {
        try { await televerserLocal({ ...d, source: "local" }); fait += 1; setSynchro({ fait, total: liste.length }); }
        catch (err) { synchroRefusee.current = true; toast.erreur(`${fait} document(s) sur ${liste.length} mis en sécurité. ${messageRefus(err, "Envoi interrompu")}`); break; }
      }
      if (fait === liste.length) toast.succes(`${fait} document${fait > 1 ? "s" : ""} de cet appareil ${fait > 1 ? "sont" : "est"} maintenant en sécurité en ligne (chiffré${fait > 1 ? "s" : ""})`);
      await Promise.all([chargerLocal(), chargerCloud(), chargerEtat()]);
    } finally { synchroEnCours.current = false; setSynchro(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargerLocal, chargerCloud, chargerEtat, toast]);
  // Dès que les archives sont ouvertes (et le code de secours confirmé), les documents locaux montent tout seuls
  useEffect(() => {
    if (deverrouille && etat?.sel && (!codeSecours || codeSecours.confirme) && locaux.length > 0 && !synchroRefusee.current) mettreEnSecurite();
  }, [deverrouille, etat?.sel, codeSecours, locaux.length, mettreEnSecurite]);
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
  const peutEnLigne = deverrouille;                                  // lot 92 : plus besoin d'abonnement (espace gratuit offert)
  const resteLocal = locaux.length;                                   // documents qui ne sont QUE sur cet appareil

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">🗄️ Archives</h1>
        <button type="button" className="btn-primary" onClick={ouvrirAjout}>+ Archiver</button>
      </div>
      <p className="text-sm text-gray-600">Reçus, factures, carte d'identité, pages de passeport, TVM, carte grise… Ajoutez une photo, un fichier ou une capture d'écran,
        classez-les par catégorie et étiquettes, retrouvez-les par la recherche.</p>

      {/* Où sont gardés les documents (lot 92 : en ligne, chiffrés, pour tous) */}
      <section className="card space-y-2 p-4" data-testid="stockage">
        <p className="font-semibold">☁️ Vos documents sont gardés en ligne, chiffrés <span className="badge ml-1 bg-green-100 text-green-800">{abonne ? "abonnement actif" : "espace gratuit"}</span></p>
        <p className="text-sm text-gray-600">Ils sont chiffrés sur votre téléphone avant l'envoi : ni auRor ni SAWALI ne peuvent les lire. Ils ne dépendent plus de la mémoire de votre navigateur :
          changement d'adresse, données effacées ou nouveau téléphone ne les font pas disparaître.</p>
        {etat === false && <p className="text-sm text-amber-800">Le service en ligne est momentanément indisponible. Les documents de l'appareil restent accessibles.</p>}
        {etat && !enLigneConfigure && (
          <form onSubmit={activerEnLigne} className="space-y-2">
            <p className="text-sm text-gray-600">Choisissez comment protéger vos archives : un <b>code PIN</b> (comme celui d'une carte) ou une <b>phrase secrète</b>. Quatre caractères suffisent :
              le serveur limite les essais (5 essais, puis 15 minutes d'attente). Un <b>code de secours</b> vous sera remis ensuite pour retrouver l'accès si vous oubliez votre code.
              <b> Sans votre code ni le code de secours, personne ne peut récupérer vos documents.</b></p>
            <fieldset className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="type-secret" checked={typeSecret === "pin"} onChange={() => { setTypeSecret("pin"); setPhrase({ a: "", b: "" }); }} /> 🔢 Code PIN</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="type-secret" checked={typeSecret === "phrase"} onChange={() => { setTypeSecret("phrase"); setPhrase({ a: "", b: "" }); }} /> 🔤 Phrase secrète</label>
            </fieldset>
            <input className="input" type="password" inputMode={typeSecret === "pin" ? "numeric" : "text"} autoComplete="new-password" placeholder={typeSecret === "pin" ? "Code PIN (4 à 12 chiffres)" : "Phrase secrète (4 caractères au moins)"} value={phrase.a} onChange={(e) => saisirSecret("a", e.target.value)} />
            <input className="input" type="password" inputMode={typeSecret === "pin" ? "numeric" : "text"} autoComplete="new-password" placeholder={typeSecret === "pin" ? "Répétez le code PIN" : "Répétez la phrase secrète"} value={phrase.b} onChange={(e) => saisirSecret("b", e.target.value)} />
            <button type="submit" className="btn-primary w-full" disabled={occupe}>{occupe ? "Patientez…" : "Activer la sauvegarde en ligne chiffrée"}</button>
          </form>
        )}
        {etat && enLigneConfigure && !deverrouille && !modeCode && (
          <form onSubmit={ouvrirCoffre} className="space-y-2">
            <p className="text-sm text-gray-600">{nbEnLigne} document{nbEnLigne > 1 ? "s" : ""} en ligne, verrouillé{nbEnLigne > 1 ? "s" : ""}. Saisissez votre {etat.pin === "pin" ? "code PIN" : "phrase secrète"} pour les voir.{!abonne && etat.nombre_max != null && ` Espace gratuit : ${etat.nombre_max} documents, ${taille(etat.quota_octets)}.`}</p>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" type="password" inputMode={etat.pin === "pin" ? "numeric" : "text"} autoComplete="current-password" placeholder={etat.pin === "pin" ? "Code PIN" : "Phrase secrète"} value={phrase.a}
                onChange={(e) => setPhrase({ ...phrase, a: etat.pin === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value })} />
              <button type="submit" className="btn-primary" disabled={occupe || !phrase.a}>{occupe ? "…" : "🔓 Ouvrir"}</button>
            </div>
            {etat.secours && <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => { setModeCode(true); setTypeSecret(etat.pin === "phrase" ? "phrase" : "pin"); setPhrase({ a: "", b: "" }); }}>{etat.pin === "pin" ? "Code PIN oublié" : "Phrase oubliée"} ? Utiliser mon code de secours</button>}
          </form>
        )}
        {etat && enLigneConfigure && !deverrouille && modeCode && (
          <form onSubmit={recupererAvecCode} className="space-y-2">
            <p className="text-sm text-gray-600">Saisissez votre <b>code de secours</b> (8 groupes de 4 caractères) puis choisissez un <b>nouveau code PIN ou une nouvelle phrase</b>. Vos documents ne changent pas.</p>
            <input className="input font-mono" autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" value={codeSaisi} onChange={(e) => setCodeSaisi(e.target.value)} />
            <fieldset className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="type-secret2" checked={typeSecret === "pin"} onChange={() => { setTypeSecret("pin"); setPhrase({ a: "", b: "" }); }} /> 🔢 Code PIN</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="type-secret2" checked={typeSecret === "phrase"} onChange={() => { setTypeSecret("phrase"); setPhrase({ a: "", b: "" }); }} /> 🔤 Phrase secrète</label>
            </fieldset>
            <input className="input" type="password" inputMode={typeSecret === "pin" ? "numeric" : "text"} autoComplete="new-password" placeholder={typeSecret === "pin" ? "Nouveau code PIN" : "Nouvelle phrase secrète"} value={phrase.a} onChange={(e) => saisirSecret("a", e.target.value)} />
            <input className="input" type="password" inputMode={typeSecret === "pin" ? "numeric" : "text"} autoComplete="new-password" placeholder="Répétez" value={phrase.b} onChange={(e) => saisirSecret("b", e.target.value)} />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={occupe || !codeSaisi}>{occupe ? "Patientez…" : "Rouvrir mes archives"}</button>
              <button type="button" className="btn-outline" onClick={() => { setModeCode(false); setCodeSaisi(""); }}>Annuler</button>
            </div>
          </form>
        )}
        {etat && enLigneConfigure && deverrouille && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <span>🔓 Ouvert · {taille(etat.utilise_octets)} utilisés sur {taille(etat.quota_octets)}{etat.nombre_max != null && ` · ${etat.nombre}/${etat.nombre_max} documents`}
              {!abonne && <> · <Link to="/abonnement" className="font-semibold text-primary underline">plus d'espace</Link></>}</span>
            <button type="button" className="btn-outline btn-sm" onClick={fermerCoffre}>🔒 Verrouiller</button>
          </div>
        )}
        {synchro && <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900" role="status">Mise en sécurité de vos documents : {synchro.fait} sur {synchro.total}… Ne fermez pas la page.</p>}
        {resteLocal > 0 && !synchro && (
          <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900" role="alert">
            ⚠️ {resteLocal} document{resteLocal > 1 ? "s ne sont" : " n'est"} que sur cet appareil : {resteLocal > 1 ? "ils seraient perdus" : "il serait perdu"} si les données du navigateur sont effacées ou si l'adresse change.
            {deverrouille
              ? <> <button type="button" className="font-semibold underline" onClick={() => { synchroRefusee.current = false; mettreEnSecurite(); }}>Les mettre en sécurité maintenant</button></>
              : " Activez ou ouvrez la sauvegarde en ligne ci-dessus : ils seront envoyés automatiquement."}
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

      {/* Lot 92 — code de secours : montré UNE seule fois, à noter avant de continuer */}
      <Modal ouvert={!!codeSecours} titre="Votre code de secours" onFermer={() => { if (codeSecours?.confirme) setCodeSecours(null); }}>
        {codeSecours && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Si vous oubliez votre code PIN ou votre phrase, ce code est <b>le seul moyen</b> de retrouver vos documents. Il ne sera <b>plus jamais affiché</b>.
              Notez-le sur papier ou enregistrez-le dans un endroit sûr, <b>pas sur ce téléphone seulement</b>.</p>
            <p className="select-all rounded-lg bg-creme p-3 text-center font-mono text-lg font-bold tracking-wide" data-testid="code-secours">{codeSecours.code}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-outline" onClick={() => { try { navigator.clipboard?.writeText(codeSecours.code); toast.succes("Code copié"); } catch { toast.info("Sélectionnez le code pour le copier"); } }}>📋 Copier</button>
              <button type="button" className="btn-outline" onClick={() => telecharger(new Blob([`auRor — code de secours des archives\n\n${codeSecours.code}\n\nGardez ce fichier en lieu sûr (pas seulement sur ce téléphone).\n`], { type: "text/plain" }), "auror-code-de-secours.txt")}>⬇ Télécharger</button>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={codeSecours.confirme} onChange={(e) => setCodeSecours({ ...codeSecours, confirme: e.target.checked })} /> J'ai noté mon code de secours en lieu sûr.</label>
            <button type="button" className="btn-primary w-full" disabled={!codeSecours.confirme} onClick={() => setCodeSecours(null)}>Continuer</button>
          </div>
        )}
      </Modal>

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
                <label className={`flex items-center gap-2 text-sm ${peutEnLigne ? "" : "opacity-50"}`}><input type="radio" name="stockage" disabled={!peutEnLigne} checked={ajout.stockage === "cloud"} onChange={() => setAjout({ ...ajout, stockage: "cloud" })} /> ☁️ En ligne, chiffré (recommandé)
                  {!peutEnLigne && <span className="text-xs text-gray-500">(activez ou ouvrez d'abord vos archives en ligne)</span>}</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="stockage" checked={ajout.stockage === "local"} onChange={() => setAjout({ ...ajout, stockage: "local" })} /> 📱 Sur cet appareil seulement
                  <span className="text-xs text-amber-800">(non sauvegardé)</span></label>
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
