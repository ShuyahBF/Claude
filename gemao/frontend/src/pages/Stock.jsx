import { useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";

export default function Stock() {
  const { lignes, charger, erreur } = useListe("/pieces");
  const toast = useToast();
  const vierge = { code: "", nom: "", stock: 0, seuil: 0, prix_unitaire: 0 };
  const [f, setF] = useState(vierge);
  const ajouter = async (e) => {
    e.preventDefault();
    try { await api("/pieces", { methode: "POST", corps: { ...f, stock: +f.stock, seuil: +f.seuil, prix_unitaire: +f.prix_unitaire } }); toast("Pièce ajoutée.", "ok"); setF(vierge); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  const mouvement = async (p, sens) => {
    const q = Number(window.prompt(`${sens === "entree" ? "Entrée" : "Sortie"} de stock pour « ${p.nom} » — quantité :`));
    if (!q || q <= 0) return;
    try { await api(`/pieces/${p.id}/mouvement`, { methode: "POST", corps: { quantite: q, sens } }); toast("Mouvement enregistré.", "ok"); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  const num = (k, ph) => <input type="number" min="0" step="any" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <>
      <Entete titre="Pièces Et Stock" charger={charger} unite="pièce(s)" />
      {erreur && <p className="erreur">{erreur}</p>}
      <form className="ligne-form" onSubmit={ajouter}>
        <input placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        <input placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
        {num("stock", "Stock")}{num("seuil", "Seuil d'alerte")}{num("prix_unitaire", "Prix unitaire (FCFA)")}
        <button className="primaire">➕ Ajouter</button>
      </form>
      <Tableau lignes={lignes} vide="Aucune pièce." colonnes={[
        { titre: "Code", valeur: (p) => p.code }, { titre: "Pièce", valeur: (p) => p.nom },
        { titre: "Stock", valeur: (p) => p.stock, nombre: true, rendu: (p) => <b className={p.stock <= p.seuil ? "alerte-texte" : ""}>{p.stock}</b> },
        { titre: "Seuil", valeur: (p) => p.seuil, nombre: true },
        { titre: "Prix (FCFA)", valeur: (p) => p.prix_unitaire, nombre: true, rendu: (p) => p.prix_unitaire.toLocaleString("fr-FR") },
        { titre: "Mouvement", action: true, valeur: () => null, rendu: (p) => <span className="actions"><button onClick={() => mouvement(p, "entree")}>⬆ Entrée</button><button onClick={() => mouvement(p, "sortie")}>⬇ Sortie</button></span> }]} />
    </>
  );
}
