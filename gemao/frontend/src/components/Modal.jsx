// UN seul composant de modale (règle 11) : 28 rem au plus, 36 rem pour un formulaire large, 85 % de la hauteur avec défilement DANS la fenêtre.
export default function Modal({ children, large = false, onFermer }) {
  return (
    <div className="fenetre" onClick={onFermer}>
      <div className={`modale ${large ? "large" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
