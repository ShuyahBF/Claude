// Import du JOURNAL DES TRANSACTIONS remis par l'opérateur (lot 96 — auRor).
// Le client choisit l'opérateur et le fichier Excel (.xlsx) reçu de l'opérateur : on ANALYSE d'abord (chiffres + aperçu, rien n'est écrit),
// puis il confirme l'import. Les transactions déjà connues ne sont jamais doublées ; un paiement préparé dans auRor qui correspond est
// rapproché (il passe à « Payé »). Appel serveur : POST /api/journal-operateur/import.
import { useState } from "react";
import SelecteurOperateur from "@/components/SelecteurOperateur";
import { useToast } from "@/components/Toast";
import { apiClient, dateHeure, fcfa, messageErreur } from "@/lib/api";

// Fichier choisi → texte base64 (sans l'en-tête « data: »)
const lireBase64 = (fichier) => new Promise((resolve, reject) => {
  const lecteur = new FileReader();
  lecteur.onload = () => resolve(String(lecteur.result).split(",")[1] || "");
  lecteur.onerror = () => reject(new Error("Lecture du fichier impossible"));
  lecteur.readAsDataURL(fichier);
});

export default function ImportJournal({ operateurs, onTermine }) {
  const toast = useToast();
  const [operateur, setOperateur] = useState("Orange");
  const [fichier, setFichier] = useState(null);       // { nom, base64 }
  const [analyse, setAnalyse] = useState(null);       // résultat de l'analyse (appliquer = false)
  const [occupe, setOccupe] = useState(false);

  const choisir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAnalyse(null);
    setOccupe(true);
    try {
      const base64 = await lireBase64(f);
      setFichier({ nom: f.name, base64 });
      const { data } = await apiClient.post("/journal-operateur/import", { operateur, fichier: base64, appliquer: false });
      setAnalyse(data);
    } catch (err) {
      setFichier(null);
      toast.erreur(messageErreur(err, "Fichier non reconnu"));
    } finally { setOccupe(false); }
  };

  // Changer d'opérateur après le choix du fichier : on refait l'analyse
  const changerOperateur = async (op) => {
    setOperateur(op);
    if (!fichier) return;
    try {
      const { data } = await apiClient.post("/journal-operateur/import", { operateur: op, fichier: fichier.base64, appliquer: false });
      setAnalyse(data);
    } catch (err) { toast.erreur(messageErreur(err, "Analyse impossible")); }
  };

  const importer = async () => {
    setOccupe(true);
    try {
      const { data } = await apiClient.post("/journal-operateur/import", { operateur, fichier: fichier.base64, appliquer: true });
      toast.succes(`Import terminé : ${data.nouvelles} ajoutée(s), ${data.rapprochees} rapprochée(s)`);
      onTermine?.();
    } catch (err) { toast.erreur(messageErreur(err, "Import impossible")); } finally { setOccupe(false); }
  };

  const aFaire = analyse && (analyse.nouvelles || analyse.rapprochees || analyse.completees);
  return (
    <div className="space-y-3 text-sm" data-testid="import-journal">
      <p className="text-gray-600">
        Importez le <strong>journal des transactions</strong> remis par votre opérateur (fichier Excel). Les transactions déjà présentes
        ne sont jamais doublées ; un paiement préparé dans auRor qui correspond est marqué « Payé ».
      </p>
      <div>
        <label className="label" htmlFor="import-operateur">Opérateur du journal</label>
        <SelecteurOperateur id="import-operateur" valeur={operateur} onChange={changerOperateur} options={operateurs} />
      </div>
      <div>
        <label className="btn-outline w-full cursor-pointer text-center">
          {fichier ? `📄 ${fichier.nom} — choisir un autre fichier` : "📄 Choisir le fichier Excel (.xlsx)"}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={choisir} disabled={occupe} data-testid="import-fichier" />
        </label>
      </div>
      {occupe && !analyse && <p className="text-gray-500">Analyse du fichier…</p>}
      {analyse && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-3" data-testid="import-analyse">
          <ul className="space-y-1">
            <li><strong>{analyse.lues}</strong> transaction(s) lue(s) dans le fichier</li>
            <li>➕ <strong>{analyse.nouvelles}</strong> nouvelle(s) à ajouter</li>
            <li>🔗 <strong>{analyse.rapprochees}</strong> paiement(s) préparé(s) rapproché(s)</li>
            {analyse.completees > 0 && <li>✏️ <strong>{analyse.completees}</strong> nom(s) de contact complété(s)</li>}
            <li>✔ <strong>{analyse.deja_presentes}</strong> déjà présente(s)</li>
            {analyse.ignorees > 0 && <li className="text-amber-700">⚠ {analyse.ignorees} ligne(s) illisible(s) ignorée(s)</li>}
          </ul>
          {analyse.apercu.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table text-xs">
                <thead><tr><th>Date</th><th>Contact</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {analyse.apercu.map((l) => (
                    <tr key={l.ref}>
                      <td>{dateHeure(l.le)}</td>
                      <td>{l.sens === "entree" ? "↙ " : "↗ "}{l.contact || l.contrepartie || "—"}</td>
                      <td className="text-right tabular-nums">{fcfa(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" className="btn w-full" disabled={occupe || !aFaire} onClick={importer} data-testid="import-confirmer">
            {aFaire ? "Importer dans mon historique" : "Rien de nouveau à importer"}
          </button>
        </div>
      )}
    </div>
  );
}
