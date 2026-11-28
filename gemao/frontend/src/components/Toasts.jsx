import { createContext, useCallback, useContext, useState } from "react";

// Toasts (règle 17) : toute actualisation annonce « … en cours » puis son résultat.
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function FournisseurToasts({ children }) {
  const [liste, setListe] = useState([]);
  const toast = useCallback((texte, type = "info") => {
    const id = Math.random();
    setListe((l) => [...l, { id, texte, type }]);
    setTimeout(() => setListe((l) => l.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" role="status">{liste.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.texte}</div>)}</div>
    </Ctx.Provider>
  );
}
