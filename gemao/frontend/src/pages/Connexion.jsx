import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, session } from "../lib/api.js";
import ChampMotDePasse from "../components/ChampMotDePasse.jsx";
import Attente from "../components/Attente.jsx";
import Version from "../components/Version.jsx";
import { EXEMPLE_EMAIL } from "../lib/exemplesIdentite.js";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const [attente, setAttente] = useState(false);
  const [serveur, setServeur] = useState("verif");   // verif | actif | lent | injoignable
  const nav = useNavigate();
  // État du serveur : « Serveur actif », lent (> 3 s) ou injoignable
  useEffect(() => {
    const debut = Date.now();
    api("/health").then(() => setServeur(Date.now() - debut > 3000 ? "lent" : "actif")).catch(() => setServeur("injoignable"));
  }, []);
  const envoyer = async (e) => {
    e.preventDefault(); setErreur(""); setAttente(true);
    try {
      const r = await api("/auth/connexion", { methode: "POST", corps: { email, mot_de_passe: mdp } });
      session.definir(r.jeton);
      nav(r.utilisateur.role === "super_admin" ? "/clients" : r.utilisateur.role === "demandeur" ? "/interventions" : "/");
    } catch (err) { setErreur(err.message); } finally { setAttente(false); }
  };
  const etat = { verif: ["⏳", "Vérification du serveur…"], actif: ["🟢", "Serveur actif"], lent: ["🟠", "Serveur lent"], injoignable: ["🔴", "Serveur injoignable"] }[serveur];
  return (
    <form className="carte connexion" onSubmit={envoyer}>
      <div className="logo-rond">G</div>
      <h1>GeMAO</h1><p>Gestion de la maintenance assistée par ordinateur</p>
      <input type="email" placeholder={EXEMPLE_EMAIL} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      <ChampMotDePasse valeur={mdp} onChange={setMdp} />
      {erreur && <p className="erreur">{erreur}</p>}
      {attente ? <Attente /> : <button className="primaire">🔓 Se connecter</button>}
      <small className="etat-serveur">{etat[0]} {etat[1]}</small>
      <Version />
    </form>
  );
}
