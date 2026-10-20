import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChampTelephone from "@/components/ChampTelephone";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";

// Anniversaires à souhaiter (lot 34) : liste personnelle de 30 personnes au plus.
// Le serveur trie du plus proche au plus lointain et calcule les jours restants et l'âge.
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const VIDE = { nom: "", jour: "", mois: "", annee: "", telephone: "", note: "" };

// Libellé de l'échéance : « Aujourd'hui », « Demain », « dans 12 jours »
const echeance = (n) => (n === 0 ? "Aujourd'hui 🎉" : n === 1 ? "Demain" : `dans ${n} jours`);

export default function Anniversaires() {
  const toast = useToast();
  const navigate = useNavigate();
  const [donnees, setDonnees] = useState(null);   // { fiches, total, maximum, aujourdhui }
  const [edition, setEdition] = useState(null);   // fiche en cours de saisie (id absent = nouvelle)
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      setDonnees((await apiClient.get("/anniversaires")).data);
    } catch (err) {
      toast.erreur(messageErreur(err, "Liste indisponible"));
      setDonnees((d) => d || { fiches: [], total: 0, maximum: 30, aujourdhui: 0 });
    }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  // Enregistrement (création ou modification)
  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const corps = { nom: edition.nom, jour: Number(edition.jour), mois: Number(edition.mois),
      annee: edition.annee ? Number(edition.annee) : null, telephone: edition.telephone || null, note: edition.note || null };
    try {
      if (edition.id) await apiClient.put(`/anniversaires/${edition.id}`, corps);
      else await apiClient.post("/anniversaires", corps);
      toast.succes("Enregistré");
      setEdition(null);
      charger();
    } catch (err) {
      toast.erreur(messageErreur(err, "Enregistrement impossible"));
    } finally { setEnvoi(false); }
  };

  const supprimer = async (f) => {
    if (!window.confirm(`Supprimer l'anniversaire de ${f.nom} ?`)) return;
    try { await apiClient.delete(`/anniversaires/${f.id}`); charger(); } catch (err) { toast.erreur(messageErreur(err)); }
  };

  // Message de vœux envoyé par WhatsApp (numéro enregistré) : le texte est proposé, l'utilisateur envoie
  const lienWhatsApp = (f) => {
    const texte = `Joyeux anniversaire ${f.nom} ! 🎉 Je te souhaite une journée merveilleuse et une excellente année.`;
    return `https://wa.me/${f.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(texte)}`;
  };

  // Lot 83 — lien avec les cartes virtuelles : ouvre « Cartes virtuelles » déjà remplie (occasion, prénom, WhatsApp, message) ;
  // la date d'envoi proposée est le jour de l'anniversaire (la carte peut y être programmée).
  const faireUneCarte = (f) => navigate("/cartes", { state: { prefill: {
    occasion: "Anniversaire", destinataire: f.nom, telephone: f.telephone || "", dateEnvoi: f.prochain,
    message: `Joyeux anniversaire ${f.nom} ! Je te souhaite une journée merveilleuse et une excellente année.`.slice(0, 300) } } });

  if (!donnees) return <Chargement />;
  const complet = donnees.total >= donnees.maximum;
  const champ = (cle) => (e) => setEdition({ ...edition, [cle]: e.target.value });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🎂 Anniversaires à souhaiter</h1>
          <p className="text-sm text-gray-500" data-testid="compteur">{donnees.total} / {donnees.maximum} personnes</p>
        </div>
        <button type="button" className="btn-primary" disabled={complet} onClick={() => setEdition({ ...VIDE })}
          title={complet ? `Liste complète : ${donnees.maximum} personnes au maximum` : undefined}>+ Ajouter</button>
      </div>
      {complet && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Liste complète : supprimez une personne pour en ajouter une autre.</p>}
      {donnees.aujourdhui > 0 && (
        <p className="rounded-lg bg-primary p-3 text-sm font-semibold text-white">
          🎉 {donnees.aujourdhui === 1 ? "1 anniversaire" : `${donnees.aujourdhui} anniversaires`} à souhaiter aujourd'hui !
        </p>
      )}

      {donnees.fiches.length === 0 && <p className="card text-gray-500">Aucun anniversaire enregistré. Ajoutez vos proches pour ne plus les oublier.</p>}
      <ul className="space-y-2">
        {donnees.fiches.map((f) => (
          <li key={f.id} className={`card flex items-center gap-3 p-3 ${f.dans_jours === 0 ? "ring-2 ring-primary" : ""}`}>
            {/* Pastille de date : jour et mois */}
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-creme text-center leading-tight">
              <span className="text-xl font-bold tabular-nums">{f.jour}</span>
              <span className="text-[10px] font-semibold uppercase text-gray-500">{MOIS[f.mois - 1].slice(0, 4)}.</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{f.nom}</p>
              <p className={`text-sm ${f.dans_jours <= 1 ? "font-semibold text-primary" : "text-gray-600"}`}>
                {echeance(f.dans_jours)}{f.age ? ` · ${f.age} ans` : ""}
              </p>
              {f.note && <p className="truncate text-xs text-gray-500">{f.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {f.telephone && (
                <a href={lienWhatsApp(f)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm" title="Souhaiter par WhatsApp">🎉</a>
              )}
              <button type="button" className="btn-outline btn-sm" title="Créer une carte d'anniversaire" aria-label={`Carte pour ${f.nom}`} onClick={() => faireUneCarte(f)} data-testid="anniv-carte">💌</button>
              <button type="button" className="btn-outline btn-sm" aria-label={`Modifier ${f.nom}`}
                onClick={() => setEdition({ id: f.id, nom: f.nom, jour: String(f.jour), mois: String(f.mois), annee: f.annee ? String(f.annee) : "",
                  telephone: f.telephone || "", note: f.note || "" })}>✏️</button>
              <button type="button" className="btn-outline btn-sm" aria-label={`Supprimer ${f.nom}`} onClick={() => supprimer(f)}>🗑</button>
            </div>
          </li>
        ))}
      </ul>

      <Modal ouvert={!!edition} titre={edition?.id ? "Modifier l'anniversaire" : "Nouvel anniversaire"} onFermer={() => setEdition(null)}>
        {edition && (
          <form onSubmit={enregistrer} className="space-y-3">
            <div>
              <label className="label" htmlFor="an-nom">Nom</label>
              <input id="an-nom" className="input" required maxLength={60} value={edition.nom} onChange={champ("nom")} autoFocus />
            </div>
            {/* Jour et mois : listes déroulantes (valeurs en nombre fini) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="an-jour">Jour</label>
                <select id="an-jour" className="input" required value={edition.jour} onChange={champ("jour")}>
                  <option value="" disabled>Jour…</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="an-mois">Mois</label>
                <select id="an-mois" className="input" required value={edition.mois} onChange={champ("mois")}>
                  <option value="" disabled>Mois…</option>
                  {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="an-annee">Année de naissance <span className="font-normal text-gray-400">(facultatif, pour l'âge)</span></label>
              <input id="an-annee" className="input" type="number" inputMode="numeric" min={1900} max={new Date().getFullYear()} placeholder="Ex. 1990"
                value={edition.annee} onChange={champ("annee")} />
            </div>
            <div>
              <label className="label" htmlFor="an-tel">Téléphone <span className="font-normal text-gray-400">(facultatif, pour écrire sur WhatsApp)</span></label>
              <ChampTelephone key={edition.id || "nouveau"} id="an-tel" valeur={edition.telephone} onChange={(v) => setEdition((x) => ({ ...x, telephone: v }))} />
            </div>
            <div>
              <label className="label" htmlFor="an-note">Note <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="an-note" className="input" maxLength={120} placeholder="Ex. Mon frère, collègue…" value={edition.note} onChange={champ("note")} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setEdition(null)}>Annuler</button>
              <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Patientez…" : "Enregistrer"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
