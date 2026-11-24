// Page d'arrivée après Google (lot 222) : « /connexion-google?code=… » (ou ?erreur=…, ?lie=1).
// Le code à usage unique est échangé contre la session (POST /auth/google/echange) ; le mot de passe n'est jamais demandé ici.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Patientez from "@/components/Patientez";
import { useAuth } from "@/context/AuthContext";
import { apiClient, messageErreur } from "@/lib/api";
import { MESSAGES_GOOGLE } from "@/lib/google";

export default function ConnexionGoogle() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [erreur, setErreur] = useState("");
  const fait = useRef(false);                       // le code ne sert qu'une fois : un seul échange, même si React redessine la page
  const code = params.get("code"), echec = params.get("erreur"), lie = params.get("lie");

  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    if (lie) { navigate("/profil?google=lie", { replace: true }); return; }
    if (echec || !code) { setErreur(MESSAGES_GOOGLE[echec] || "Connexion par Google impossible."); return; }
    apiClient.post("/auth/google/echange", { code })
      .then(({ data }) => { setUser(data.user); navigate("/", { replace: true }); })
      .catch((err) => setErreur(messageErreur(err, "Connexion par Google impossible")));
  }, [code, echec, lie, navigate, setUser]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="card w-full space-y-3 text-center" data-testid="connexion-google">
        {erreur ? (
          <>
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
            <Link to="/connexion" className="btn-primary inline-block">↩ Retour à la connexion</Link>
          </>
        ) : <Patientez actif texte="Connexion par Google…" />}
      </div>
    </div>
  );
}
