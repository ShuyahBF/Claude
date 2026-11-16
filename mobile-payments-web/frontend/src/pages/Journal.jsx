import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import {
  HUMEURS, MENTIONS, VERSION_MENTIONS, accordDonne, chargerEntrees, cleDuJournal, dateAccord, donnerAccord, echangesPourLiluvine,
  enregistrerEntree, filtrerEntrees, retirerAccord, supprimerEntree, toutEffacer,
} from "@/lib/journalIntime";

// Journal intime + Liluvine, ma coach (lot 166).
//  - Écrits GARDÉS SUR LE TÉLÉPHONE, chiffrés (lib/journalIntime.js) : aucun serveur n'en garde de copie.
//  - Rien ne s'ouvre avant que l'utilisateur ait lu et APPROUVÉ LUI-MÊME les mentions (deux accords : le journal, puis Liluvine).
//  - Détails et corrections s'ouvrent dans une FENÊTRE MODALE (règle 20) ; chaque action porte un pictogramme et une légende (règle 15).
const dateLongue = (ms) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
const jourCourt = (ms) => new Date(ms).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const humeurDe = (id) => HUMEURS.find((h) => h.id === id);

/** Écran des mentions : l'utilisateur doit cocher lui-même, puis appuyer sur le bouton d'approbation. */
function Mentions({ qui, titre, introduction, onApprouve, onRefuse }) {
  const [coche, setCoche] = useState(false);
  return (
    <div className="card space-y-3" data-testid={`mentions-${qui}`}>
      <h2 className="text-lg font-semibold">{titre}</h2>
      <p className="text-sm text-gray-600">{introduction}</p>
      <ul className="space-y-2">
        {MENTIONS[qui].map((m) => (
          <li key={m.titre} className="rounded-xl border border-gray-200 p-3 text-sm">
            <p className="font-semibold">{m.icone} {m.titre}</p>
            <p className="mt-1 text-gray-700">{m.texte}</p>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2 text-sm font-semibold">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={coche} onChange={(e) => setCoche(e.target.checked)} data-testid={`case-${qui}`} />
        <span>J'ai lu ces mentions et je les approuve moi-même.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!coche} onClick={onApprouve} data-testid={`approuver-${qui}`}>✅ J'approuve et je commence</button>
        {onRefuse && <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={onRefuse}>↩️ Pas maintenant</button>}
      </div>
    </div>
  );
}

export default function Journal() {
  const toast = useToast();
  const [accordJournal, setAccordJournal] = useState(() => accordDonne("journal"));
  const [accordLiluvine, setAccordLiluvine] = useState(() => accordDonne("liluvine"));
  const [onglet, setOnglet] = useState("journal");                   // journal | liluvine
  const [cle, setCle] = useState(null);
  const [erreurCle, setErreurCle] = useState("");
  const [entrees, setEntrees] = useState([]);
  const [filtre, setFiltre] = useState({ texte: "", humeur: "", du: "", au: "" });
  const [edition, setEdition] = useState(null);                       // entrée ouverte dans la fenêtre : { id?, quand, humeur, texte }
  const [confirmEffacer, setConfirmEffacer] = useState(false);

  // Clé du journal (créée à la première ouverture, gardée dans l'appareil)
  useEffect(() => {
    if (!accordJournal) return;
    cleDuJournal().then(setCle).catch(() => setErreurCle("Ce navigateur ne permet pas de garder un journal chiffré sur le téléphone."));
  }, [accordJournal]);
  const relire = useCallback(async (k = cle) => { if (k) setEntrees(await chargerEntrees(k)); }, [cle]);
  useEffect(() => { relire(); }, [relire]);

  const affichees = useMemo(() => filtrerEntrees(entrees, filtre), [entrees, filtre]);
  const modif = (champ) => (e) => setFiltre((f) => ({ ...f, [champ]: e.target.value }));

  const enregistrer = async () => {
    if (!edition?.texte?.trim()) { toast.erreur("Écrivez quelques mots avant d'enregistrer."); return; }
    toast.info("Enregistrement en cours…");
    const id = await enregistrerEntree(cle, { ...edition, texte: edition.texte.trim() });
    if (!id) { toast.erreur("Enregistrement impossible : l'espace du téléphone est peut-être plein."); return; }
    toast.succes("Entrée enregistrée (chiffrée sur ce téléphone).");
    setEdition(null); await relire();
  };
  const supprimer = async () => {
    if (!edition?.id) return;
    if (!window.confirm("Effacer définitivement cette entrée ? Elle ne pourra pas être retrouvée.")) return;
    supprimerEntree(edition.id); toast.succes("Entrée effacée."); setEdition(null); await relire();
  };
  const effacerTout = () => { toutEffacer(); setConfirmEffacer(false); setEntrees([]); toast.succes("Tout le journal a été effacé de ce téléphone."); };

  // ---- 1. Mentions du journal : rien ne s'ouvre avant l'accord de l'utilisateur ----
  if (!accordJournal) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">📔 Mon Journal Intime</h1>
        <Mentions qui="journal" titre="Avant de commencer" introduction="Votre journal est un espace très personnel. Lisez ces quelques points, puis approuvez-les pour l'ouvrir."
          onApprouve={() => { if (donnerAccord("journal")) { setAccordJournal(true); toast.succes("Merci : votre journal est ouvert."); } else toast.erreur("Impossible de garder votre accord sur ce téléphone."); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">📔 Mon Journal Intime</h1>
        <div className="flex gap-2" role="tablist">
          <button type="button" role="tab" aria-selected={onglet === "journal"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${onglet === "journal" ? "bg-primary text-white" : "border border-gray-300"}`} onClick={() => setOnglet("journal")}>📖 Mon journal</button>
          <button type="button" role="tab" aria-selected={onglet === "liluvine"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${onglet === "liluvine" ? "bg-primary text-white" : "border border-gray-300"}`} onClick={() => setOnglet("liluvine")}>💬 Liluvine, ma coach</button>
        </div>
      </div>
      {erreurCle && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{erreurCle}</p>}

      {onglet === "journal" && (
        <div className="space-y-3">
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">🔒 Gardé uniquement sur ce téléphone, chiffré. Personne d'autre ne peut le lire.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!cle} onClick={() => setEdition({ quand: Date.now(), humeur: "serein", texte: "" })} data-testid="nouvelle-entree">✍️ Écrire aujourd'hui</button>
          </div>
          {entrees.length > 0 && (
            <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2" data-testid="filtres-journal">
              <input type="search" className="input" placeholder="🔎 Chercher dans mon journal" aria-label="Chercher dans mon journal" value={filtre.texte} onChange={modif("texte")} />
              <select className="input" aria-label="Humeur" value={filtre.humeur} onChange={modif("humeur")}>
                <option value="">🙂 Toutes les humeurs</option>{HUMEURS.map((h) => <option key={h.id} value={h.id}>{h.icone} {h.libelle}</option>)}
              </select>
              <div className="flex items-center gap-1 text-xs text-gray-600 sm:col-span-2">
                <label htmlFor="j-du">📅 Du</label><input id="j-du" type="date" className="input min-w-0 flex-1" value={filtre.du} onChange={modif("du")} />
                <label htmlFor="j-au">au</label><input id="j-au" type="date" className="input min-w-0 flex-1" value={filtre.au} onChange={modif("au")} />
              </div>
              <p className="text-sm text-gray-600 sm:col-span-2"><b>{affichees.length}</b> entrée(s) sur {entrees.length}</p>
            </div>
          )}
          {entrees.length === 0 && <p className="text-sm text-gray-600">Votre journal est vide. Appuyez sur « Écrire aujourd'hui » pour votre première page.</p>}
          <ul className="space-y-2" data-testid="entrees-journal">
            {affichees.map((e) => (
              <li key={e.id}>
                <button type="button" className="w-full rounded-xl border border-gray-200 p-3 text-left hover:bg-sky-50" onClick={() => setEdition(e)} aria-label={`Ouvrir l'entrée du ${dateLongue(e.quand)}`}>
                  <span className="flex items-center gap-2 text-xs text-gray-500"><span className="text-base">{humeurDe(e.humeur)?.icone || "📝"}</span><span className="font-semibold text-primary">{jourCourt(e.quand)}</span><span>{humeurDe(e.humeur)?.libelle}</span></span>
                  <span className="mt-1 line-clamp-2 block text-sm text-gray-800">{e.texte}</span>
                </button>
              </li>
            ))}
          </ul>
          <details className="rounded-xl border border-gray-200 p-3 text-sm">
            <summary className="cursor-pointer font-semibold">⚙️ Mes accords et mon journal</summary>
            <div className="mt-2 space-y-2">
              <p>Journal approuvé le <b>{dateAccord("journal") ? dateLongue(new Date(dateAccord("journal")).getTime()) : "—"}</b> (mentions version {VERSION_MENTIONS}).</p>
              <p>Liluvine : {accordLiluvine ? <>approuvée le <b>{dateLongue(new Date(dateAccord("liluvine")).getTime())}</b></> : "pas encore approuvée."}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 font-semibold" onClick={() => { retirerAccord("journal"); retirerAccord("liluvine"); setAccordJournal(false); setAccordLiluvine(false); toast.succes("Accord retiré : le journal se fermera. Vos écrits restent sur ce téléphone."); }}>🚫 Retirer mon accord</button>
                <button type="button" className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700" onClick={() => setConfirmEffacer(true)}>🗑️ Effacer tout mon journal</button>
              </div>
            </div>
          </details>
        </div>
      )}

      {onglet === "liluvine" && (accordLiluvine
        ? <Liluvine cle={cle} onGardee={async (texte) => { const id = await enregistrerEntree(cle, { quand: Date.now(), humeur: "serein", texte }); if (id) { toast.succes("Conversation gardée dans votre journal."); await relire(); } else toast.erreur("Enregistrement impossible."); }} />
        : <Mentions qui="liluvine" titre="Avant de parler à Liluvine" introduction="Liluvine est une coach par intelligence artificielle. Lisez comment elle fonctionne, puis approuvez pour lui écrire."
            onApprouve={() => { if (donnerAccord("liluvine")) { setAccordLiluvine(true); toast.succes("Merci : vous pouvez écrire à Liluvine."); } else toast.erreur("Impossible de garder votre accord sur ce téléphone."); }}
            onRefuse={() => setOnglet("journal")} />)}

      {/* Fenêtre d'une entrée : écrire, relire, corriger, effacer (règle 20) */}
      <Modal ouvert={!!edition} titre={edition?.id ? "Mon entrée" : "Nouvelle entrée"} onFermer={() => setEdition(null)} large>
        {edition && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">📅 {dateLongue(edition.quand)}</p>
            <div>
              <label className="label" htmlFor="j-humeur">Comment vous sentez-vous ?</label>
              <select id="j-humeur" className="input" value={edition.humeur} onChange={(e) => setEdition({ ...edition, humeur: e.target.value })}>
                {HUMEURS.map((h) => <option key={h.id} value={h.id}>{h.icone} {h.libelle}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="j-texte">Mon texte</label>
              <textarea id="j-texte" className="input min-h-[10rem]" maxLength={8000} placeholder="Écrivez librement, personne d'autre ne le lira…" value={edition.texte} onChange={(e) => setEdition({ ...edition, texte: e.target.value })} data-testid="texte-entree" />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {edition.id && <button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={supprimer}>🗑️ Effacer</button>}
              <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setEdition(null)}>✖️ Fermer</button>
              <button type="button" className="btn-primary" onClick={enregistrer}>💾 Enregistrer</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal ouvert={confirmEffacer} titre="Effacer tout mon journal ?" onFermer={() => setConfirmEffacer(false)}>
        <p className="text-sm">Toutes vos entrées seront effacées de ce téléphone, <b>définitivement</b>. Aucune copie n'existe ailleurs.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setConfirmEffacer(false)}>↩️ Non, garder</button>
          <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white" onClick={effacerTout}>🗑️ Oui, tout effacer</button>
        </div>
      </Modal>
    </div>
  );
}

/** Conversation avec Liluvine : les échanges restent à l'écran (jamais enregistrés ici) ; « Garder dans mon journal » les copie, chiffrés, dans le journal. */
function Liluvine({ onGardee }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);              // { role, content, urgence? }
  const [saisie, setSaisie] = useState("");
  const [attente, setAttente] = useState(false);
  const [refus, setRefus] = useState(null);                  // { message, formule } : abonnement requis
  const [essais, setEssais] = useState(null);
  const bas = useRef(null);
  useEffect(() => { bas.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [messages, attente]);

  const envoyer = async () => {
    const texte = saisie.trim();
    if (!texte || attente) return;
    const suite = [...messages, { role: "user", content: texte }];
    setMessages(suite); setSaisie(""); setAttente(true); setRefus(null);
    try {
      const { data } = await apiClient.post("/journal-intime/liluvine", { messages: echangesPourLiluvine(suite), consentement: true, version_mentions: VERSION_MENTIONS });
      setMessages([...suite, { role: "assistant", content: data.reponse, urgence: !!data.urgence }]);
      if (data.essais_restants != null) setEssais(data.essais_restants);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object") setRefus(detail);
      else toast.erreur(messageErreur(err, "Liluvine ne peut pas répondre pour le moment."));
      setMessages(messages); setSaisie(texte);            // l'échange n'a pas eu lieu : on rend son message à l'utilisateur pour qu'il puisse le renvoyer
    } finally { setAttente(false); }
  };

  return (
    <div className="space-y-3" data-testid="liluvine">
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">💬 Liluvine est une assistante par intelligence artificielle : elle écoute et conseille, elle ne remplace pas un médecin ni un proche. N'écrivez ici ni mot de passe ni code PIN.</p>
      {essais != null && <p className="text-xs text-gray-600">🎁 Échanges d'essai restants : <b>{essais}</b></p>}
      <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3" aria-live="polite">
        {messages.length === 0 && <p className="text-sm text-gray-500">Dites-lui comment s'est passée votre journée, ce qui vous pèse ou ce qui vous rend heureux.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-white" : m.urgence ? "bg-red-100 text-red-900" : "bg-gray-100 text-gray-900"}`}>
            {m.role === "assistant" && <span className="mb-1 block text-xs font-semibold">{m.urgence ? "🆘 Liluvine" : "💬 Liluvine"}</span>}
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {attente && <p className="text-sm text-gray-500">⏳ Liluvine réfléchit…</p>}
        <div ref={bas} />
      </div>
      {refus && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="abonnement-requis">
          <p>{refus.message || "Un abonnement est nécessaire pour continuer."}</p>
          <Link to="/abonnement" className="btn-primary btn-sm mt-2 inline-block">🎟️ Voir l'abonnement</Link>
        </div>
      )}
      <div className="flex gap-2">
        <textarea className="input min-h-[3rem] flex-1" maxLength={2000} placeholder="Écrivez à Liluvine…" aria-label="Message pour Liluvine" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        <button type="button" className="btn-primary self-end" disabled={attente || !saisie.trim()} onClick={envoyer} data-testid="envoyer-liluvine">📨 Envoyer</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={messages.length === 0}
                onClick={() => onGardee(messages.map((m) => `${m.role === "user" ? "Moi" : "Liluvine"} : ${m.content}`).join("\n\n"))}>📔 Garder dans mon journal</button>
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={messages.length === 0} onClick={() => { setMessages([]); setRefus(null); toast.succes("Conversation effacée de l'écran."); }}>🧹 Effacer la conversation</button>
      </div>
    </div>
  );
}
