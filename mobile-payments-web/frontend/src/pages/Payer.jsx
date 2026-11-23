import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CarteCodeUssd from "@/components/CarteCodeUssd";
import Chargement from "@/components/Chargement";
import Publicites from "@/components/Publicites";
import WidgetAujourdhui from "@/components/WidgetAujourdhui";
import QrOperateur from "@/components/QrOperateur";
import LogoMode from "@/components/LogoMode";
import PaiementPispi from "@/components/PaiementPispi";
import PaiementDirect from "@/components/PaiementDirect";   // application Android direct : fenêtre de sécurité, SMS de confirmation
import RaccourcisMarchand from "@/components/RaccourcisMarchand";   // paiement rapide : nouveau code ou liste des marchands
import MarchandsProches from "@/components/MarchandsProches";   // lot 102 : liste des marchands proches à choisir
import ScannerQr from "@/components/ScannerQr";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import SelecteurOperateur from "@/components/SelecteurOperateur";   // lot 89 : listes d'opérateurs avec logos
import { positionActuelle } from "@/lib/geoloc";
import { apiClient, CATEGORIES, couleurOperateur, messageErreur } from "@/lib/api";
import { analyserQr } from "@/lib/qrOperateurs";
import { capacites, lireMontantPhoto, dicterMontantVoix } from "@/lib/pontAndroid";
import { montantsParles } from "@/lib/montantParle";
import { chargerAvecCache, estErreurReseau, fileAjouterPaiement } from "@/lib/horsLigne";      // lot 192 : paiement quand la connexion est perdue (copie chiffrée + file d'attente)
import { pourUtilisateur } from "@/lib/journalIntime";
import { ErreurSaisie, preparerPaiementLocal } from "@/lib/ussdLocal";
import { enLettres } from "@/lib/nombreEnLettres";
import NiveauBudget from "@/components/NiveauBudget";   // lot 217 : niveau du budget à chaque paiement préparé
import Modal from "@/components/Modal";
import { chargerBudget, niveauBudget } from "@/lib/budget";
import { chargerLignes } from "@/lib/smsPaiements";

