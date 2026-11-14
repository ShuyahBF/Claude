import { useEffect, useState } from "react";
import SelecteurOperateur from "@/components/SelecteurOperateur";
import { apiClient, couleurOperateur, messageErreur } from "@/lib/api";

// Paiement rapide d'un marchand (début du parcours de paiement) : deux façons d'aller directement au montant, sans choisir l'opérateur ni le service.
//  1. « Nouveau code marchand » : l'opérateur et le code, puis le montant (le marchand pourra recevoir un nom, comme d'habitude) ;
//  2. « Liste des marchands » : tous les marchands déjà connus (recherche par nom ou par code). Chaque marchand est enregistré avec son opérateur : un appui ouvre le montant.
export default function RaccourcisMarchand({ operateurs, onChoisir, onNouveau }) {
  const [panneau, setPanneau] = useState(null);          // null | "nouveau" | "liste"
  const [operateur, setOperateur] = useState("");
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [liste, setListe] = useState(null);               // null = chargement
  const [erreur, setErreur] = useState("");

  // Liste des marchands : chargée à l'ouverture, puis à chaque recherche (petit délai pour ne pas interroger à chaque touche)
  useEffect(() => {
    if (panneau !== "liste") return undefined;
    setErreur("");
    const t = setTimeout(() => {
      apiClient.get("/marchands", { params: q.trim() ? { q: q.trim() } : {} })
        .then(({ data }) => setListe(data)).catch((err) => { setListe([]); setErreur(messageErreur(err, "Liste indisponible")); });
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [panneau, q]);

  const basculer = (nom) => setPanneau((p) => (p === nom ? null : nom));

  return (
    <section className="card space-y-3" aria-label="Paiement rapide d'un marchand">
      <h2 className="font-semibold">⚡ Payer un marchand</h2>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={panneau === "nouveau"} onClick={() => basculer("nouveau")}
          className={`rounded-xl border p-3 text-left text-sm font-semibold ${panneau === "nouveau" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-300 bg-white"}`}>
          ➕ Nouveau code marchand
        </button>
        <button type="button" aria-pressed={panneau === "liste"} onClick={() => basculer("liste")}
          className={`rounded-xl border p-3 text-left text-sm font-semibold ${panneau === "liste" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-300 bg-white"}`}>
          📒 Liste des marchands
        </button>
      </div>

      {panneau === "nouveau" && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (operateur && code) onNouveau(operateur, code.replace(/\D/g, "")); }}>
          <div>
            <label className="label" htmlFor="rm-operateur">Opérateur</label>
            <SelecteurOperateur id="rm-operateur" valeur={operateur} onChange={setOperateur} options={operateurs} disabled={operateurs.length === 0} />
          </div>
          <div>
            <label className="label" htmlFor="rm-code">Code du marchand</label>
            <input id="rm-code" className="input font-mono" inputMode="numeric" pattern="[0-9 ]*" required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={!operateur || code.replace(/\D/g, "").length < 3}>Continuer vers le montant →</button>
        </form>
      )}

      {panneau === "liste" && (
        <div className="space-y-2">
          <input className="input" type="search" placeholder="🔎 Nom ou code du marchand" aria-label="Rechercher un marchand" value={q} onChange={(e) => setQ(e.target.value)} />
          {erreur && <p className="text-sm text-red-700">{erreur}</p>}
          {liste === null ? <p className="text-sm text-gray-500">Chargement…</p> : liste.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun marchand trouvé. Utilisez « Nouveau code marchand ».</p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200" data-testid="liste-marchands">
              {liste.map((m) => (
                <li key={`${m.operateur}:${m.code}`}>
                  <button type="button" className="flex w-full items-center gap-3 p-2 text-left hover:bg-gray-50" onClick={() => onChoisir(m)}>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurOperateur(m.operateur) }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.libelle || `Code ${m.code}`}</span>
                      <span className="block text-xs text-gray-500">{m.operateur} · code {m.code}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-primary">Payer →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {liste && liste.length >= 100 && <p className="text-xs text-gray-500">100 marchands affichés : précisez la recherche.</p>}
        </div>
      )}
    </section>
  );
}
