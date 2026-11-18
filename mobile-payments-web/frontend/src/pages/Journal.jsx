import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AvatarLiluvine from "@/components/AvatarLiluvine";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import {
  HUMEURS, MENTIONS, VERSION_MENTIONS, accordDonne, chargerEntrees, cleDuJournal, dateAccord, donnerAccord, echangesPourLiluvine,
  enregistrerEntree, filtrerEntrees, pourUtilisateur, retirerAccord, supprimerEntree, toutEffacer,
} from "@/lib/journalIntime";
import { useAuth } from "@/context/AuthContext";
import { initiativeDuMoment } from "@/lib/liluvineEmotion";
import { etatLiluvine, lireReglage } from "@/lib/liluvineReglage";
import { effacerConversation, envoyerALiluvine, fermerBulle, initiativeDeLiluvine, lierUtilisateur, lireLiluvine, surLiluvine, useLiluvine } from "@/lib/liluvineStore";
import { jouerBulle, reglerSon, sonActif } from "@/lib/sonBulle";

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
  const { user } = useAuth();
  pourUtilisateur(user?.id);
  const { nonLus: nonLusLiluvine } = useLiluvine();
  const liluvineMasquee = etatLiluvine(lireReglage(user?.id)) === "off";          // désactivée dans le profil : son onglet disparaît           // messages non lus de Liluvine : pastille sur son onglet
  lierUtilisateur(user?.id);          // la conversation de Liluvine (en mémoire) est celle du compte connecté seulement          // journal, accords et clé propres au compte connecté (un téléphone peut servir à plusieurs comptes)
  const [accordJournal, setAccordJournal] = useState(() => accordDonne("journal"));
  const [accordLiluvine, setAccordLiluvine] = useState(() => accordDonne("liluvine"));
  const [params] = useSearchParams();
  const [onglet, setOnglet] = useState(params.get("onglet") === "liluvine" && etatLiluvine(lireReglage(user?.id)) !== "off" ? "liluvine" : "journal");   // journal | liluvine
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
          {!liluvineMasquee && <button type="button" role="tab" aria-selected={onglet === "liluvine"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${onglet === "liluvine" ? "bg-primary text-white" : "border border-gray-300"}`} onClick={() => setOnglet("liluvine")}>💬 Liluvine, ma coach{onglet !== "liluvine" && nonLusLiluvine > 0 && <span className="ml-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white" data-testid="pastille-onglet-liluvine" aria-label={`${nonLusLiluvine} message(s) non lu(s)`}>{nonLusLiluvine}</span>}</button>}
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
        ? <Liluvine cle={cle} derniereEntree={entrees[0]?.quand || null} onGardee={async (texte) => { const id = await enregistrerEntree(cle, { quand: Date.now(), humeur: "serein", texte }); if (id) { toast.succes("Conversation gardée dans votre journal."); await relire(); } else toast.erreur("Enregistrement impossible."); }} />
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

/** Conversation avec Liluvine : en mémoire seulement (jamais enregistrée ici, jamais sur un serveur) ; « Garder dans mon journal » la copie, chiffrée, dans le journal.
 *  Elle est horodatée ; l'avatar s'anime (réflexion, réponse, émotion) ; Liluvine écrit parfois la première ; un son et une bulle signalent ses messages. */
const heure = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const jourEntier = (ms) => new Date(ms).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const memeJour = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

function Liluvine({ cle, derniereEntree, onGardee }) {
  const toast = useToast();
  const { messages, attente, essais, refus } = useLiluvine();
  const [saisie, setSaisie] = useState("");
  const [son, setSon] = useState(sonActif());
  const bas = useRef(null);
  // L'écran de Liluvine est affiché : les messages non lus sont lus ; en le quittant, les suivants seront signalés par une bulle et un son
  useEffect(() => { surLiluvine(true); fermerBulle(); return () => surLiluvine(false); }, []);
  // Liluvine écrit PARFOIS la première (au plus une fois toutes les 8 heures, une fois sur deux et demie), une phrase locale : aucun envoi au serveur
  useEffect(() => {
    if (lireLiluvine().messages.length) return;
    if (etatLiluvine(lireReglage(lireLiluvine().utilisateur)) !== "active") return;          // réglage du profil : pas d'initiative si silencieuse ou désactivée
    let derniere = null; try { derniere = Number(localStorage.getItem("mpw_liluvine_initiative")) || null; } catch { /* sans importance */ }
    const i = initiativeDuMoment({ derniereEntree, derniereInitiative: derniere });
    if (i) { initiativeDeLiluvine(i.texte, i.emotion); try { localStorage.setItem("mpw_liluvine_initiative", String(Date.now())); } catch { /* sans importance */ } }
  }, [derniereEntree]);
  useEffect(() => { bas.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [messages, attente]);

  const dernier = messages[messages.length - 1];
  const etat = attente ? "reflexion" : dernier?.role === "assistant" && Date.now() - dernier.quand < 4000 ? "parle" : "repos";
  const emotion = dernier?.role === "assistant" ? dernier.emotion || "calme" : "calme";

  const envoyer = async () => {
    const texte = saisie.trim();
    if (!texte || attente) return;
    setSaisie("");
    const r = await envoyerALiluvine(texte);
    if (!r.ok) { setSaisie(r.texte); if (r.erreur) toast.erreur(r.erreur); }       // l'échange n'a pas eu lieu : on rend son message à l'utilisateur
  };
  const basculerSon = () => { const v = !son; reglerSon(v); setSon(v); if (v) jouerBulle(); toast.succes(v ? "Son activé" : "Son coupé"); };

  return (
    <div className="space-y-3" data-testid="liluvine">
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">💬 Liluvine est une assistante par intelligence artificielle : elle écoute et conseille, elle ne remplace pas un médecin ni un proche. N'écrivez ici aucun code secret ni mot de passe.</p>
      <div className="flex items-center gap-3">
        <AvatarLiluvine etat={etat} emotion={emotion} taille={84} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-primary">Liluvine, ma coach</p>
          <p className="text-sm text-gray-600" aria-live="polite">{attente ? "⏳ Liluvine réfléchit…" : etat === "parle" ? "💬 Liluvine vous répond" : "🌿 Liluvine vous écoute"}</p>
          {essais != null && <p className="text-xs text-gray-600">🎁 Échanges d'essai restants : <b>{essais}</b></p>}
        </div>
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" aria-pressed={son} onClick={basculerSon} title="Son des nouveaux messages">{son ? "🔔 Son activé" : "🔕 Son coupé"}</button>
      </div>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3" aria-live="polite">
        {messages.length === 0 && <p className="text-sm text-gray-500">Dites-lui comment s'est passée votre journée, ce qui vous pèse ou ce qui vous rend heureux.</p>}
        {messages.map((m, i) => (
          <div key={m.id}>
            {(i === 0 || !memeJour(messages[i - 1].quand, m.quand)) && <p className="my-1 text-center text-xs font-semibold capitalize text-gray-500">{jourEntier(m.quand)}</p>}
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-white" : m.urgence ? "bg-red-100 text-red-900" : m.modere ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-900"}`}>
              {m.role === "assistant" && <span className="mb-1 block text-xs font-semibold">{m.urgence ? "🆘 Liluvine" : m.modere ? "🛡️ Liluvine" : "💬 Liluvine"}{m.initiative ? " · écrit la première" : ""}</span>}
              <span className="whitespace-pre-wrap">{m.content}</span>
              <time className={`mt-1 block text-right text-[11px] ${m.role === "user" ? "text-white/80" : "text-gray-500"}`} dateTime={new Date(m.quand).toISOString()}>{heure(m.quand)}</time>
            </div>
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
                onClick={() => onGardee(messages.map((m) => `[${new Date(m.quand).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}] ${m.role === "user" ? "Moi" : "Liluvine"} : ${m.content}`).join("\n\n"))}>📔 Garder dans mon journal</button>
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={messages.length === 0} onClick={() => { effacerConversation(); toast.succes("Conversation effacée de l'écran."); }}>🧹 Effacer la conversation</button>
      </div>
    </div>
  );
}
