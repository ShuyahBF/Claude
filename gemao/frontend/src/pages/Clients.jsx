import { useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";
import ChampMotDePasse from "../components/ChampMotDePasse.jsx";

export default function Clients() {
  const { lignes, charger, erreur } = useListe("/clients");
  const toast = useToast();
  const vierge = { nom: "", admin_nom: "", admin_email: "", admin_mot_de_passe: "", admin_telephone: "" };
  const [f, setF] = useState(vierge);
  const [cle, setCle] = useState(null);   // clé HMAC en clair, montrée UNE seule fois
  const creer = async (e) => {
    e.preventDefault();
    try { const r = await api("/clients", { methode: "POST", corps: { ...f, admin_telephone: f.admin_telephone || null } }); setCle(r); setF(vierge); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  const rotation = async (c) => {
    if (!window.confirm(`Remplacer la clé HMAC de ${c.nom} ? L'ancienne cessera de fonctionner immédiatement.`)) return;
    toast("Rotation de la clé en cours…");
    try { setCle(await api(`/clients/${c.id}/rotation-cle`, { methode: "POST" })); charger(); } catch (err) { toast(err.message, "erreur"); }
  };
  const basculer = async (c, champ) => { try { await api(`/clients/${c.id}`, { methode: "PATCH", corps: { [champ]: !c[champ] } }); charger(); } catch (err) { toast(err.message, "erreur"); } };
  const copier = async () => { try { await navigator.clipboard.writeText(cle.cle_hmac); toast("Clé copiée.", "ok"); } catch { toast("Copie impossible : sélectionnez la clé à la main.", "erreur"); } };
  return (
    <>
      <Entete titre="Clients Et Clés HMAC" charger={charger} unite="client(s)" />
      {erreur && <p className="erreur">{erreur}</p>}
      <form className="ligne-form" onSubmit={creer}>
        <input placeholder="Nom du client (ZandGo)" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
        <input placeholder="Administrateur : BADINI Awa" value={f.admin_nom} onChange={(e) => setF({ ...f, admin_nom: e.target.value })} required />
        <input type="email" placeholder="awa.badini@gmail.com" value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} required />
        <input placeholder="Téléphone WhatsApp" value={f.admin_telephone} onChange={(e) => setF({ ...f, admin_telephone: e.target.value })} />
        <ChampMotDePasse valeur={f.admin_mot_de_passe} onChange={(v) => setF({ ...f, admin_mot_de_passe: v })} placeholder="Mot de passe de l'admin (8 car. min.)" autoComplete="new-password" />
        <button className="primaire">➕ Créer le client</button>
      </form>
      <Tableau lignes={lignes} vide="Aucun client." colonnes={[
        { titre: "Client", valeur: (c) => c.nom }, { titre: "Code", valeur: (c) => c.code }, { titre: "Émetteur SAWALI", valeur: (c) => c.emetteur },
        { titre: "Empreinte clé", valeur: (c) => c.cle_hmac_empreinte, rendu: (c) => c.cle_hmac_empreinte ? `…${c.cle_hmac_empreinte}` : "—" },
        { titre: "Actif", valeur: (c) => (c.actif ? "Oui" : "Non") }, { titre: "WhatsApp", valeur: (c) => (c.wa_actif ? "Oui" : "Non") },
        { titre: "Actions", action: true, valeur: () => null, rendu: (c) => <span className="actions">
          <button onClick={() => rotation(c)}>🔑 Changer la clé</button><button onClick={() => basculer(c, "actif")}>{c.actif ? "⏸ Suspendre" : "▶ Réactiver"}</button>
          <button onClick={() => basculer(c, "wa_actif")}>{c.wa_actif ? "🔕 Couper WhatsApp" : "🔔 Activer WhatsApp"}</button></span> }]} />
      {cle && <div className="fenetre"><div className="carte">
        <h2>Clé HMAC de {cle.nom}</h2>
        <p>Émetteur SAWALI : <code>{cle.emetteur}</code></p>
        <p className="cle">{cle.cle_hmac}</p>
        <p className="erreur">{cle.avertissement}</p>
        <div className="actions"><button onClick={copier}>📋 Copier</button><button className="primaire" onClick={() => setCle(null)}>J'ai noté la clé</button></div>
      </div></div>}
    </>
  );
}
