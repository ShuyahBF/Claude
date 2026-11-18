// Carte du PROFIL : rendre Liluvine (coach) présente, silencieuse pendant une période, ou désactivée — même si l'utilisateur est abonné.
// L'enregistrement est immédiat et annoncé (toast + phrase d'état) : l'utilisateur n'a jamais à deviner.
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { DUREES_SILENCE, ecrireReglage, etatLiluvine, finDuSilence, lireReglage } from "@/lib/liluvineReglage";
import { appliquerReglageLiluvine } from "@/lib/liluvineStore";

const dateLongue = (ms) => new Date(ms).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function LiluvineProfil() {
  const { user } = useAuth();
  const toast = useToast();
  const [reglage, setReglage] = useState(() => lireReglage(user?.id));
  const [duree, setDuree] = useState("semaine");
  const [date, setDate] = useState("");
  const etat = etatLiluvine(reglage);

  /** Garde le réglage sur le téléphone, l'applique tout de suite (bonjour, bulle, pastille) et le dit à l'utilisateur. */
  const appliquer = (nouveau, message) => {
    if (!ecrireReglage(user?.id, nouveau)) { toast.erreur("Impossible de garder ce réglage sur ce téléphone."); return; }
    setReglage(nouveau); appliquerReglageLiluvine(user?.id); toast.succes(message);
  };
  const silence = () => {
    const fin = finDuSilence(duree, new Date(), date);
    if (!fin) { toast.erreur("Choisissez une date à venir."); return; }
    appliquer({ mode: "silence", jusqua: fin }, `Liluvine est silencieuse jusqu'au ${dateLongue(fin)}.`);
  };

  return (
    <section className="card space-y-3" data-testid="liluvine-profil">
      <h2 className="text-lg font-bold text-primary">💬 Liluvine, ma coach</h2>
      <p className="text-sm text-gray-600">Liluvine peut vous écrire le matin et signaler ses messages. Chacun choisit, même si vous êtes abonné. Ce réglage reste sur ce téléphone.</p>
      <p className="rounded-lg bg-sky-50 p-2 text-sm font-semibold text-primary" data-testid="etat-liluvine" role="status">
        {etat === "off" ? "Liluvine est désactivée : elle ne vous écrit pas et son onglet est masqué." : etat === "silence" ? `Liluvine est silencieuse jusqu'au ${dateLongue(reglage.jusqua)} (pas de bonjour, ni bulle, ni son).` : "Liluvine est présente : bonjour le matin, bulle et son pour ses messages."}
      </p>

      {etat !== "active" && (
        <button type="button" className="btn-primary inline-flex items-center gap-2" data-testid="liluvine-reactiver"
          onClick={() => appliquer({ mode: "active", jusqua: null }, "Liluvine est de nouveau présente.")}><span aria-hidden="true">🔄</span> Réactiver Liluvine</button>
      )}

      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        <label className="block text-sm font-semibold">Rendre Liluvine silencieuse
          <select className="input mt-1" value={duree} onChange={(e) => setDuree(e.target.value)} data-testid="liluvine-duree">
            {DUREES_SILENCE.map((d) => <option key={d.id} value={d.id}>{d.libelle}</option>)}
          </select>
        </label>
        {duree === "date" && <label className="block text-sm font-semibold">Jusqu'au<input type="date" className="input mt-1" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></label>}
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-700" onClick={silence} data-testid="liluvine-silence"><span aria-hidden="true">🔕</span> Rendre silencieuse</button>
      </div>

      {etat !== "off" && (
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-red-500 px-3 py-2 text-sm font-semibold text-red-700" data-testid="liluvine-desactiver"
          onClick={() => appliquer({ mode: "off", jusqua: null }, "Liluvine est désactivée. Vous pouvez la réactiver ici à tout moment.")}><span aria-hidden="true">🚫</span> Ne plus voir Liluvine</button>
      )}
      {etat === "active" && <p className="flex items-center gap-1 text-xs text-gray-500"><span aria-hidden="true">🔔</span> Réglage enregistré automatiquement à chaque choix.</p>}
    </section>
  );
}
