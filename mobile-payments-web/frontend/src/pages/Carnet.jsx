import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FenetreContact, { CONTACT_VIDE, useCarnet } from "@/components/FenetreContact";
import { filtrerContacts, lienPayer } from "@/lib/carnet";
import { fcfa } from "@/lib/api";

// Carnet de contacts (lot 167) : les personnes à qui j'envoie souvent de l'argent. Gardé SUR LE TÉLÉPHONE, chiffré, propre à mon compte.
// « Payer » ouvre le transfert prérempli (je relis et je valide comme d'habitude) ; détails et corrections dans une fenêtre (règle 20).
export default function Carnet() {
  const carnet = useCarnet();
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(null);               // contact ouvert dans la fenêtre (ou CONTACT_VIDE pour un nouveau)
  const affiches = useMemo(() => filtrerContacts(carnet.contacts, texte), [carnet.contacts, texte]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">📒 Mon Carnet De Contacts</h1>
      <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">🔒 Vos contacts sont gardés uniquement sur ce téléphone, chiffrés : aucune copie sur nos serveurs. Si vous désinstallez l'application ou effacez ses données, ils sont perdus. Vous pouvez en ajouter depuis un SMS (« ➕ Carnet » dans Mes SMS de paiement) ou depuis l'historique.</p>
      {carnet.erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{carnet.erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!carnet.pret} onClick={() => setOuvert({ ...CONTACT_VIDE })} data-testid="nouveau-contact">➕ Nouveau contact</button>
        <input type="search" className="input min-w-0 flex-1" placeholder="🔎 Nom, numéro ou note" aria-label="Chercher un contact" value={texte} onChange={(e) => setTexte(e.target.value)} />
      </div>
      {carnet.contacts.length === 0 && <p className="text-sm text-gray-600">Aucun contact pour l'instant.</p>}
      {carnet.contacts.length > 0 && <p className="text-sm text-gray-600"><b>{affiches.length}</b> contact(s) sur {carnet.contacts.length}</p>}
      <ul className="space-y-2" data-testid="liste-contacts">
        {affiches.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-3">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOuvert(c)} aria-label={`Ouvrir ${c.nom}`}>
              <span className="block truncate font-semibold text-primary">{c.nom}</span>
              <span className="block text-xs text-gray-600">📞 {c.tel}{c.operateur ? ` · ${c.operateur}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
              {c.montant > 0 && <span className="block text-xs font-semibold text-green-700">Montant habituel : {fcfa(c.montant)}</span>}
            </button>
            <Link to={lienPayer(c)} className="btn-primary btn-sm shrink-0" title={`Payer ${c.nom}`} aria-label={`Payer ${c.nom}`}>💸 Payer</Link>
          </li>
        ))}
      </ul>
      <FenetreContact contact={ouvert} onFermer={() => setOuvert(null)} carnet={carnet} />
    </div>
  );
}
