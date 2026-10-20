import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ChampTelephone from "@/components/ChampTelephone";
import Chargement from "@/components/Chargement";
import Patientez from "@/components/Patientez";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";

// Cartes virtuelles (lot 79) : un thème + un message → l'IA dessine jusqu'à 3 variantes → Liluvine envoie la carte choisie au
// destinataire sur WhatsApp. SAWALI contrôle l'abonnement (formule « Cartes virtuelles ») et dessine ; ce site garde les cartes.
// Occasions proposées (liste finie, règle 10) ; « Autre… » ouvre une saisie libre.
const OCCASIONS = ["Anniversaire", "Mariage", "Naissance", "Réussite à un examen", "Nouveau travail", "Fête religieuse", "Bonne année", "Remerciements", "Prompt rétablissement", "Condoléances", "Retrouvailles"];
const AUTRE = "Autre…";
const VIDE = { style: "illustration", moteur: "standard", occasion: OCCASIONS[0], autre: "", decor: "", message: "", destinataire: "", telephone: "" };

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function Cartes() {
  const toast = useToast();
  // Lot 83 : arrivée depuis « Anniversaires » (bouton 💌) : occasion, prénom, WhatsApp, message et date d'envoi proposés
  const prefill = useLocation().state?.prefill;
  const [liste, setListe] = useState(null);          // { cartes, envoyees_aujourdhui, envois_par_jour, variantes_max }
  const [form, setForm] = useState(() => (prefill ? { ...VIDE, occasion: prefill.occasion || VIDE.occasion, destinataire: prefill.destinataire || "", telephone: prefill.telephone || "", message: prefill.message || "" } : VIDE));
  const [quand, setQuand] = useState(prefill?.dateEnvoi ? "plus_tard" : "maintenant");   // envoi immédiat ou programmé
  const [dateEnvoi, setDateEnvoi] = useState(prefill?.dateEnvoi || "");
  const [carte, setCarte] = useState(null);          // carte ouverte (avec ses variantes)
  const [choix, setChoix] = useState("");            // identifiant de la variante retenue
  const [accord, setAccord] = useState(false);
  const [occupe, setOccupe] = useState("");          // "" | "creation" | "variante" | "envoi"
  const [refus, setRefus] = useState(null);          // { message, formule } si abonnement requis
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    try { setListe((await apiClient.get("/cartes")).data); }
    catch (err) { setErreur(messageErreur(err, "Cartes indisponibles")); setListe((l) => l || { cartes: [], envoyees_aujourdhui: 0, envois_par_jour: 10, variantes_max: 3 }); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // Erreur de l'API : abonnement requis (402) affiché à part, le reste en rouge
  const traiter = (err, repli) => {
    const detail = err?.response?.data?.detail;
    if (err?.response?.status === 402 && detail && typeof detail === "object") setRefus(detail);
    else setErreur(messageErreur(err, repli));
  };
  const ouvrir = (c) => { setCarte(c); setChoix(c.variantes?.[c.variantes.length - 1]?.id || ""); setAccord(false); if (!dateEnvoi) setDateEnvoi(aujourdhui()); };
  const champ = (cle) => (e) => setForm({ ...form, [cle]: e.target.value });

  // Création : le thème envoyé = occasion (ou saisie libre) + décor souhaité
  const creer = async (e) => {
    e.preventDefault();
    setRefus(null); setErreur(""); setOccupe("creation");
    const base = form.occasion === AUTRE ? form.autre.trim() : form.occasion;
    const theme = form.decor.trim() ? `${base} — ${form.decor.trim()}` : base;
    try {
      const { data } = await apiClient.post("/cartes", { theme, style: form.style, moteur: form.moteur, message: form.message, destinataire: form.destinataire, telephone: form.telephone }, { timeout: 150000 });
      ouvrir(data); setForm(VIDE); charger();
    } catch (err) { traiter(err, "La carte n'a pas pu être créée"); } finally { setOccupe(""); }
  };

  const autreVariante = async () => {
    setRefus(null); setErreur(""); setOccupe("variante");
    try {
      const { data } = await apiClient.post(`/cartes/${carte.id}/variante`, null, { timeout: 150000 });
      ouvrir(data);
    } catch (err) { traiter(err, "Variante impossible"); } finally { setOccupe(""); }
  };

  // Envoi immédiat, ou PROGRAMMÉ à la date choisie (ex. le jour de l'anniversaire : la carte part toute seule, dès 8 h)
  const envoyer = async () => {
    const programme = quand === "plus_tard";
    if (programme && (!dateEnvoi || dateEnvoi < aujourdhui())) { setErreur("Choisissez une date d'envoi à partir d'aujourd'hui"); return; }
    setRefus(null); setErreur(""); setOccupe("envoi");
    try {
      await apiClient.post(`/cartes/${carte.id}/envoyer`, { variante_id: choix, accord, ...(programme ? { date_envoi: dateEnvoi } : {}) }, { timeout: 90000 });
      toast.succes(programme ? `Carte programmée : elle partira le ${dateFr(dateEnvoi)}` : `Carte envoyée à ${carte.destinataire}`);
      setCarte(null); charger();
    } catch (err) { traiter(err, "Envoi impossible"); } finally { setOccupe(""); }
  };
  const deprogrammer = async (c) => {
    try { await apiClient.post(`/cartes/${c.id}/deprogrammer`); toast.succes("Programmation annulée : la carte est dans votre liste"); charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Annulation impossible")); }
  };

  const ouvrirExistante = async (c) => {
    try { ouvrir((await apiClient.get(`/cartes/${c.id}`)).data); } catch (err) { setErreur(messageErreur(err, "Carte introuvable")); }
  };
  const supprimer = async (c) => {
    if (!window.confirm(`Supprimer la carte pour ${c.destinataire} ?`)) return;
    try { await apiClient.delete(`/cartes/${c.id}`); if (carte?.id === c.id) setCarte(null); charger(); }
    catch (err) { toast.erreur(messageErreur(err, "Suppression impossible")); }
  };

  if (!liste) return <Chargement />;
  const max = liste.variantes_max;
  return (
    <div className="space-y-5">
      {/* Jauge « Patientez… » pendant que l'IA dessine (20 à 40 secondes) ou que la carte part */}
      <Patientez actif={occupe !== ""} />
      <div>
        <p className="surtitre">Vœux</p>
        <h1 className="mt-1 text-2xl font-bold">Cartes virtuelles</h1>
        <p className="mt-1 text-sm text-gray-600">Choisissez l'occasion, écrivez votre message : l'IA dessine jusqu'à {max} cartes. Vous gardez celle que vous aimez et Liluvine l'envoie sur WhatsApp.</p>
      </div>

      {refus && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="cartes-refus">
          <p>{refus.message}</p>
          {refus.formule && <Link to="/abonnement" className="mt-1 inline-block font-semibold text-primary underline">Voir l'abonnement</Link>}
        </div>
      )}
      {erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erreur}</p>}

      {carte ? (
        <section className="card space-y-4" data-testid="carte-ouverte">
          <div>
            <h2 className="text-lg font-semibold">Pour {carte.destinataire}</h2>
            <p className="text-sm text-gray-600">{carte.theme}</p>
          </div>
          {/* Variantes : un toucher choisit celle à envoyer */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {carte.variantes.map((v, i) => (
              <button type="button" key={v.id} onClick={() => setChoix(v.id)} aria-pressed={choix === v.id}
                className={`overflow-hidden rounded-xl border-2 text-left transition ${choix === v.id ? "border-primary ring-2 ring-primary/30" : "border-gray-200 hover:border-primary-clair"}`}>
                <img src={v.image} alt={`Variante ${i + 1}`} className="aspect-[2/3] w-full object-cover" />
                <span className="block px-2 py-1 text-xs font-semibold">{choix === v.id ? "✔ Variante retenue" : `Variante ${i + 1}`}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {carte.variantes.length < max && (
              <button type="button" className="btn-outline" disabled={occupe !== ""} onClick={autreVariante}>
                Une autre variante ({carte.variantes.length}/{max})
              </button>
            )}
            <button type="button" className="btn-outline" onClick={() => setCarte(null)}>Fermer (la carte reste dans ma liste)</button>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={accord} onChange={(e) => setAccord(e.target.checked)} data-testid="cartes-accord" />
            <span>{carte.destinataire} est d'accord pour recevoir un message de ma part sur WhatsApp ({carte.telephone}).</span>
          </label>
          {/* Quand envoyer : tout de suite ou à une date (anniversaire, fête…) */}
          <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm" data-testid="cartes-quand">
            <label className="flex items-center gap-2"><input type="radio" name="quand" checked={quand === "maintenant"} onChange={() => setQuand("maintenant")} /> Envoyer maintenant</label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="quand" checked={quand === "plus_tard"} onChange={() => setQuand("plus_tard")} /> Programmer l'envoi le
              <input type="date" className="input !w-auto" min={aujourdhui()} value={dateEnvoi} onChange={(e) => { setDateEnvoi(e.target.value); setQuand("plus_tard"); }} aria-label="Date d'envoi" data-testid="cartes-date" />
            </label>
            {quand === "plus_tard" && <p className="text-xs text-gray-500">La carte partira toute seule ce jour-là, à partir de 8 h. Vous pouvez annuler la programmation depuis « Mes cartes ».</p>}
          </div>
          <button type="button" className="btn-primary w-full py-3" disabled={!accord || !choix || occupe !== ""} onClick={envoyer} data-testid="cartes-envoyer">
            {quand === "plus_tard" && dateEnvoi ? `Programmer l'envoi pour le ${dateFr(dateEnvoi)}` : `Envoyer à ${carte.destinataire} sur WhatsApp`}
          </button>
          <p className="text-xs text-gray-500">{liste.envoyees_aujourdhui} carte(s) envoyée(s) sur les dernières 24 h (maximum {liste.envois_par_jour}).</p>
        </section>
      ) : (
        <form onSubmit={creer} className="card space-y-3" data-testid="cartes-formulaire">
          <h2 className="text-lg font-semibold">Nouvelle carte</h2>
          <div>
            <label className="label" htmlFor="occasion">Occasion</label>
            <select id="occasion" className="input" value={form.occasion} onChange={champ("occasion")}>
              {OCCASIONS.map((o) => <option key={o}>{o}</option>)}
              <option>{AUTRE}</option>
            </select>
          </div>
          {form.occasion === AUTRE && (
            <div>
              <label className="label" htmlFor="autre">Thème de la carte</label>
              <input id="autre" className="input" required minLength={3} maxLength={60} value={form.autre} onChange={champ("autre")} placeholder="ex. Départ à la retraite" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="decor">Décor souhaité <span className="font-normal text-gray-400">(facultatif)</span></label>
            <input id="decor" className="input" maxLength={40} value={form.decor} onChange={champ("decor")} placeholder="ex. ballons dorés, fleurs, coucher de soleil" />
          </div>
          {/* Forme artistique et type d'IA : listes déroulantes (les valeurs viennent du serveur) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="style">Forme artistique</label>
              <select id="style" className="input" value={form.style} onChange={champ("style")} data-testid="carte-style">
                {Object.entries(liste.styles || { illustration: "Illustration / dessin" }).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="moteur">Type d'IA</label>
              <select id="moteur" className="input" value={form.moteur} onChange={champ("moteur")} data-testid="carte-moteur">
                {Object.entries(liste.moteurs || { standard: "Standard" }).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="message">Votre message</label>
            <textarea id="message" className="input min-h-[6rem]" required minLength={2} maxLength={300} value={form.message} onChange={champ("message")}
              placeholder="Joyeux anniversaire ! Que cette année t'apporte santé et bonheur." />
            <p className="mt-1 text-xs text-gray-500">{form.message.length}/300 caractères. Il sera écrit sur la carte.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="destinataire">Prénom du destinataire</label>
              <input id="destinataire" className="input" required maxLength={60} value={form.destinataire} onChange={champ("destinataire")} />
            </div>
            <div>
              <label className="label" htmlFor="tel">WhatsApp du destinataire</label>
              <ChampTelephone id="tel" required valeur={form.telephone} onChange={(v) => setForm((f) => ({ ...f, telephone: v }))} />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full py-3" disabled={occupe !== ""}>Créer la carte</button>
          <p className="text-xs text-gray-500">La création prend environ 30 secondes. Elle est réservée aux abonnés de la formule « Cartes virtuelles ».</p>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mes cartes</h2>
        {liste.cartes.length === 0 && <p className="text-sm text-gray-500">Aucune carte pour le moment.</p>}
        <ul className="space-y-2">
          {liste.cartes.map((c) => (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.destinataire} · {c.theme}</p>
                <p className="text-xs text-gray-500">{
                  c.statut === "envoyee" ? `✔ Envoyée le ${dateHeure(c.envoyee_le)}`
                  : c.statut === "programmee" || c.statut === "envoi" ? `⏰ Programmée : part le ${dateFr(c.date_envoi)}`
                  : c.statut === "echec" ? `⚠ Envoi impossible : ${c.erreur_envoi || "réessayez"}`
                  : `En cours · ${c.nb_variantes}/${max} variante(s) · ${dateHeure(c.cree_le)}`}</p>
              </div>
              <div className="flex gap-2">
                {c.statut === "brouillon" && <button type="button" className="btn-outline btn-sm" onClick={() => ouvrirExistante(c)}>Ouvrir</button>}
                {(c.statut === "programmee" || c.statut === "echec") && <button type="button" className="btn-outline btn-sm" onClick={() => deprogrammer(c)}>Annuler la programmation</button>}
                <button type="button" className="btn-outline btn-sm" onClick={() => supprimer(c)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