// Parcours de paiement, comme l'app Android :
// Opérateur -> Service -> Formulaire (avec résolution du code marchand) -> Code USSD + QR.
// Un QR code marchand (page Marchands) ouvre cette page avec ?operateur=…&service=…&code=…
export default function Payer() {
  const toast = useToast();
  const { user } = useAuth();
  pourUtilisateur(user?.id);                                // la copie chiffrée hors connexion est propre à chaque compte
  const [horsLigne, setHorsLigne] = useState(null);         // null = en ligne ; { depuis } = les informations viennent de la copie chiffrée du téléphone
  const [params, setParams] = useSearchParams();

  const [numeroFige, setNumeroFige] = useState(false);       // venu d'une fiche de rappel : le numéro du contact est grisé, le montant reste modifiable
  const [operateurs, setOperateurs] = useState(null);
  const [services, setServices] = useState([]);
  const [operateur, setOperateur] = useState("");
  const [service, setService] = useState(null);
  const [valeurs, setValeurs] = useState({});
  // Lecture optique du montant (application Android) : montants proposés après la photo d'un afficheur client ou d'une facture
  const [lecture, setLecture] = useState({ enCours: false, montants: [] });
  // Saisie VOCALE du montant : la personne (ou le marchand) dit le montant ; il apparaît en chiffres ET en toutes lettres ; elle le valide d'un geste
  const [voix, setVoix] = useState({ enCours: false, propositions: [] });
  const [montantVocal, setMontantVocal] = useState(null);                // montant validé à la voix (nombre) : dispense de le retaper dans la fenêtre de sécurité
  const direLeMontant = async () => {
    setVoix({ enCours: true, propositions: [] });
    toast.info("Écoute en cours… dites le montant, par exemple « quatre mille sept cents francs ».");
    const r = await dicterMontantVoix();
    if (r.erreur) { setVoix({ enCours: false, propositions: [] }); toast.erreur(r.erreur); return; }
    const propositions = montantsParles(r.transcriptions);
    setVoix({ enCours: false, propositions });
    if (propositions.length) toast.succes("Montant compris : vérifiez-le en toutes lettres puis validez."); else toast.erreur("Le montant n'a pas été compris. Répétez, ou tapez-le.");
  };
  const validerVocal = (valeur) => { setValeurs((v) => ({ ...v, amount: String(valeur) })); setMontantVocal(valeur); setVoix({ enCours: false, propositions: [] }); toast.succes(`Montant validé : ${valeur.toLocaleString("fr-FR")} FCFA.`); };
  const lireLeMontant = async () => {
    setLecture({ enCours: true, montants: [] });
    toast.info("Lecture du montant en cours… cadrez l'afficheur ou la facture.");
    const r = await lireMontantPhoto();
    if (r.erreur) { setLecture({ enCours: false, montants: [] }); toast.erreur(r.erreur); return; }
    setLecture({ enCours: false, montants: r.montants || [] });
    toast.succes(`${(r.montants || []).length} montant(s) lu(s) : choisissez le bon. Il vous sera redemandé avant l'envoi.`);
  };
  const [paiement, setPaiement] = useState(null); // paiement préparé (étape finale)
  const [paiementDirect, setPaiementDirect] = useState(null);   // application Android direct : paiement envoyé par l'application
  const appliDirect = !!capacites()?.direct;
  const [envoi, setEnvoi] = useState(false);
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const [qrOperateur, setQrOperateur] = useState(null);   // QR d'une plaque d'opérateur lu par la caméra (lot 38)

  // Marchand : null = pas encore cherché ; { trouve, libelle } sinon
  const [marchand, setMarchand] = useState(null);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [marchandsConnus, setMarchandsConnus] = useState([]);

  // Mode de paiement (lot 58) : « clavier » (code USSD, par défaut) ou « pispi » (marchand vérifié avec QR PI-SPI)
  const [mode, setMode] = useState("clavier");
  const [pispiDispo, setPispiDispo] = useState(null);        // null = inconnu ; {disponible, nom, banque}
  const [pispiOuvert, setPispiOuvert] = useState(null);      // {paiement, bloc} : fenêtre de paiement PI-SPI

  const champMarchand = useMemo(() => service?.champs.find((c) => c.isMerchantCode) || null, [service]);
  const codeMarchand = champMarchand ? (valeurs[champMarchand.key] || "") : "";
  // Application « direct » : l'application envoie elle-même la séquence pour un paiement chez un marchand OU un transfert d'argent (même fenêtre de sécurité, mêmes conditions par opérateur)
  const directEligible = appliDirect && ((service?.categorie === "merchant_payment" && !!champMarchand) || service?.categorie === "money_transfer");

  // Liste des opérateurs au chargement
  useEffect(() => {
    chargerAvecCache("operateurs", () => apiClient.get("/operateurs").then((r) => r.data))
      .then(({ data, horsLigne: hl, depuis }) => { setOperateurs(data); if (hl) setHorsLigne({ depuis }); })
      .catch(() => setOperateurs([]));
  }, []);

  // Choix d'un opérateur : chargement de ses services et des marchands déjà connus
  const choisirOperateur = useCallback(async (nom) => {
    setOperateur(nom);
    setService(null);
    setPaiement(null);
    try {
      // Chaque liste est gardée en copie chiffrée sur le téléphone : sans réseau, c'est la copie qui répond
      const [rs, rm] = await Promise.all([
        chargerAvecCache(`services_${nom}`, () => apiClient.get("/services", { params: { operateur: nom } }).then((r) => r.data)),
        chargerAvecCache(`marchands_${nom}`, () => apiClient.get("/marchands", { params: { operateur: nom } }).then((r) => r.data)).catch(() => ({ data: [], horsLigne: true })),
      ]);
      setServices(rs.data);
      setMarchandsConnus(rm.data);
      if (rs.horsLigne) setHorsLigne({ depuis: rs.depuis });
      return rs.data;
    } catch (err) {
      toast.erreur(messageErreur(err, "Chargement des services impossible"));
      return [];
    }
  }, [toast]);

  // Choix d'un service : formulaire vide (ou pré-rempli par un QR marchand)
  const choisirService = useCallback((svc, preRemplies = {}) => {
    setNumeroFige(false);
    setService(svc);
    setValeurs(preRemplies);
    setMarchand(null);
    setNouveauLibelle("");
    setPaiement(null);
  }, []);

  // Ouverture directe du formulaire depuis un QR code marchand
  // (opérateur + service + code marchand pré-rempli ; l'utilisateur saisit le montant)
  const ouvrirDepuisQr = useCallback(async (op, idService, code) => {
    const svc = await choisirOperateur(op);
    // Lot 106 : service demandé (QR, marchand proche) ; à défaut, le « Paiement marchand » de l'opérateur avant tout autre service à code marchand
    const direct = appliDirect && svc.find((x) => x.categorie === "merchant_payment" && x.gabarit_ussd.includes("{pin}") && x.champs.some((c) => c.isMerchantCode));   // paiement direct : le service avec code secret d'abord
    const s = direct || svc.find((x) => x.id === idService) || svc.find((x) => x.categorie === "merchant_payment" && x.champs.some((c) => c.isMerchantCode))
      || svc.find((x) => x.champs.some((c) => c.isMerchantCode));
    if (s) {
      const cle = s.champs.find((c) => c.isMerchantCode)?.key;
      choisirService(s, cle && code ? { [cle]: code } : {});
    }
  }, [choisirOperateur, choisirService, appliDirect]);

  // Arrivée depuis le carnet de contacts : ?transfert=1&phone=54144722[&operateur=Orange][&montant=25000] → « Transfert d'argent » prérempli ;
  // la personne relit, puis valide comme d'habitude (le site ne paie jamais seul)
  useEffect(() => {
    if (params.get("transfert") !== "1" || operateurs === null) return;
    const phone = (params.get("phone") || "").replace(/\D/g, ""), montant = (params.get("montant") || "").replace(/\D/g, ""), op = params.get("operateur") || "Orange", fige = params.get("fige") === "1";
    setParams({}, { replace: true });
    (async () => {
      const svc = await choisirOperateur(op);
      const s = svc.find((x) => x.categorie === "money_transfer");
      if (!s) { toast.erreur(`Pas de transfert d'argent disponible pour ${op} : choisissez le service.`); return; }
      const cleTel = s.champs.find((c) => c.key === "phone")?.key, cleMontant = s.champs.find((c) => c.key === "amount")?.key;
      choisirService(s, { ...(cleTel && phone ? { [cleTel]: phone } : {}), ...(cleMontant && montant ? { [cleMontant]: montant } : {}) });
      if (fige && cleTel && phone) setNumeroFige(true);
      toast.succes("Transfert prérempli : vérifiez le numéro et le montant avant de valider.");
    })();
  }, [operateurs, params, setParams, choisirOperateur, choisirService, toast]);

  // Arrivée par le QR code d'un marchand : ?operateur=Orange&service=<id>&code=1234
  useEffect(() => {
    if (params.get("transfert") === "1") return;
    const op = params.get("operateur");
    if (!op || operateurs === null) return;
    ouvrirDepuisQr(op, params.get("service"), params.get("code") || "");
    setParams({}, { replace: true }); // on nettoie l'adresse
  }, [operateurs, params, setParams, ouvrirDepuisQr]);

  // Recherche du code marchand dès qu'il est saisi (petit délai pour ne pas interroger à chaque touche)
  useEffect(() => {
    if (!champMarchand || codeMarchand.length < 3) {
      setMarchand(null);
      return undefined;
    }
    const minuterie = setTimeout(() => {
      apiClient.get(`/marchands/${encodeURIComponent(operateur)}/${encodeURIComponent(codeMarchand)}`)
        .then(({ data }) => setMarchand({ trouve: true, libelle: data.libelle, service_id: data.service_id || null }))
        .catch((err) => setMarchand(err?.response?.status === 404 ? { trouve: false } : null));
    }, 400);
    return () => clearTimeout(minuterie);
  }, [champMarchand, codeMarchand, operateur]);

  // Ce marchand accepte-t-il PI-SPI ? (compte marchand vérifié) ; le mode revient à « clavier » quand le code change
  useEffect(() => {
    setMode("clavier");
    if (!champMarchand || codeMarchand.length < 3) { setPispiDispo(null); return undefined; }
    const minuterie = setTimeout(() => {
      apiClient.get(`/marchands/${encodeURIComponent(operateur)}/${encodeURIComponent(codeMarchand)}/pispi`)
        .then(({ data }) => setPispiDispo(data)).catch(() => setPispiDispo(null));
    }, 450);
    return () => clearTimeout(minuterie);
  }, [champMarchand, codeMarchand, operateur]);

  // Code marchand inconnu : l'utilisateur lui donne un nom (annuaire partagé)
  const enregistrerMarchand = async () => {
    try {
      const { data } = await apiClient.post("/marchands", { operateur, code: codeMarchand, libelle: nouveauLibelle.trim() });
      setMarchand({ trouve: true, libelle: data.libelle });
      setMarchandsConnus((m) => [data, ...m.filter((x) => x.code !== data.code)]);
      toast.succes("Marchand enregistré");
    } catch (err) {
      toast.erreur(messageErreur(err, "Nom invalide (lettres, chiffres, espaces)"));
    }
  };

  // Préparation du paiement : le serveur construit et vérifie le code USSD
  // Lot 217 : budget de dépenses (Profil). Le niveau est calculé sur les SMS de paiement lus (téléphone), avec le montant saisi.
  const [alerteBudget, setAlerteBudget] = useState(null);          // niveau de budget quand le paiement le ferait dépasser (attend « Forcer » ou « Annuler »)
  const budget = useMemo(() => chargerBudget(), []);
  const lignesBudget = useMemo(() => chargerLignes(), []);
  const montantSaisi = parseInt(String(valeurs.amount || "").replace(/\D/g, ""), 10) || 0;
  const niveau = niveauBudget(lignesBudget, budget, montantSaisi, Date.now(), operateur);
  const preparer = async (e, forcer = false) => {
    e?.preventDefault?.();
    // Le paiement ferait dépasser le budget : on prévient, l'utilisateur décide de forcer ou d'annuler
    if (!forcer && (niveau?.depasse || niveau?.opDepasse)) { setAlerteBudget(niveau); return; }
    setAlerteBudget(null);
    setEnvoi(true);
    try {
      // PI-SPI : bloc de paiement du marchand (QR de sa banque) au lieu du code USSD
      if (mode === "pispi") {
        const montant = parseInt(String(valeurs.amount || "").replace(/\D/g, ""), 10);
        const { data } = await apiClient.post("/paiements/pispi", { operateur, code: codeMarchand, montant });
        setPispiOuvert(data);
        return;
      }
      // Géolocalisation (si le compte l'a activée) : la position part avec la demande ; 4 s au plus d'attente, jamais bloquant
      const position = user?.geoloc ? await positionActuelle({ delaiMs: 4000 }) : null;
      let data;
      try {
        ({ data } = await apiClient.post("/paiements", { service_id: service.id, valeurs, ...(position ? { position } : {}) }));
      } catch (echec) {
        // Réseau perdu : le paiement est préparé SUR LE TÉLÉPHONE (le code USSD part par le réseau mobile, pas par Internet) et mis en file chiffrée ;
        // le serveur le reçoit dès que la connexion revient. Une erreur du serveur (saisie refusée…) reste affichée comme avant.
        if (!estErreurReseau(echec)) throw echec;
        data = preparerPaiementLocal(service, valeurs, { marchandsConnus });
        await fileAjouterPaiement(data);
        setHorsLigne((h) => h || { depuis: null });
        toast.info("Hors connexion : paiement préparé sur le téléphone. Il sera transmis au serveur dès que le réseau revient.");
      }
      // Application « direct » + paiement chez un marchand : l'application envoie elle-même la séquence (fenêtre de sécurité : montant retapé + code secret),
      // SANS QR code ni légende. Les autres services (transfert, crédit…) gardent l'écran habituel.
      // Transfert d'argent : MÊME flux que le paiement marchand (fenêtre de sécurité, Orange en deux temps sans code secret dans la séquence, SMS de confirmation)
      if (directEligible) setPaiementDirect({ ...data, confirmation_lettres: montantVocal !== null && Number(data.montant) === montantVocal }); else setPaiement(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.erreur(err instanceof ErreurSaisie ? err.message : messageErreur(err, "Préparation impossible"));
    } finally {
      setEnvoi(false);
    }
  };

  const changerStatut = async (statut) => {
    try {
      await apiClient.put(`/paiements/${paiement.id}/statut`, { statut });
      toast.succes(statut === "effectue" ? "Paiement noté comme effectué" : "Paiement noté comme abandonné");
      recommencer();
    } catch (err) {
      toast.erreur(messageErreur(err));
    }
  };

  const recommencer = () => {
    setPaiement(null);
    setPaiementDirect(null);
    setService(null);
    setOperateur("");
    setValeurs({});
    setMontantVocal(null);
  };

  // Lecture d'un QR code avec la caméra (site ouvert sur le téléphone) : QR marchand auRor,
  // ou QR d'une plaque d'opérateur (Orange…) dont le code marchand est mémorisé à la première fois (lot 38)
  const surScan = useCallback((texte) => {
    setScannerOuvert(false);
    const qr = analyserQr(texte);
    if (qr?.type === "paiement-mobile") ouvrirDepuisQr(qr.operateur, qr.service, qr.code);
    else if (qr?.type === "operateur") setQrOperateur(qr);
    else toast.erreur("QR code non reconnu (QR marchand auRor ou plaque Orange Money).");
  }, [ouvrirDepuisQr, toast]);
  const fermerScanner = useCallback(() => setScannerOuvert(false), []);

  if (operateurs === null) return <Chargement />;

  // --- Application Android direct : paiement envoyé par l'application ---
  if (paiementDirect) return <PaiementDirect paiement={paiementDirect} onTermine={recommencer} />;

  // --- Étape finale : code USSD + QR ---
  if (paiement) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="surtitre">Paiement prêt</p>
        <div className="card"><CarteCodeUssd paiement={paiement} onStatut={changerStatut} /></div>
        <button type="button" onClick={recommencer} className="btn-outline w-full">Nouveau paiement</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Lot 192 : mode hors connexion — dit clairement d'où viennent les informations (jamais de couleur seule : pictogramme + texte) */}
      {horsLigne && (
        <p role="status" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950" data-testid="bandeau-hors-ligne">
          <b>📴 Hors connexion.</b> Les opérateurs, services et marchands viennent de la copie chiffrée gardée sur ce téléphone{horsLigne.depuis ? ` (mise à jour le ${new Date(horsLigne.depuis).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })})` : ""}.
          Vous pouvez payer : le paiement sera transmis au serveur dès que le réseau revient.
        </p>
      )}
      {/* Widget « Aujourd'hui » : météo, prochaine prise, paiements et anniversaires proches (lot 41) */}
      <WidgetAujourdhui />
      {/* Annonces de la régie SAWALI (carrousel) */}
      <Publicites />
      {/* Fil d'étapes cliquable */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={recommencer} className={operateur ? "text-primary" : "font-semibold"}>1. Opérateur</button>
        <span className="text-gray-300">›</span>
        <button type="button" disabled={!operateur} onClick={() => setService(null)}
          className={service ? "text-primary" : operateur ? "font-semibold" : "text-gray-400"}>2. Service</button>
        <span className="text-gray-300">›</span>
        <span className={service ? "font-semibold" : "text-gray-400"}>3. Montant</span>
        {/* Pictogramme QR code : scanne le QR d'un marchand (le nom reste lu au survol / par les lecteurs d'écran) */}
        <button type="button" onClick={() => setScannerOuvert(true)} className="btn-outline ml-auto grid h-10 w-10 place-items-center !p-0"
          aria-label="Scanner un QR marchand" title="Scanner un QR marchand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4" />
          </svg>
        </button>
      </div>

      {/* Lot 102 : marchands près de vous (géolocalisation activée) — un geste ouvre le paiement avec le marchand choisi */}
      {!operateur && !service && (
        <MarchandsProches accueil onChoisir={(m) => ouvrirDepuisQr(m.operateur, m.service_id || null, m.code)} />
      )}

      {/* Paiement rapide : nouveau code marchand ou liste de tous les marchands (chacun a son opérateur : on passe directement au montant) */}
      {!operateur && !service && (
        <RaccourcisMarchand operateurs={operateurs} onChoisir={(m) => ouvrirDepuisQr(m.operateur, m.service_id || null, m.code)} onNouveau={(op, code) => ouvrirDepuisQr(op, null, code)} />
      )}

      {/* Étape 1 : opérateur — liste déroulante (règle : une liste finie se choisit dans une liste déroulante).
          Quand le paiement rapide est proposé, les AUTRES services (transfert, facture, crédit…) sont repliés : plus de « Opérateur » répété. */}
      {!operateur && !service && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Autres services (transfert, facture, crédit…)</summary>
          <section className="mt-3 space-y-3">
            <h1 className="text-xl font-bold">Avec quel opérateur payez-vous ?</h1>
            {operateurs.length === 0 && <p className="text-gray-500">Aucun opérateur disponible pour le moment.</p>}
            <div>
              <label className="label" htmlFor="choix-operateur">Opérateur</label>
              <SelecteurOperateur id="choix-operateur" className="text-lg" valeur="" onChange={(v) => v && choisirOperateur(v)} options={operateurs} disabled={operateurs.length === 0} />
            </div>
          </section>
        </details>
      )}

      {/* Étape 2 : service — liste déroulante du catalogue de l'opérateur */}
      {operateur && !service && (
        <section className="space-y-3">
          <h1 className="text-2xl font-bold">{operateur} : que voulez-vous faire ?</h1>
          <div>
            <label className="label" htmlFor="choix-service">Service</label>
            <select id="choix-service" className="input text-lg" defaultValue=""
              onChange={(e) => { const s = services.find((x) => x.id === e.target.value); if (s) choisirService(s); }}>
              <option value="" disabled>Choisir un service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.nom} — {CATEGORIES[s.categorie] || s.categorie}</option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* Étape 3 : formulaire */}
      {service && (
        <form onSubmit={preparer} className="card space-y-4">
          <div className="flex items-center gap-2">
            <span className="badge text-white" style={{ background: couleurOperateur(operateur) }}>{operateur}</span>
            <h1 className="text-xl font-bold">{service.nom}</h1>
          </div>

          {service.champs.filter((c) => c.key !== "pin").map((c) => (      /* le code secret n'est JAMAIS saisi ici : fenêtre de sécurité de l'application */
            <div key={c.key}>
              <label className="label" htmlFor={`champ-${c.key}`}>{c.label}{numeroFige && c.key === "phone" ? " 🔒 (contact)" : ""}</label>
              <input id={`champ-${c.key}`} className={`input ${c.key === "amount" ? "text-lg font-semibold" : "font-mono"} ${numeroFige && c.key === "phone" ? "bg-gray-100 text-gray-600" : ""}`}
                disabled={numeroFige && c.key === "phone"}          /* numéro du contact (fiche de rappel) : grisé */
                autoFocus={c.key === "amount" && (!!codeMarchand || numeroFige)}   /* marchand déjà choisi : le curseur est sur le montant */
                required inputMode={c.type === "numeric" ? "numeric" : "text"} pattern={c.type === "numeric" ? "[0-9 ]*" : undefined}
                list={c.isMerchantCode ? "marchands-connus" : undefined}
                value={valeurs[c.key] || ""} onChange={(e) => { if (c.key === "amount") setMontantVocal(null); setValeurs({ ...valeurs, [c.key]: e.target.value }); }} />

              {/* Lecture optique : photo d'un afficheur client ou d'une facture (papier ou à l'écran) ; le montant choisi est TOUJOURS redemandé avant l'envoi */}
              {c.key === "amount" && capacites()?.voix && (
                <div className="mt-2 space-y-2" data-testid="voix-montant">
                  <button type="button" className="btn-secondary" onClick={direLeMontant} disabled={voix.enCours}>🎙️ Dire le montant</button>
                  {voix.propositions.length > 0 && (() => {
                    const meilleure = voix.propositions[0];
                    return (
                      <div className="rounded-2xl border-2 border-green-600 bg-green-50 p-3" role="group" aria-label="Montant compris">
                        <p className="text-xs font-bold uppercase tracking-wide text-green-800">J'ai compris</p>
                        <p className="text-3xl font-extrabold text-blue-900">{meilleure.valeur.toLocaleString("fr-FR")} FCFA</p>
                        <p className="text-lg italic text-gray-700">{enLettres(meilleure.valeur)} francs</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="btn-primary" onClick={() => validerVocal(meilleure.valeur)}>✅ C'est bien ce montant</button>
                          <button type="button" className="btn-secondary" onClick={direLeMontant}>🎙️ Redire</button>
                        </div>
                        {voix.propositions.slice(1).map((p) => (
                          <button key={p.valeur} type="button" className="mt-2 mr-2 rounded-xl border border-gray-300 bg-white px-3 py-1 text-sm" onClick={() => validerVocal(p.valeur)}>
                            ou {p.valeur.toLocaleString("fr-FR")} FCFA <span className="text-gray-500">({enLettres(p.valeur)})</span>
                          </button>))}
                      </div>);
                  })()}
                </div>)}
              {c.key === "amount" && capacites()?.ocr && (
                <div className="mt-2 space-y-2" data-testid="lecture-montant">
                  <button type="button" className="btn-secondary" onClick={lireLeMontant} disabled={lecture.enCours}>📷 Lire le montant (afficheur ou facture)</button>
                  {lecture.montants.length > 0 && (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Montants lus">
                      {lecture.montants.map((m, i) => (
                        <button key={m.valeur} type="button" title={m.ligne}
                          className={`rounded-xl border px-3 py-2 text-left text-sm ${i === 0 ? "border-green-600 bg-green-50 font-bold text-green-800" : "border-gray-300 bg-white"}`}
                          onClick={() => { setValeurs((v) => ({ ...v, [c.key]: String(m.valeur) })); setLecture({ enCours: false, montants: [] }); toast.succes(`Montant choisi : ${m.texte}. Vérifiez-le : il vous sera redemandé.`); }}>
                          {i === 0 ? "✅ " : ""}{m.texte}<span className="block text-xs font-normal text-gray-500">{m.ligne.slice(0, 40)}</span>
                        </button>))}
                    </div>)}
                </div>)}

              {/* Lot 102 : les marchands de cet opérateur près de vous, à choisir à la place de la saisie du code */}
              {c.isMerchantCode && !(valeurs[c.key] || "") && (
                <div className="mt-2"><MarchandsProches operateur={operateur} titre="📍 Près de vous" onChoisir={(m) => setValeurs((v) => ({ ...v, [c.key]: m.code }))} /></div>
              )}

              {/* Résolution du code marchand */}
              {c.isMerchantCode && marchand?.trouve && (
                <p className="mt-1 text-sm text-green-700">✓ {marchand.libelle}</p>
              )}
              {/* Lot 106 : ce marchand a son propre service de paiement (ex. *144*10* au lieu de *144*4*) : on le propose */}
              {c.isMerchantCode && marchand?.trouve && marchand.service_id && marchand.service_id !== service.id && services.find((s) => s.id === marchand.service_id) && (
                <div className="mt-1 rounded-lg bg-sky-50 p-2 text-sm text-sky-900" data-testid="service-conseille">
                  Ce marchand se paie avec « {services.find((s) => s.id === marchand.service_id).nom} » ({services.find((s) => s.id === marchand.service_id).gabarit_ussd}).{" "}
                  <button type="button" className="font-semibold underline" onClick={() => choisirService(services.find((s) => s.id === marchand.service_id), { [services.find((s) => s.id === marchand.service_id).champs.find((x) => x.isMerchantCode).key]: codeMarchand })}>Utiliser ce service</button>
                </div>
              )}
              {c.isMerchantCode && marchand && !marchand.trouve && (
                <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm">
                  <p className="text-amber-900">Code inconnu. Donnez-lui un nom pour le reconnaître la prochaine fois :</p>
                  <div className="mt-2 flex gap-2">
                    <input className="input" placeholder="Ex. : Pharmacie du Marché" value={nouveauLibelle}
                      onChange={(e) => setNouveauLibelle(e.target.value)} />
                    <button type="button" className="btn-outline" disabled={nouveauLibelle.trim().length < 2}
                      onClick={enregistrerMarchand}>Enregistrer</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* Suggestions : marchands déjà connus pour cet opérateur */}
          <datalist id="marchands-connus">
            {marchandsConnus.map((m) => <option key={m.code} value={m.code}>{m.libelle}</option>)}
          </datalist>

          {/* Mode de paiement : après le montant (clavier numéroteur par défaut ; PI-SPI si le marchand l'accepte) */}
          {champMarchand && (
            <fieldset className="space-y-2">
              <legend className="label">Mode de paiement</legend>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={mode === "clavier"} onClick={() => setMode("clavier")}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-left text-sm ${mode === "clavier" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-300 bg-white"}`}>
                  <LogoMode mode="clavier" /><span className="font-semibold leading-tight">Clavier numéroteur</span>
                </button>
                <button type="button" aria-pressed={mode === "pispi"} disabled={!pispiDispo?.disponible} onClick={() => setMode("pispi")}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${mode === "pispi" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-300 bg-white"}`}>
                  <LogoMode mode="pispi" /><span className="font-semibold leading-tight">PI-SPI<span className="block text-xs font-normal text-gray-500">virement bancaire</span></span>
                </button>
              </div>
              {codeMarchand.length >= 3 && pispiDispo && !pispiDispo.disponible && <p className="text-xs text-gray-500">Ce marchand n'accepte pas encore PI-SPI.</p>}
              {pispiDispo?.disponible && <p className="text-xs text-green-700">✓ {pispiDispo.nom} accepte PI-SPI ({pispiDispo.banque}).</p>}
            </fieldset>
          )}

          {/* Lot 217 : où j'en suis par rapport à mon budget, avec ce paiement (affiché seulement si le budget est activé) */}
          <NiveauBudget n={niveau} detail />
          <button type="submit" className="btn-primary w-full py-3 text-base" disabled={envoi}>
            {envoi ? "Préparation…" : mode === "pispi" ? "Payer par PI-SPI →" : directEligible ? "💳 Payer maintenant →" : "Préparer le paiement →"}
          </button>
        </form>
      )}

      {/* Lot 217 : alerte de dépassement du budget — forcer ou annuler */}
      <Modal ouvert={!!alerteBudget} titre="⛔ Ce paiement dépasserait votre budget" onFermer={() => setAlerteBudget(null)}>
        <div className="space-y-3 text-sm" data-testid="alerte-budget">
          <NiveauBudget n={alerteBudget} detail />
          <p>Voulez-vous quand même faire ce paiement ? Il sera compté dans votre budget.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => preparer(null, true)}>⚠️ Forcer le paiement</button>
            <button type="button" className="btn-secondary" onClick={() => setAlerteBudget(null)}>✖ Annuler</button>
          </div>
        </div>
      </Modal>
      <PaiementPispi donnees={pispiOuvert} onFermer={() => setPispiOuvert(null)} onTermine={() => { /* le paiement reste dans l'historique */ }} />
      <ScannerQr ouvert={scannerOuvert} onFermer={fermerScanner} onResultat={surScan} />
      {/* QR d'une plaque d'opérateur : code marchand mémorisé ou à saisir une fois */}
      <QrOperateur qr={qrOperateur} onFermer={() => setQrOperateur(null)}
        onUtiliser={(op, code) => { setQrOperateur(null); ouvrirDepuisQr(op, null, code); }} />
    </div>
  );
}
