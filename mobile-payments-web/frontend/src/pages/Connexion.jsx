import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import ChampMotDePasse from "@/components/ChampMotDePasse";
import ChampTelephone from "@/components/ChampTelephone";
import EtatServeur from "@/components/EtatServeur";
import Patientez from "@/components/Patientez";
import SupportSawali from "@/components/SupportSawali";
import { useAuth } from "@/context/AuthContext";
import { messageErreur, MOTIF_DECONNEXION_KEY } from "@/lib/api";
import { assembler, libellePays, PAYS, PAYS_DEFAUT, trouverPays } from "@/lib/pays";
import { LIBELLE_VERSION } from "@/version";

// Écrans de connexion et d'inscription (mode = "connexion" | "inscription").
// Identification par numéro de téléphone OU adresse e-mail + mot de passe.
// Mise en page (règles du propriétaire) : carte centrée avec le logo, état du
// serveur, version déployée, œil sur le mot de passe, « Patientez… » pendant l'envoi.
export default function Connexion({ mode = "connexion" }) {
  const { user, connexion, inscription } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Page à rouvrir après la connexion (ex. QR code d'un marchand scanné)
  const suite = params.get("suite") || "/";
  const inscrire = mode === "inscription";

  const [form, setForm] = useState({ identifiant: "", nom: "", prenom: "", telephone: "", email: "", mot_de_passe: "" });
  const [erreur, setErreur] = useState("");
  const [paysConnexion, setPaysConnexion] = useState(PAYS_DEFAUT);     // pays appliqué à un numéro saisi sans indicatif
  // Motif d'une fermeture de session (inactivité, administrateur…) : affiché jusqu'à la prochaine connexion réussie
  // (lu sans être effacé tout de suite : la page peut être recréée pendant la vérification de la session)
  const [motif] = useState(() => {
    try { return sessionStorage.getItem(MOTIF_DECONNEXION_KEY); } catch { return null; }
  });
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
        // E-mail : tel quel. Numéro sans indicatif (« 70 00 00 00 ») : on y ajoute celui du pays choisi (Burkina Faso par défaut)
        const saisie = form.identifiant.trim();
        const international = saisie.startsWith("+") || saisie.startsWith("00");
        const p = trouverPays(paysConnexion);
        await connexion(saisie.includes("@") || international ? saisie : assembler(p.indicatif, saisie, !!p.zero) || saisie, form.mot_de_passe);
      }
      try { sessionStorage.removeItem(MOTIF_DECONNEXION_KEY); } catch { /* stockage indisponible */ }
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
      {/* Jauge circulaire + toast « Patientez… » pendant la connexion / l'inscription */}
      <Patientez actif={envoi} />

      <form onSubmit={envoyer} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        {/* En-tête de la carte : logo et nom de l'application */}
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <img src="/icone.svg" alt="Paiement Mobile" className="h-14 w-14" />
          <p className="logo-ecrit text-5xl text-accent">Paiement Mobile</p>
          <p className="text-xs uppercase tracking-[0.25em] text-accent">Orange · Moov · Telecel</p>
        </div>
        <h1 className="text-xl font-bold">{inscrire ? "Créer mon compte" : "Connexion"}</h1>
        {motif && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">🔒 {motif}</p>}

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
              <ChampTelephone id="telephone" required valeur={form.telephone} onChange={(v) => setForm((f) => ({ ...f, telephone: v }))} />
            </div>
            <div>
              <label className="label" htmlFor="email">E-mail <span className="font-normal text-gray-400">(facultatif)</span></label>
              <input id="email" className="input" type="email" value={form.email} onChange={champ("email")} autoComplete="email" />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="identifiant">Téléphone ou e-mail</label>
            <div className="flex gap-2">
              {/* Pays du numéro : proposé tant que la saisie n'est ni un e-mail ni un numéro déjà écrit avec son indicatif */}
              {!/[@+]/.test(form.identifiant) && !form.identifiant.startsWith("00") && (
                <select className="input w-auto max-w-[60%] shrink-0 px-2 text-sm" value={paysConnexion} onChange={(e) => setPaysConnexion(e.target.value)} aria-label="Pays du numéro">
                  {PAYS.map((p) => <option key={p.code} value={p.code}>{libellePays(p)}</option>)}
                </select>
              )}
              <input id="identifiant" className="input min-w-0 flex-1" required placeholder="70 00 00 00 ou nom@exemple.com"
                value={form.identifiant} onChange={champ("identifiant")} autoComplete="username" />
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="mdp">Mot de passe</label>
          <ChampMotDePasse id="mdp" required minLength={inscrire ? 8 : 1}
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
        {/* Pied de la carte : état du serveur et version déployée */}
        {/* Informations alignées à gauche ; icône de support SAWALI en bas à droite */}
        <div className="flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
          <div className="min-w-0 space-y-1">
            <EtatServeur />
            <p className="text-xs text-gray-400">{LIBELLE_VERSION}</p>
          </div>
          <SupportSawali variante="carte" />
        </div>
      </form>
      {/* Contact officiel de SAWALI SMART SYSTEMS */}
      <p className="mt-6 text-center text-xs text-gray-400">
        Contact : <a href="mailto:contact@sawalismartsystems.com" className="text-gray-300 hover:text-white">contact@sawalismartsystems.com</a>
        {" · "}<a href="tel:+22625658165" className="text-gray-300 hover:text-white">+226 25 65 81 65</a>
      </p>
      {/* Lot 16 : lien vers la politique de confidentialité + mention de non-affiliation */}
      <p className="mt-2 text-center text-xs">
        <Link to="/confidentialite" className="text-gray-300 underline hover:text-white">Politique de confidentialité</Link>
      </p>
      <p className="mt-2 max-w-sm text-center text-[11px] leading-snug text-gray-500">
        Paiement Mobile n'est affilié ni à Orange, ni à Moov Africa, ni à Telecel Faso ; les marques citées appartiennent à leurs propriétaires.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Powered by <a href="https://sawalismartsystems.com" className="font-semibold text-gray-300 hover:text-white">Sawali Smart Systems</a>
      </p>
    </div>
  );
}
