import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiClient, messageErreur } from "@/lib/api";
import { OPERATEURS_CARNET, chargerContacts, corpsRappel, enregistrerContact, normaliserNumero, supprimerContact } from "@/lib/carnet";
import { cleDuJournal, pourUtilisateur } from "@/lib/journalIntime";

// Carnet de contacts (lot 167) : crochet de lecture/écriture + fenêtre d'un contact (ajouter, corriger, effacer, programmer un paiement récurrent).
// Les contacts sont gardés SUR LE TÉLÉPHONE, chiffrés, propres au compte connecté (lib/carnet.js). Seul un rappel éventuel (libellé + montant) va sur le serveur.

/** Contacts du compte connecté + actions. `pret` devient vrai quand la clé de chiffrement est disponible. */
export function useCarnet() {
  const { user } = useAuth();
  const [cle, setCle] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [erreur, setErreur] = useState("");
  pourUtilisateur(user?.id);                                   // carnet propre au compte (un téléphone peut servir à plusieurs comptes)
  useEffect(() => { cleDuJournal().then(setCle).catch(() => setErreur("Ce navigateur ne permet pas de garder un carnet chiffré sur le téléphone.")); }, [user?.id]);
  const recharger = useCallback(async (k = cle) => { if (k) setContacts(await chargerContacts(k)); }, [cle]);
  useEffect(() => { recharger(); }, [recharger]);
  const enregistrer = async (contact) => { const id = await enregistrerContact(cle, contact); await recharger(); return id; };
  const supprimer = async (id) => { const ok = supprimerContact(id); await recharger(); return ok; };
  return { contacts, pret: !!cle, erreur, enregistrer, supprimer };
}

const FREQUENCES = [["unique", "Une seule fois"], ["hebdomadaire", "Chaque semaine"], ["mensuel", "Chaque mois"], ["trimestriel", "Chaque trimestre"], ["annuel", "Chaque année"]];
const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const CONTACT_VIDE = { nom: "", tel: "", operateur: "", montant: "", note: "" };

/** Fenêtre d'un contact : `contact` = { id?, nom, tel, operateur, montant, note } (préremplie depuis un SMS ou l'historique) ; null = fermée. */
export default function FenetreContact({ contact, onFermer, carnet }) {
  const toast = useToast();
  const [c, setC] = useState(CONTACT_VIDE);
  const [rappel, setRappel] = useState({ frequence: "mensuel", echeance: aujourdhui() });
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { if (contact) setC({ ...CONTACT_VIDE, ...contact, montant: contact.montant || "" }); }, [contact]);
  if (!contact) return null;
  const champ = (cle) => (e) => setC({ ...c, [cle]: e.target.value });
  const numero = normaliserNumero(c.tel);

  const valider = () => {
    if (!c.nom.trim()) { toast.erreur("Donnez un nom à ce contact."); return null; }
    if (!numero) { toast.erreur("Numéro invalide : 8 chiffres (l'indicatif 226 est accepté)."); return null; }
    return { ...c, nom: c.nom.trim().slice(0, 60), tel: numero, montant: c.montant ? Number(c.montant) : 0, note: (c.note || "").trim().slice(0, 120) };
  };
  const enregistrer = async () => {
    const v = valider(); if (!v) return;
    toast.info("Enregistrement du contact en cours…");
    const id = await carnet.enregistrer(v);
    if (!id) { toast.erreur("Enregistrement impossible : l'espace du téléphone est peut-être plein."); return; }
    toast.succes("Contact enregistré (chiffré sur ce téléphone)."); onFermer();
  };
  const effacer = async () => {
    if (!window.confirm(`Effacer ${c.nom || "ce contact"} du carnet ?`)) return;
    await carnet.supprimer(contact.id); toast.succes("Contact effacé."); onFermer();
  };
  const programmer = async () => {
    const v = valider(); if (!v) return;
    toast.info("Création du rappel en cours…");
    setOccupe(true);
    try {
      if (!v.id) v.id = await carnet.enregistrer(v); else await carnet.enregistrer(v);
      await apiClient.post("/rappels-paiements", corpsRappel(v, rappel));
      toast.succes("Rappel créé : retrouvez-le dans Rappels → Paiements récurrents. Vous validez chaque paiement vous-même.");
    } catch (err) { toast.erreur(messageErreur(err, "Rappel impossible (30 rappels au plus)")); } finally { setOccupe(false); }
  };

  return (
    <Modal ouvert onFermer={onFermer} titre={contact.id ? "Mon contact" : "Nouveau contact"} large>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="ct-nom">Nom</label><input id="ct-nom" className="input" maxLength={60} placeholder="ex. BADINI Awa" value={c.nom} onChange={champ("nom")} /></div>
          <div><label className="label" htmlFor="ct-tel">Numéro</label><input id="ct-tel" className="input" inputMode="tel" placeholder="ex. 70 12 34 56" value={c.tel} onChange={champ("tel")} /></div>
          <div><label className="label" htmlFor="ct-op">Opérateur</label>
            <select id="ct-op" className="input" value={c.operateur} onChange={champ("operateur")}><option value="">À choisir au paiement</option>{OPERATEURS_CARNET.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className="label" htmlFor="ct-montant">Montant habituel (FCFA, facultatif)</label><input id="ct-montant" className="input" inputMode="numeric" value={c.montant} onChange={champ("montant")} /></div>
        </div>
        <div><label className="label" htmlFor="ct-note">Note (facultatif)</label><input id="ct-note" className="input" maxLength={120} placeholder="ex. Frère, loyer, aide ménagère…" value={c.note} onChange={champ("note")} /></div>

        <section className="space-y-2 rounded-xl bg-gray-50 p-3" data-testid="recurrent">
          <p className="text-sm font-semibold">🔁 Paiement récurrent (rappel)</p>
          <p className="text-xs text-gray-600">auRor ne paie jamais seul : il vous rappelle l'échéance, puis vous validez le paiement vous-même. Le rappel est gardé sur notre serveur avec son titre « Envoyer à {c.nom || "…"} » et son montant, <b>jamais le numéro</b>.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div><label className="label" htmlFor="ct-freq">Fréquence</label><select id="ct-freq" className="input" value={rappel.frequence} onChange={(e) => setRappel({ ...rappel, frequence: e.target.value })}>{FREQUENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label" htmlFor="ct-ech">Première échéance</label><input id="ct-ech" type="date" className="input" value={rappel.echeance} onChange={(e) => setRappel({ ...rappel, echeance: e.target.value })} /></div>
            <button type="button" className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary" disabled={occupe} onClick={programmer}>🔔 Créer le rappel</button>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          {contact.id && <button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={effacer}>🗑️ Effacer</button>}
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={onFermer}>✖️ Fermer</button>
          <button type="button" className="btn-primary" onClick={enregistrer}>💾 Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}
