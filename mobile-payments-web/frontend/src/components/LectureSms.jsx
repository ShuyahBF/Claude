import { useEffect, useState } from "react";
import { EVENEMENT_MAJ, lireResume, synchroniserSms } from "@/lib/lectureSms";
import { capacites, notificationsActives, ouvrirReglagesNotifications } from "@/lib/pontAndroid";
import { chargerLignes, estTransaction, filtrerLignes, filtreActif } from "@/lib/smsPaiements";

// Lecture des SMS de paiement (application Android auRor, version « direct » seulement) : bloc REPLIABLE, affiché REPLIÉ avec un récapitulatif
// (opérateur, nombre de SMS lus, nombre de paiements enregistrés, date et heure de la dernière lecture).
// Chaque SMS de paiement devient une LIGNE (date, sens, montant, bénéficiaire, solde, numéro de transaction) GARDÉE SUR LE TÉLÉPHONE : l'historique survit à la suppression des SMS.
// Le texte complet des SMS n'est jamais enregistré et rien n'est envoyé à auRor.
// La lecture se fait aussi AUTOMATIQUEMENT (ouverture, retour dans l'application, chaque minute : LectureSmsAuto) ; ce bloc se met à jour tout seul.
const dateHeure = (ms) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;

export default function LectureSms() {
  const appli = capacites();
  const [jours, setJours] = useState(30);
  const [etat, setEtat] = useState(null);                 // null | "lecture" | { erreur } | { lus, nouvelles }
  const [resume, setResume] = useState(lireResume);       // { le, lus, operateurs: [{ nom, nb }] }
  const [lignes, setLignes] = useState(() => chargerLignes());
  // Filtres de la liste (se cumulent, appliqués tout de suite : rien à enregistrer) : texte/numéro, montant mini/maxi, sens, expéditeur, dates
  const FILTRE_VIDE = { texte: "", min: "", max: "", sens: "tous", adresse: "", du: "", au: "" };
  const [filtre, setFiltre] = useState(FILTRE_VIDE);
  const modif = (champ) => (e) => setFiltre((f) => ({ ...f, [champ]: e.target.value }));
  const affichees = filtrerLignes(lignes, filtre);
  const expediteurs = [...new Set(lignes.map((l) => l.adresse).filter(Boolean))].sort();
  // Seules les vraies transactions comptent ; promo, alerte de banque et message de personne restent affichés avec une pastille grise
  const nbTransactions = lignes.filter(estTransaction).length;
  const nbHorsDecompte = lignes.length - nbTransactions;
  const LIBELLE_CATEGORIE = { promo: "promo", alerte: "alerte", message: "message" };
  // Mise à jour automatique quand la lecture automatique trouve de nouveaux paiements
  useEffect(() => {
    const maj = () => { setLignes(chargerLignes()); setResume(lireResume()); };
    window.addEventListener(EVENEMENT_MAJ, maj);
    return () => window.removeEventListener(EVENEMENT_MAJ, maj);
  }, []);

  const lire = async () => {
    setEtat("lecture");
    const r = await synchroniserSms(jours);
    if (r.erreur) { setEtat({ erreur: r.erreur }); return; }
    setLignes(r.lignes); setResume(r.resume);
    setEtat({ lus: r.lus, nouvelles: r.nouvelles });
  };

  // État de l'accès aux notifications (lecture des paiements application fermée), relu à chaque retour dans l'application (on revient des réglages du téléphone)
  const [notifOk, setNotifOk] = useState(() => notificationsActives());
  useEffect(() => {
    const maj = () => setNotifOk(notificationsActives());
    document.addEventListener("visibilitychange", maj);
    return () => document.removeEventListener("visibilitychange", maj);
  }, []);

  if (!appli?.sms && !appli?.notifications) return null;                      // (après les hooks : règle des hooks de React)

  return (
    <details className="card" data-testid="bloc-sms">
      {/* Récapitulatif toujours visible, même replié */}
      <summary className="cursor-pointer space-y-1">
        <span className="text-lg font-semibold">📩 Mes SMS de paiement</span>
        <span className="block text-sm text-gray-600">
          {resume
            ? <>Dernière lecture : <b>{dateHeure(resume.le)}</b> · <b>{resume.lus}</b> SMS lus · <b>{nbTransactions}</b> paiement(s) enregistré(s){nbHorsDecompte > 0 && <> · {nbHorsDecompte} hors décompte</>}{resume.operateurs.length > 0 && <> · {resume.operateurs.map((o) => `${o.nom} (${o.nb})`).join(", ")}</>}</>
            : lignes.length > 0 ? <><b>{nbTransactions}</b> paiement(s) enregistré(s) sur ce téléphone{nbHorsDecompte > 0 && <> · {nbHorsDecompte} hors décompte</>}</> : "Aucune lecture pour l'instant : dépliez, puis appuyez sur « Lire mes SMS »."}
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        {/* Lecture des paiements application FERMÉE : accès aux notifications (à activer une fois dans les réglages du téléphone) */}
        {appli.notifications && (
          <div className={`flex items-center gap-3 rounded-lg p-3 text-sm ${notifOk ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`} data-testid="notifications-etat">
            <span className="flex-1">{notifOk ? "🔔 Lecture des notifications activée : les paiements reçus application fermée sont repris à l'ouverture." : "🔕 Lecture des notifications désactivée : activez « auRor direct » pour lire les paiements même application fermée."}</span>
            {!notifOk && <button type="button" className="btn-primary btn-sm" onClick={ouvrirReglagesNotifications} title="Ouvrir les réglages « Accès aux notifications »" aria-label="Ouvrir les réglages d'accès aux notifications">🔔 Activer</button>}
          </div>
        )}
        <p className="text-sm text-gray-600">Lecture des SMS de vos opérateurs reçus sur ce téléphone. Les paiements sont gardés sur le téléphone (jamais le texte des SMS) : rien n'est envoyé à auRor.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="label" htmlFor="sms-jours">Période</label>
          <select id="sms-jours" className="input w-auto" value={jours} onChange={(e) => setJours(Number(e.target.value))}>
            {[7, 30, 90, 365].map((j) => <option key={j} value={j}>{j} derniers jours</option>)}
          </select>
          <button type="button" className="btn-primary" onClick={lire} disabled={etat === "lecture"}>
            {etat === "lecture" ? "⏳ Lecture…" : resume ? "🔄 Relire mes SMS" : "📩 Lire mes SMS"}
          </button>
        </div>
        {etat?.erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{etat.erreur}</p>}
        {etat?.lus !== undefined && <p className="text-sm text-gray-600">{etat.lus} SMS lus · {etat.nouvelles} nouveau(x) paiement(s) enregistré(s).</p>}

        {lignes.length > 0 && (
          <div className="space-y-2 rounded-xl bg-gray-50 p-3" data-testid="filtres-sms">
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="search" className="input" placeholder="🔎 Numéro, nom ou référence" aria-label="Chercher un numéro, un nom ou une référence" value={filtre.texte} onChange={modif("texte")} />
              <select className="input" aria-label="Sens du paiement" value={filtre.sens} onChange={modif("sens")}>
                <option value="tous">↕ Tous les SMS</option><option value="recu">↓ Reçus</option><option value="paye">↑ Payés</option><option value="hors">Hors décompte (promo, alerte, message)</option>
              </select>
              <input type="number" inputMode="numeric" min="0" className="input" placeholder="💰 Montant minimum (FCFA)" aria-label="Montant minimum" value={filtre.min} onChange={modif("min")} />
              <input type="number" inputMode="numeric" min="0" className="input" placeholder="💰 Montant maximum (FCFA)" aria-label="Montant maximum" value={filtre.max} onChange={modif("max")} />
              <select className="input" aria-label="Expéditeur" value={filtre.adresse} onChange={modif("adresse")}>
                <option value="">📱 Tous les expéditeurs</option>{expediteurs.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <label htmlFor="sms-du">📅 Du</label><input id="sms-du" type="date" className="input min-w-0 flex-1" value={filtre.du} onChange={modif("du")} />
                <label htmlFor="sms-au">au</label><input id="sms-au" type="date" className="input min-w-0 flex-1" value={filtre.au} onChange={modif("au")} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span data-testid="sms-compte"><b>{affichees.length}</b> SMS sur {lignes.length}{affichees.length > 100 && " (les 100 plus récents sont affichés)"}</span>
              {filtreActif(filtre) && <button type="button" className="btn-sm rounded-lg border border-gray-300 bg-white px-3 py-1 font-semibold" onClick={() => setFiltre(FILTRE_VIDE)} title="Effacer tous les filtres" aria-label="Effacer tous les filtres">🧹 Effacer les filtres</button>}
            </div>
          </div>
        )}
        {lignes.length > 0 && affichees.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Aucun SMS ne correspond à ces filtres.</p>}

        {affichees.length > 0 && (
          <ul className="space-y-2" data-testid="lignes-sms">
            {affichees.slice(0, 100).map((l) => (
              <li key={l.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-nuit-900">{l.adresse}</span>
                  <span>{dateHeure(l.quand)}</span>
                  {estTransaction(l)
                    ? <span className={`rounded-full px-2 py-0.5 font-semibold ${l.genre === "RECETTE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{l.genre === "RECETTE" ? "↓ Reçu" : "↑ Payé"}</span>
                    : <span className="rounded-full bg-gray-200 px-2 py-0.5 font-semibold text-gray-700" title="Ce SMS n'est pas une transaction : il n'est pas compté">{LIBELLE_CATEGORIE[l.categorie] || l.categorie}</span>}
                  <span className={`ml-auto text-base font-bold ${!estTransaction(l) ? "text-gray-500" : l.genre === "RECETTE" ? "text-green-700" : "text-red-700"}`}>{fcfa(l.montant)}</span>
                </div>
                {(l.tiers || l.reference || l.solde != null) && (
                  <p className="mt-1 text-gray-700">
                    {l.tiers && <b>{l.genre === "RECETTE" ? `📞 ${l.tiers}` : l.tiers}</b>}{l.reference && <span className="ml-2 font-mono text-xs text-primary">{l.reference}</span>}{l.solde != null && <span className="ml-2 text-xs text-gray-500">solde {fcfa(l.solde)}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
