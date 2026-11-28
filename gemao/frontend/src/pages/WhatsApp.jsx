import { useState } from "react";
import { api } from "../lib/api.js";
import { useListe } from "../lib/useListe.js";
import { useToast } from "../components/Toasts.jsx";
import Entete from "../components/Entete.jsx";
import Tableau from "../components/Tableau.jsx";
import { useMoi } from "../App.jsx";

const STATUTS = { envoye: "Envoyé", echec: "Échec", sans_cle: "Clé HMAC manquante", sans_numero: "Sans numéro", recu: "Reçu" };

export default function WhatsApp({ integre = false }) {
  const { lignes, charger, erreur } = useListe("/whatsapp/messages");
  const moi = useMoi(); const toast = useToast();
  const [tel, setTel] = useState("");
  const essayer = async (e) => {
    e.preventDefault();
    toast("Envoi du message d'essai en cours…");
    try { const r = await api("/whatsapp/test", { methode: "POST", corps: { telephone: tel } }); toast(`Résultat : ${STATUTS[r.statut] || r.statut}.`, r.statut === "envoye" ? "ok" : "erreur"); charger(); }
    catch (err) { toast(err.message, "erreur"); }
  };
  return (
    <>
      {!integre && <Entete titre="WhatsApp" charger={charger} unite="message(s)" />}
      {integre && <div className="actions"><button onClick={async () => { toast("Actualisation de « WhatsApp » en cours…"); try { toast(`WhatsApp : ${await charger()} message(s) relu(s).`, "ok"); } catch (e) { toast(e.message, "erreur"); } }}>🔄 Actualiser</button></div>}
      <p className="aide">Les messages passent par SAWALI, signés avec la clé HMAC de votre société. Pour signaler une panne, un utilisateur enregistré envoie : <code>PANNE &lt;code équipement&gt; &lt;description&gt;</code>.</p>
      {erreur && <p className="erreur">{erreur}</p>}
      {moi.role === "admin" && <form className="ligne-form" onSubmit={essayer}>
        <input placeholder="Numéro (22670123456)" value={tel} onChange={(e) => setTel(e.target.value)} required />
        <button className="primaire">📤 Envoyer un essai</button></form>}
      <Tableau lignes={lignes} vide="Aucun message." colonnes={[
        { titre: "Date", valeur: (m) => m.le, rendu: (m) => m.le.replace("T", " ").slice(0, 16) }, { titre: "Sens", valeur: (m) => m.sens },
        { titre: "Numéro", valeur: (m) => m.telephone }, { titre: "Message", valeur: (m) => m.texte }, { titre: "Statut", valeur: (m) => STATUTS[m.statut] || m.statut }]} />
    </>
  );
}
