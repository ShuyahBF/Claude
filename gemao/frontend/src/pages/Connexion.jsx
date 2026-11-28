import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, session } from "../lib/api.js";
import ChampMotDePasse from "../components/ChampMotDePasse.jsx";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const nav = useNavigate();
  const envoyer = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/auth/connexion", { methode: "POST", corps: { email, mot_de_passe: mdp } });
      session.definir(r.jeton);
      nav(r.utilisateur.role === "super_admin" ? "/clients" : r.utilisateur.role === "demandeur" ? "/interventions" : "/");
    } catch (err) { setErreur(err.message); }
  };
  return (
    <form className="carte connexion" onSubmit={envoyer}>
      <h1>GeMAO</h1><p>Gestion de la maintenance assistée par ordinateur</p>
      <input type="email" placeholder="awa.badini@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      <ChampMotDePasse valeur={mdp} onChange={setMdp} />
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="primaire">Se connecter</button>
    </form>
  );
}
