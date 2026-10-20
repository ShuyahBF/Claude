import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CarteCodeUssd from "@/components/CarteCodeUssd";
import Chargement from "@/components/Chargement";
import Publicites from "@/components/Publicites";
import WidgetAujourdhui from "@/components/WidgetAujourdhui";
import QrOperateur from "@/components/QrOperateur";
import LogoMode from "@/components/LogoMode";
import PaiementPispi from "@/components/PaiementPispi";
import ScannerQr from "@/components/ScannerQr";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import SelecteurOperateur from "@/components/SelecteurOperateur";   // lot 89 : listes d'opérateurs avec logos
import { positionActuelle } from "@/lib/geoloc";
import { apiClient, CATEGORIES, couleurOperateur, messageErreur } from "@/lib/api";
import { analyserQr } from "@/lib/qrOperateurs";

// Parcours de paiement, comme l'app Android :
// Opérateur -> Service -> Formulaire (avec résolution du code marchand) -> Code USSD + QR.
// Un QR code marchand (page Marchands) ouvre cette page avec ?operateur=…&service=…&code=…
export default function Payer() {
  const toast = useToast();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const [operateurs, setOperateurs] = useState(null);
  const [services, setServices] = useState([]);
  const [operateur, setOperateur] = useState("");
  const [service, setService] = useState(null);
  const [valeurs, setValeurs] = useState({});
  const [paiement, setPaiement] = useState(null); // paiement préparé (étape finale)
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

  // Liste des opérateurs au chargement
  useEffect(() => {
    apiClient.get("/operateurs").then(({ data }) => setOperateurs(data)).catch(() => setOperateurs([]));
  }, []);

  // Choix d'un opérateur : chargement de ses services et des marchands déjà connus
  const choisirOperateur = useCallback(async (nom) => {
    setOperateur(nom);
    setService(null);
    setPaiement(null);
    try {
      const [{ data: svc }, { data: mch }] = await Promise.all([
        apiClient.get("/services", { params: { operateur: nom } }),
        apiClient.get("/marchands", { params: { operateur: nom } }),
      ]);
      setServices(svc);
      setMarchandsConnus(mch);
      return svc;
    } catch (err) {
      toast.erreur(messageErreur(err, "Chargement des services impossible"));
      return [];
    }
  }, [toast]);

  // Choix d'un service : formulaire vide (ou pré-rempli par un QR marchand)
  const choisirService = useCallback((svc, preRemplies = {}) => {
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
    const s = svc.find((x) => x.id === idService) || svc.find((x) => x.champs.some((c) => c.isMerchantCode));
    if (s) {
      const cle = s.champs.find((c) => c.isMerchantCode)?.key;
      choisirService(s, cle && code ? { [cle]: code } : {});
    }
  }, [choisirOperateur, choisirService]);

  // Arrivée par le QR code d'un marchand : ?operateur=Orange&service=<id>&code=1234
  useEffect(() => {
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
        .then(({ data }) => setMarchand({ trouve: true, libelle: data.libelle }))
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
  const preparer = async (e) => {
    e.preventDefault();
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
      const { data } = await apiClient.post("/paiements", { service_id: service.id, valeurs, ...(position ? { position } : {}) });
      setPaiement(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.erreur(messageErreur(err, "Préparation impossible"));
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
    setService(null);
    setOperateur("");
    setValeurs({});
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

      {/* Étape 1 : opérateur — liste déroulante (règle : une liste finie se choisit dans une liste déroulante) */}
      {!operateur && (
        <section className="space-y-3">
          <h1 className="text-2xl font-bold">Avec quel opérateur payez-vous ?</h1>
          {operateurs.length === 0 && <p className="text-gray-500">Aucun opérateur disponible pour le moment.</p>}
          <div>
            <label className="label" htmlFor="choix-operateur">Opérateur</label>
            <SelecteurOperateur id="choix-operateur" className="text-lg" valeur="" onChange={(v) => v && choisirOperateur(v)} options={operateurs} disabled={operateurs.length === 0} />
          </div>
        </section>
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

          {service.champs.map((c) => (
            <div key={c.key}>
              <label className="label" htmlFor={`champ-${c.key}`}>{c.label}</label>
              <input id={`champ-${c.key}`} className={`input ${c.key === "amount" ? "text-lg font-semibold" : "font-mono"}`}
                required inputMode={c.type === "numeric" ? "numeric" : "text"} pattern={c.type === "numeric" ? "[0-9 ]*" : undefined}
                list={c.isMerchantCode ? "marchands-connus" : undefined}
                value={valeurs[c.key] || ""} onChange={(e) => setValeurs({ ...valeurs, [c.key]: e.target.value })} />

              {/* Résolution du code marchand */}
              {c.isMerchantCode && marchand?.trouve && (
                <p className="mt-1 text-sm text-green-700">✓ {marchand.libelle}</p>
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

          <button type="submit" className="btn-primary w-full py-3 text-base" disabled={envoi}>
            {envoi ? "Préparation…" : mode === "pispi" ? "Payer par PI-SPI →" : "Préparer le paiement →"}
          </button>
        </form>
      )}

      <PaiementPispi donnees={pispiOuvert} onFermer={() => setPispiOuvert(null)} onTermine={() => { /* le paiement reste dans l'historique */ }} />
      <ScannerQr ouvert={scannerOuvert} onFermer={fermerScanner} onResultat={surScan} />
      {/* QR d'une plaque d'opérateur : code marchand mémorisé ou à saisir une fois */}
      <QrOperateur qr={qrOperateur} onFermer={() => setQrOperateur(null)}
        onUtiliser={(op, code) => { setQrOperateur(null); ouvrirDepuisQr(op, null, code); }} />
    </div>
  );
}
