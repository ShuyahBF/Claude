import { useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";
import ChampMotDePasse from "../components/ChampMotDePasse.jsx";

const ROLES = { admin: "Administrateur", technicien: "Technicien", demandeur: "Demandeur" };

export default function Utilisateurs() {
  const { lignes, charger, erreur } = useListe("/utilisateurs");
  const toast = useToast();
  const vierge = { nom: "", email: "", telephone: "", role: "technicien", mot_de_passe: "" };
  const [f, setF] = useState(vierge);
  const ajouter = async (e) => {
    e.preventDefault();
    try { await api("/utilisateurs", { methode: "POST", corps: { ...f, telephone: f.telephone || null } }); toast("Utilisateur créé.", "ok"); setF(vierge); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  const retirer = async (u) => {
    if (!window.confirm(`Désactiver ${u.nom} ?`)) return;
    try { await api(`/utilisateurs/${u.id}`, { methode: "DELETE" }); toast("Utilisateur désactivé.", "ok"); charger(); } catch (err) { toast(err.message, "erreur"); }
  };
  return (
    <>
      <Entete titre="Utilisateurs" charger={charger} unite="utilisateur(s)" />
      {erreur && <p className="erreur">{erreur}</p>}
      <form className="ligne-form" onSubmit={ajouter}>
        <input placeholder="BADINI Awa" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
        <input type="email" placeholder="awa.badini@gmail.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input placeholder="Téléphone WhatsApp (22670123456)" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <ChampMotDePasse valeur={f.mot_de_passe} onChange={(v) => setF({ ...f, mot_de_passe: v })} placeholder="Mot de passe (8 car. min.)" autoComplete="new-password" />
        <button className="primaire">➕ Créer</button>
      </form>
      <Tableau lignes={lignes} vide="Aucun utilisateur." colonnes={[
        { titre: "Nom", valeur: (u) => u.nom }, { titre: "E-mail", valeur: (u) => u.email }, { titre: "Téléphone", valeur: (u) => u.telephone },
        { titre: "Rôle", valeur: (u) => ROLES[u.role] }, { titre: "", action: true, valeur: () => null, rendu: (u) => <button onClick={() => retirer(u)}>🗑️</button> }]} />
    </>
  );
}
