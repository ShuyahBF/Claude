// « Mes portefeuilles » dans le Profil (lots 88 et 89) : on COCHE les opérateurs chez qui on a un compte mobile money et on choisit la
// COULEUR de chacun. Seuls les opérateurs cochés apparaissent dans l'Historique (cartes de solde, courbe, listes de saisie) ; la couleur
// choisie sert partout (courbes, cartes, pastilles). Un portefeuille DÉJÀ UTILISÉ (solde indiqué ou mouvement enregistré) reste coché :
// la case est grisée avec la mention « utilisé ».
import { useEffect, useState } from "react";
import LogoOperateur from "@/components/LogoOperateur";
import { useToast } from "@/components/Toast";
import { apiClient, couleurDefautOperateur, couleurOperateur, definirCouleursOperateurs, messageErreur } from "@/lib/api";

// Palette proposée (liste finie) ; « Autre… » ouvre le sélecteur de couleur du téléphone
const PALETTE = [
  ["#ff7900", "Orange"], ["#e30613", "Rouge"], ["#e11d8f", "Rose"], ["#4926d7", "Violet"], ["#0066b3", "Bleu"], ["#02bfee", "Cyan"],
  ["#06c7a6", "Turquoise"], ["#0ba957", "Vert"], ["#f5b301", "Jaune"], ["#8a5a2b", "Marron"], ["#64748b", "Gris"], ["#0f1d3d", "Bleu nuit"],
];

export default function PortefeuillesProfil() {
  const toast = useToast();
  const [d, setD] = useState(null);          // { catalogue, choisis, verrouilles, couleurs }
  const [occupe, setOccupe] = useState(false);
  const [palette, setPalette] = useState(""); // opérateur dont la palette est ouverte

  useEffect(() => {
    apiClient.get("/portefeuille/operateurs").then(({ data }) => { setD(data); definirCouleursOperateurs(data.couleurs); })
      .catch(() => setD({ catalogue: [], choisis: [], verrouilles: [], couleurs: {} }));
  }, []);

  // Chaque case enregistre tout de suite le nouveau choix
  const basculer = async (operateur) => {
    const choisis = d.choisis.includes(operateur) ? d.choisis.filter((o) => o !== operateur) : [...d.choisis, operateur];
    setOccupe(true);
    try { setD((await apiClient.put("/portefeuille/operateurs", { operateurs: choisis })).data); toast.succes("Enregistré"); }
    catch (err) { toast.erreur(messageErreur(err, "Enregistrement impossible")); } finally { setOccupe(false); }
  };
  // Couleur choisie (null = couleur d'origine) : enregistrée puis appliquée à toute l'application
  const colorier = async (operateur, couleur) => {
    try {
      const { data } = await apiClient.put("/portefeuille/couleurs", { operateur, couleur });
      definirCouleursOperateurs(data.couleurs);
      setD((x) => ({ ...x, couleurs: data.couleurs }));
    } catch (err) { toast.erreur(messageErreur(err, "Couleur non enregistrée")); }
  };

  if (!d || d.catalogue.length === 0) return null;
  return (
    <section className="card space-y-3" data-testid="portefeuilles-profil">
      <h2 className="text-lg font-bold">💼 Mes portefeuilles</h2>
      <p className="text-sm text-gray-600">Cochez les opérateurs chez qui vous avez un compte mobile money : un portefeuille est suivi dans l'Historique pour chacun. Un portefeuille déjà utilisé ne peut plus être désactivé. Choisissez aussi la couleur de chaque opérateur : elle sert dans les graphiques et les listes.</p>
      <ul className="space-y-2">
        {d.catalogue.map((o) => {
          const verrou = d.verrouilles.includes(o);
          const couleur = couleurOperateur(o);
          const perso = !!d.couleurs?.[o];
          return (
            <li key={o} className="rounded-xl border border-gray-200">
              <div className={`flex items-center gap-3 px-3 py-2.5 ${verrou ? "bg-gray-50" : ""}`}>
                <label className={`flex min-w-0 flex-1 items-center gap-3 ${verrou ? "" : "cursor-pointer"}`}>
                  <input type="checkbox" className="h-5 w-5" checked={d.choisis.includes(o)} disabled={occupe || verrou} onChange={() => basculer(o)} data-testid={`pf-${o}`} />
                  <LogoOperateur operateur={o} taille={26} />
                  <span className="min-w-0 flex-1 truncate font-medium">{o}</span>
                  {verrou && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">utilisé</span>}
                </label>
                <button type="button" className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 text-sm" aria-expanded={palette === o}
                  aria-label={`Couleur de ${o}`} onClick={() => setPalette(palette === o ? "" : o)} data-testid={`couleur-${o}`}>
                  <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: couleur }} />Couleur
                </button>
              </div>
              {palette === o && (
                <div className="space-y-2 border-t border-gray-100 px-3 py-3">
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Couleurs proposées pour ${o}`}>
                    {PALETTE.map(([hex, nom]) => (
                      <button key={hex} type="button" title={nom} aria-label={nom} aria-pressed={couleur.toLowerCase() === hex}
                        onClick={() => colorier(o, hex)} className={`h-8 w-8 rounded-full ring-offset-2 ${couleur.toLowerCase() === hex ? "ring-2 ring-primary" : "ring-1 ring-black/10"}`} style={{ background: hex }} />
                    ))}
                    <label className="flex h-8 cursor-pointer items-center gap-1 rounded-full border border-gray-300 px-3 text-sm">
                      Autre…<input type="color" className="sr-only" value={couleur} onChange={(e) => colorier(o, e.target.value)} aria-label={`Autre couleur pour ${o}`} />
                    </label>
                  </div>
                  {perso && <button type="button" className="text-sm text-primary underline" onClick={() => colorier(o, null)}>Revenir à la couleur d'origine ({couleurDefautOperateur(o)})</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
