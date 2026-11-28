// Client de l'API GeMAO : jeton de session + client actif (super-administrateur) gardés dans le navigateur.
const base = import.meta.env.VITE_API_URL || "/api";
const lire = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const ecrire = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* navigation privée */ } };

export const session = {
  jeton: () => lire("gemao_jeton"), definir: (j) => ecrire("gemao_jeton", j),
  client: () => lire("gemao_client"), choisirClient: (c) => ecrire("gemao_client", c),
};

export async function api(chemin, { methode = "GET", corps } = {}) {
  const entetes = { "Content-Type": "application/json" };
  if (session.jeton()) entetes.Authorization = `Bearer ${session.jeton()}`;
  if (session.client()) entetes["X-Client-Id"] = session.client();
  const r = await fetch(base + chemin, { method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined });
  if (r.status === 204) return null;
  const donnees = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && session.jeton()) { session.definir(""); window.location.assign("/connexion"); }
    const d = donnees.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => e.msg).join(" ; ") : "Erreur serveur.");
  }
  return donnees;
}
