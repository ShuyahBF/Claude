import { useState } from "react";

// Saisie secrète avec pictogramme œil (règle 22) : masquée par défaut, zone tactile de 44 px.
export default function ChampMotDePasse({ valeur, onChange, placeholder = "Mot de passe", autoComplete = "current-password" }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="champ-secret">
      <input type={visible ? "text" : "password"} value={valeur} onChange={(e) => onChange(e.target.value)}
             placeholder={placeholder} autoComplete={autoComplete} required />
      <button type="button" className="oeil" onClick={() => setVisible(!visible)}
              aria-label={visible ? "Masquer la saisie" : "Afficher la saisie"}>{visible ? "🙈" : "👁️"}</button>
    </div>
  );
}
