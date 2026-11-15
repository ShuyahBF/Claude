import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Agenda Google (lot 140) : chacun lie SON agenda, voit ses prochains rendez-vous et en crée, y compris par note vocale
// (« samedi 8h15 rdv chez le dentiste »). Pour un développeur WinDev : le navigateur parle seulement à CE serveur, qui relaie vers
// la passerelle de SAWALI ; aucun jeton Google ne passe ici. Rien n'est créé sans que l'utilisateur ait relu et confirmé (bouton « Enregistrer »).
const DUREE_MAX_S = 30;
const dateHeure = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso || ""; } };
const formatEnregistrement = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
const enDataUrl = (blob) => new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsDataURL(blob); });

export default function Agenda() {
  const toast = useToast();
  const [etat, setEtat] = useState(null);                 // { lie, email } | null (inconnu)
  const [evenements, setEvenements] = useState([]);
  const [charge, setCharge] = useState(false);
  const [tri, setTri] = useState({ cle: "debut", sens: "asc" });
  const [texte, setTexte] = useState("");                 // note dictée ou tapée
  const [prop, setProp] = useState(null);                 // proposition à relire : { titre, date, heure, minutes, offset, libelle, manque }
  const [enregistrement, setEnregistrement] = useState("repos");   // repos | micro | envoi
  const rec = useRef(null); const flux = useRef(null); const morceaux = useRef([]); const debut = useRef(0); const minuteur = useRef(null);

  // Tout rafraîchissement annonce « en cours » puis le résultat (règle du propriétaire : jamais d'actualisation silencieuse)
  const charger = useCallback(async (annonce = true) => {
    setCharge(true);
    if (annonce) toast.info("Actualisation de l'agenda en cours…");
    try {
      const { data: e } = await apiClient.post("/agenda/etat");
      setEtat(e);
      if (e.lie) {
        const { data } = await apiClient.post("/agenda/evenements", {});
        setEvenements(data.evenements || []);
        if (annonce) toast.succes(`Agenda actualisé : ${(data.evenements || []).length} rendez-vous à venir.`);
      } else { setEvenements([]); if (annonce) toast.succes("Agenda non lié."); }
    } catch (err) { toast.erreur(messageErreur(err, "Agenda indisponible : réessayez.")); }
    finally { setCharge(false); }
  }, [toast]);
  useEffect(() => { charger(false); }, [charger]);
  useEffect(() => () => { flux.current?.getTracks().forEach((p) => p.stop()); clearInterval(minuteur.current); }, []);

  const lier = async () => {
    toast.info("Ouverture de la page d'autorisation Google…");
    try {
      const { data } = await apiClient.post("/agenda/lier");
      window.open(data.url, "_blank", "noopener,noreferrer");
      toast.info("Accordez l'accès sur la page Google, puis revenez ici et touchez « Actualiser ».");
    } catch (err) { toast.erreur(messageErreur(err, "Liaison impossible : réessayez.")); }
  };
  const delier = async () => {
    if (!window.confirm("Retirer la liaison avec votre agenda Google ? Vos rendez-vous resteront dans Google.")) return;
    toast.info("Retrait de la liaison en cours…");
    try { await apiClient.post("/agenda/delier"); toast.succes("Agenda délié."); await charger(false); }
    catch (err) { toast.erreur(messageErreur(err, "Retrait impossible.")); }
  };

  // ---- Dictée : enregistre (30 s au plus), transcrit par le service Voix, puis le texte est ajouté à la note
  const arreter = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const dicter = async () => {
    if (enregistrement === "micro") { arreter(); return; }
    try { flux.current = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast.erreur("Micro inaccessible : autorisez-le dans les réglages."); return; }
    const type = formatEnregistrement();
    const r = new MediaRecorder(flux.current, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
    rec.current = r; morceaux.current = []; debut.current = Date.now();
    r.ondataavailable = (e) => { if (e.data.size) morceaux.current.push(e.data); };
    r.onstop = async () => {
      const duree = (Date.now() - debut.current) / 1000;
      flux.current?.getTracks().forEach((p) => p.stop()); clearInterval(minuteur.current);
      const blob = new Blob(morceaux.current, { type: r.mimeType || type || "audio/webm" });
      if (blob.size < 500 || duree < 0.6) { setEnregistrement("repos"); toast.erreur("Note trop courte : parlez pendant l'enregistrement."); return; }
      setEnregistrement("envoi"); toast.info("Transcription en cours…");
      try {
        const { data } = await apiClient.post("/voix", { audio: await enDataUrl(blob), duree_s: Math.max(0.5, Math.min(duree, 31)) }, { timeout: 90000 });
        setTexte((t) => (t ? `${t} ${data.texte}` : data.texte)); toast.succes("Note transcrite : relisez-la puis touchez « Comprendre ».");
      } catch (err) {
        const d = err?.response?.data?.detail;
        toast.erreur(err?.response?.status === 402 && d?.message ? d.message : messageErreur(err, "Transcription impossible : tapez votre note à la place."));
      } finally { setEnregistrement("repos"); }
    };
    r.start(); setEnregistrement("micro");
    minuteur.current = setInterval(() => { if ((Date.now() - debut.current) / 1000 >= DUREE_MAX_S) arreter(); }, 300);
  };

  // ---- Comprendre la note (jour, heure, titre) ; ne crée rien
  const comprendre = async () => {
    if (!texte.trim()) { toast.erreur("Dictez ou tapez d'abord votre note."); return; }
    toast.info("Analyse de la note en cours…");
    try {
      const { data } = await apiClient.post("/agenda/analyser", { texte: texte.trim() });
      setProp({ titre: data.titre, date: data.debut.slice(0, 10), heure: data.debut.slice(11, 16), minutes: data.duree_minutes || 60, offset: data.debut.slice(19) || "+00:00", libelle: data.libelle, manque: data.manque || [] });
      toast.succes(data.manque?.length ? `À compléter : ${data.manque.join(", ")}.` : "Relisez le rendez-vous puis enregistrez-le.");
    } catch (err) { toast.erreur(messageErreur(err, "Analyse impossible.")); }
  };
  const enregistrer = async () => {
    if (!prop?.titre.trim() || !prop.date || !prop.heure) { toast.erreur("Titre, jour et heure sont nécessaires."); return; }
    const debutIso = `${prop.date}T${prop.heure}:00${prop.offset}`;
    const fin = new Date(new Date(debutIso).getTime() + prop.minutes * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const finIso = `${fin.getUTCFullYear()}-${pad(fin.getUTCMonth() + 1)}-${pad(fin.getUTCDate())}T${pad(fin.getUTCHours())}:${pad(fin.getUTCMinutes())}:00+00:00`;
    toast.info("Enregistrement dans votre agenda en cours…");
    try {
      await apiClient.post("/agenda/creer", { titre: prop.titre.trim(), debut: debutIso, fin: finIso });
      toast.succes(`Rendez-vous enregistré : ${prop.titre.trim()}`);
      setProp(null); setTexte(""); await charger(false);
    } catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible.")); }
  };
  const supprimer = async (e) => {
    if (!window.confirm(`Supprimer « ${e.titre} » de votre agenda ?`)) return;
    toast.info("Suppression en cours…");
    try { await apiClient.post("/agenda/supprimer", { id: e.id }); toast.succes("Rendez-vous supprimé."); await charger(false); }
    catch (err) { toast.erreur(messageErreur(err, "Suppression impossible.")); }
  };

  // ---- Tableau triable (toutes les colonnes) : 1er clic croissant, 2e décroissant, 3e ordre d'origine ; vides en dernier
  const triees = useMemo(() => {
    if (!tri) return evenements;
    const val = (e) => (tri.cle === "debut" ? e.debut || "" : (e[tri.cle] || "").toString().toLowerCase());
    const avec = evenements.filter((e) => val(e) !== ""); const sans = evenements.filter((e) => val(e) === "");
    avec.sort((a, b) => (tri.sens === "desc" ? -1 : 1) * String(val(a)).localeCompare(String(val(b)), "fr", { numeric: true }));
    return [...avec, ...sans];
  }, [evenements, tri]);
  const basculer = (cle) => setTri((t) => (!t || t.cle !== cle ? { cle, sens: "asc" } : t.sens === "asc" ? { cle, sens: "desc" } : null));
  const Th = ({ cle, children }) => (
    <th className="p-2 text-left" aria-sort={tri?.cle === cle ? (tri.sens === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => basculer(cle)} className={`font-semibold ${tri?.cle === cle ? "text-orange-600" : ""}`} title="Trier cette colonne">
        {children} {tri?.cle === cle ? (tri.sens === "asc" ? "▲" : "▼") : <span className="opacity-40">⇅</span>}
      </button>
    </th>
  );

  const micro = enregistrement === "micro";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">📅 Mon agenda</h1>
      <p className="text-sm text-gray-600">Liez votre agenda Google : vous voyez vos prochains rendez-vous et vous en ajoutez en parlant. Vous seul voyez votre agenda.</p>

      {!etat?.lie ? (
        <section className="card space-y-3 p-5" data-testid="agenda-non-lie">
          <p>Votre agenda Google n'est pas encore lié.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={lier}>🔗 Lier mon Google Agenda</button>
            <button type="button" className="btn-secondary" onClick={() => charger(true)} disabled={charge}>🔄 Actualiser</button>
          </div>
          <p className="text-xs text-gray-500">Une page Google s'ouvre : choisissez votre compte et acceptez. Revenez ensuite ici et touchez « Actualiser ».</p>
        </section>
      ) : (<>
        <section className="card space-y-2 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-green-700">✅ Agenda lié</span><span className="text-sm text-gray-600">{etat.email}</span>
            <span className="ml-auto flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => charger(true)} disabled={charge} aria-label="Actualiser l'agenda">🔄 Actualiser</button>
              <button type="button" className="btn-secondary btn-sm" onClick={delier} aria-label="Délier mon agenda">⛓️ Délier</button>
            </span>
          </div>
        </section>

        <section className="card space-y-3 p-5" data-testid="agenda-note">
          <h2 className="text-lg font-semibold">🎙️ Nouveau rendez-vous</h2>
          <div className="flex gap-2">
            <button type="button" onClick={dicter} disabled={enregistrement === "envoi"} aria-pressed={micro}
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl text-white ${micro ? "animate-pulse bg-red-600" : "bg-primary"} disabled:opacity-50`}
              aria-label={micro ? "Arrêter la dictée" : "Dicter une note"}>{micro ? "■" : "🎙️"}</button>
            <textarea className="input flex-1" rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : samedi 8h15 rdv chez le dentiste" aria-label="Note du rendez-vous" />
          </div>
          <button type="button" className="btn-primary" onClick={comprendre} disabled={!texte.trim()}>✨ Comprendre</button>

          {prop && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="agenda-proposition">
              <p className="font-semibold">📌 {prop.libelle}</p>
              {prop.manque.length > 0 && <p className="text-sm text-orange-700">⚠️ À compléter : {prop.manque.join(", ")}.</p>}
              <input className="input" value={prop.titre} onChange={(e) => setProp({ ...prop, titre: e.target.value })} aria-label="Titre" />
              <div className="flex flex-wrap gap-2">
                <input type="date" className="input w-auto" value={prop.date} onChange={(e) => setProp({ ...prop, date: e.target.value, manque: prop.manque.filter((m) => m !== "date") })} aria-label="Jour" />
                <input type="time" className="input w-auto" value={prop.heure} onChange={(e) => setProp({ ...prop, heure: e.target.value, manque: prop.manque.filter((m) => m !== "heure") })} aria-label="Heure" />
                <select className="input w-auto" value={prop.minutes} onChange={(e) => setProp({ ...prop, minutes: Number(e.target.value) })} aria-label="Durée">
                  {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary" onClick={enregistrer} disabled={prop.manque.length > 0}>✅ Enregistrer dans mon agenda</button>
                <button type="button" className="btn-secondary" onClick={() => setProp(null)}>✖️ Annuler</button>
              </div>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">Prochains rendez-vous (14 jours)</h2>
          {triees.length === 0 ? <p className="text-sm text-gray-500">Aucun rendez-vous à venir.</p> : (
            <div className="overflow-x-auto"><table className="tableau w-full text-sm" data-testid="agenda-liste">
              <thead><tr><Th cle="debut">Quand</Th><Th cle="titre">Titre</Th><Th cle="lieu">Lieu</Th><th className="p-2" /></tr></thead>
              <tbody>{triees.map((e) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap p-2 font-medium text-primary">{e.toute_la_journee ? `${e.debut} (journée)` : dateHeure(e.debut)}</td>
                  <td className="p-2">{e.titre}</td><td className="p-2 text-gray-600">{e.lieu || "—"}</td>
                  <td className="p-2 text-right"><button type="button" onClick={() => supprimer(e)} title="Supprimer" aria-label={`Supprimer ${e.titre}`}>🗑️</button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>
      </>)}
    </div>
  );
}
