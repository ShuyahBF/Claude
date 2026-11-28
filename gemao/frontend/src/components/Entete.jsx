import { useToast } from "./Toasts.jsx";

// En-tête de page avec le bouton « Actualiser » (règle 17) : toast « en cours » puis résultat chiffré.
export default function Entete({ titre, charger, children, unite = "élément(s)" }) {
  const toast = useToast();
  const actualiser = async () => {
    toast(`Actualisation de « ${titre} » en cours…`);
    try { const n = await charger(); toast(`${titre} : ${n ?? 0} ${unite} relu(s).`, "ok"); }
    catch (e) { toast(`Échec de l'actualisation : ${e.message}`, "erreur"); }
  };
  return (
    <div className="entete-page">
      <h1>{titre}</h1>
      <div className="actions">{children}<button onClick={actualiser}>🔄 Actualiser</button></div>
    </div>
  );
}
