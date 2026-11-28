import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const fmt = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Règle 2 : « Version X · déployée le JJ/MM/AAAA HH:MM » partout ; libellé COMPLET (lot + commit) sur les pages d'administration.
export default function Version({ complet = false }) {
  const [v, setV] = useState(null);
  useEffect(() => { api("/version").then(setV).catch(() => {}); }, []);
  if (!v) return null;
  return <small className="version">{complet
    ? `Version ${v.version} · Lot ${v.lot} · ${v.commit || "local"} · déployée le ${fmt(v.deploye_le)}`
    : `Version ${v.version} · déployée le ${fmt(v.deploye_le)}`}</small>;
}
