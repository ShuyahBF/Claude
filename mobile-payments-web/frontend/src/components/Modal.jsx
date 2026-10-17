import { useEffect } from "react";

// Fenêtre modale : fond grisé, fermeture par ✕, clic à l'extérieur ou touche Échap.
// Dimensions volontairement MODESTES (règle du propriétaire, comme adLyn et beAuthentik), sur PC comme sur mobile :
//   - largeur : 28 rem au plus (« large » : 36 rem, pour un formulaire à plusieurs colonnes) ;
//   - hauteur : 85 % de l'écran au plus, avec défilement DANS la fenêtre si le contenu dépasse ;
//   - sur mobile : feuille collée en bas, jamais plein écran.
// imprimable = true : la fenêtre reste visible à l'impression (affiche du QR marchand).
export default function Modal({ ouvert, titre, onFermer, children, large = false, imprimable = false }) {
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => e.key === "Escape" && onFermer?.();
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert, onFermer]);

  if (!ouvert) return null;
  return (
    <div className={`${imprimable ? "print:static print:bg-white print:p-0" : "no-print"} fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onClick={onFermer}>
      <div
        className={`max-h-[85vh] max-h-[85dvh] w-full animate-slide-up overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5 ${large ? "sm:max-w-xl" : "sm:max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="no-print mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{titre}</h2>
          <button type="button" onClick={onFermer} className="rounded-full p-1 text-gray-500 hover:bg-gray-100" aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
