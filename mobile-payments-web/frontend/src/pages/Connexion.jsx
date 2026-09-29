import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { messageErreur } from "@/lib/api";

// Écrans de connexion et d'inscription (mode = "connexion" | "inscription").
// Identification par numéro de téléphone OU adresse e-mail + mot de passe.
export default function Connexion({ mode = "connexion" }) {
  const { user, connexion, inscription } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Page à rouvrir après la connexion (ex. QR code d'un marchand scanné)
  const suite = params.get("suite") || "/";
  const inscrire = mode === "inscription";

  const [form, setForm] = useState({ identifiant: "", nom: "", prenom: "", telephone: "", email: "", mot_de_passe: "" });
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const champ = (cle) => (e) => setForm({ ...form, [cle]: e.target.value });

  if (user) return <Navigate to={suite} replace />;

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      if (inscrire) {
        await inscription({ nom: form.nom, prenom: form.prenom, telephone: form.telephone,
          email: form.email.trim() || null, mot_de_passe: form.mot_de_passe });
      } else {
        await connexion(form.identifiant, form.mot_de_passe);
      }
      navigate(suite, { replace: true });
    } catch (err) {
      setErreur(messageErreur(err, inscrire ? "Inscription impossible" : "Connexion impossible"));
    } finally {
      setEnvoi(false);
    }
  };

  const lienAutre = `${inscrire ? "/connexion" : "/inscription"}${params.get("suite") ? `?suite=${encodeURIComponent(suite)}` : ""}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-nuit-900 px-4 py-10">
      <div className="mb-6 flex items-center gap-3 text-white">
        <img src="/icone.svg" alt="" className="h-11 w-11" />
        <div>
          <p className="font-display text-2xl font-bold">Paiement Mobile</p>
          <p className="text-xs uppercase tracking-[0.25em] text-primary-clair">Orange · Moov · Telecel</p>
        </div>
      </div>

      <form onSubmit={envoyer} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold">{inscrire ? "Créer mon compte" : "Connexion"}</h1>

        {inscrire ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="prenom">Prénom</label>
                <input id="prenom" className="input" required value={form.prenom} onChange={champ("prenom")} autoComplete="given-name" />
              </div>
              <div>
                <label className="label" htmlFor="nom">Nom</label>
                <input id="nom" className="input" required value={form.nom} onChange={champ("nom")} autoComplete="family-name" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="telephone">Numéro de téléphone</label>
              <input id="telephone" className="input" type="tel" inputMode="tel" required placeholder="70 00 00 00"
                value={form.telephone} onChange={champ("telephone")} autoComplete="tel" />
            </div>
            <div>
              <label className="label" htmlFor="email">E-mail <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="email" className="input" type="email" value={form.email} onChange={champ("email")} autoComplete="email" />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="identifiant">Téléphone ou e-mail</label>
            <input id="identifiant" className="input" required placeholder="70 00 00 00 ou nom@exemple.com"
              value={form.identifiant} onChange={champ("identifiant")} autoComplete="username" />
          </div>
        )}

        <div>
          <label className="label" htmlFor="mdp">Mot de passe</label>
          <input id="mdp" className="input" type="password" required minLength={inscrire ? 8 : 1}
            value={form.mot_de_passe} onChange={champ("mot_de_passe")}
            autoComplete={inscrire ? "new-password" : "current-password"} />
          {inscrire && <p className="mt-1 text-xs text-gray-500">8 caractères au minimum.</p>}
        </div>

        {erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
        <button type="submit" className="btn-primary w-full py-3" disabled={envoi}>
          {envoi ? "Patientez…" : inscrire ? "Créer mon compte →" : "Se connecter →"}
        </button>
        <p className="text-center text-sm text-gray-600">
          {inscrire ? "Déjà un compte ? " : "Pas encore de compte ? "}
          <Link to={lienAutre} className="font-semibold text-primary">{inscrire ? "Se connecter" : "Créer un compte"}</Link>
        </p>
      </form>
      {/* Contact officiel de SAWALI SMART SYSTEMS */}
      <p className="mt-6 text-center text-xs text-gray-400">
        Contact : <a href="mailto:contact@sawalismartsystems.com" className="text-gray-300 hover:text-white">contact@sawalismartsystems.com</a>
        {" · "}<a href="tel:+22625658165" className="text-gray-300 hover:text-white">+226 25 65 81 65</a>
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Powered by <a href="https://sawalismartsystems.com" className="font-semibold text-gray-300 hover:text-white">Sawali Smart Systems</a>
      </p>
    </div>
  );
}
