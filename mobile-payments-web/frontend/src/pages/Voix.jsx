import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Transcription vocale (lot 42) : on parle (30 secondes au plus), c'est transcrit (abonnés), puis on copie le texte
// (WhatsApp, SMS…). Le navigateur enregistre ; SAWALI contrôle l'abonnement et transcrit. Rien n'est conservé.
const DUREE_MAX_S = 30;

// Format d'enregistrement : webm/opus (Chrome, Firefox), mp4 (Safari) ; débit réduit (voix) = notes légères
function formatEnregistrement() {
  const choix = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return choix.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
}
const enDataUrl = (blob) => new Promise((resolve, reject) => {
  const lecteur = new FileReader();
  lecteur.onload = () => resolve(lecteur.result);
  lecteur.onerror = reject;
  lecteur.readAsDataURL(blob);
});

export default function Voix() {
  const toast = useToast();
  const [etat, setEtat] = useState("repos");          // repos | enregistrement | envoi
  const [secondes, setSecondes] = useState(0);
  const [texte, setTexte] = useState("");
  const [restant, setRestant] = useState(null);
  const [refus, setRefus] = useState(null);            // { message, formule } si abonnement requis
  const [erreur, setErreur] = useState("");
  const enregistreur = useRef(null);
  const flux = useRef(null);
  const morceaux = useRef([]);
  const debut = useRef(0);
  const minuteur = useRef(null);

  const arreterFlux = () => { flux.current?.getTracks().forEach((p) => p.stop()); flux.current = null; clearInterval(minuteur.current); };
  useEffect(() => arreterFlux, []);                    // quitter la page coupe le micro

  // Envoi de la note : le serveur renvoie le texte ou un refus (abonnement, limite du jour)
  const transcrire = useCallback(async (blob, duree) => {
    setEtat("envoi"); setRefus(null); setErreur("");
    try {
      const { data } = await apiClient.post("/voix", { audio: await enDataUrl(blob), duree_s: Math.max(0.5, Math.min(duree, 31)) }, { timeout: 90000 });
      setTexte((t) => (t ? `${t}\n${data.texte}` : data.texte));
      setRestant(data.restant_aujourdhui);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object") setRefus(detail);
      else setErreur(messageErreur(err, "Transcription impossible : réessayez."));
    } finally { setEtat("repos"); }
  }, []);

  const arreter = useCallback(() => { if (enregistreur.current?.state === "recording") enregistreur.current.stop(); }, []);

  const demarrer = async () => {
    setErreur(""); setRefus(null);
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) { setErreur("L'enregistrement vocal n'est pas disponible sur ce navigateur."); return; }
    try {
      flux.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch { setErreur("Micro inaccessible : autorisez-le dans les réglages du navigateur pour ce site."); return; }
    const type = formatEnregistrement();
    const rec = new MediaRecorder(flux.current, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
    enregistreur.current = rec; morceaux.current = []; debut.current = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size) morceaux.current.push(e.data); };
    rec.onstop = () => {
      const duree = (Date.now() - debut.current) / 1000;
      arreterFlux();
      const blob = new Blob(morceaux.current, { type: rec.mimeType || type || "audio/webm" });
      if (blob.size < 500 || duree < 0.6) { setEtat("repos"); setErreur("Note trop courte : maintenez l'enregistrement en parlant."); return; }
      transcrire(blob, duree);
    };
    rec.start();
    setEtat("enregistrement"); setSecondes(0);
    // Compte à rebours : arrêt automatique à 30 secondes
    minuteur.current = setInterval(() => {
      const s = Math.floor((Date.now() - debut.current) / 1000);
      setSecondes(s);
      if (s >= DUREE_MAX_S) arreter();
    }, 250);
  };

  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); toast.succes("Texte copié : collez-le dans WhatsApp"); }
    catch { toast.info("Sélectionnez le texte puis copiez-le."); }
  };
  const partager = () => window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank", "noopener,noreferrer");

  const enReg = etat === "enregistrement";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">🎙️ Transcription vocale</h1>
      <p className="text-sm text-gray-600">Parlez (30 secondes au plus par note) : votre voix est transformée en texte, que vous pouvez copier dans WhatsApp ou ailleurs.</p>

      <section className="card space-y-4 p-5 text-center">
        <button type="button" onClick={enReg ? arreter : demarrer} disabled={etat === "envoi"} aria-pressed={enReg}
          className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-4xl text-white shadow-lg transition ${enReg ? "animate-pulse bg-red-600" : "bg-primary"} disabled:opacity-50`}
          aria-label={enReg ? "Arrêter l'enregistrement" : "Commencer l'enregistrement"}>
          {enReg ? "■" : "🎙️"}
        </button>
        {enReg && (
          <div>
            <p className="text-2xl font-bold tabular-nums">{secondes} s <span className="text-base font-normal text-gray-500">/ {DUREE_MAX_S} s</span></p>
            <div className="mx-auto mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-red-500 transition-all" style={{ width: `${Math.min(100, (secondes / DUREE_MAX_S) * 100)}%` }} /></div>
            <p className="mt-1 text-sm text-gray-500">Touchez ■ pour terminer (arrêt automatique à 30 s).</p>
          </div>
        )}
        {etat === "envoi" && <p className="text-gray-600" role="status">Patientez… transcription en cours</p>}
        {etat === "repos" && !texte && <p className="text-sm text-gray-500">Touchez le micro et parlez.</p>}
        {restant !== null && <p className="text-xs text-gray-400">Notes restantes aujourd'hui : {restant}</p>}
      </section>

      {refus && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="voix-refus">
          <p>{refus.message}</p>
          {refus.formule && <Link to="/abonnement" className="mt-1 inline-block font-semibold text-primary underline">Voir l'abonnement</Link>}
        </div>
      )}
      {erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erreur}</p>}

      {texte && (
        <section className="card space-y-3 p-4" data-testid="voix-texte">
          <label className="label" htmlFor="voix-resultat">Texte (modifiable)</label>
          <textarea id="voix-resultat" className="input min-h-[8rem]" value={texte} onChange={(e) => setTexte(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={copier}>📋 Copier</button>
            <button type="button" className="btn-outline" onClick={partager}>Envoyer par WhatsApp</button>
            <button type="button" className="btn-outline" onClick={() => setTexte("")}>Effacer</button>
          </div>
          <p className="text-xs text-gray-400">Une nouvelle note s'ajoute à la suite du texte. Rien n'est conservé par l'application.</p>
        </section>
      )}
      <p className="text-xs text-gray-500">Service réservé aux abonnés (<Link to="/abonnement" className="underline">voir l'abonnement</Link>), avec un nombre de notes limité par jour.</p>
    </div>
  );
}
