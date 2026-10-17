// Petits logos des modes de paiement (lot 55). Chaque pictogramme est posé sur un FOND BLANC (règle du propriétaire : le dessin doit
// rester bien visible, y compris sur un bouton coloré). Trois modes :
//   clavier  — « clavier numéroteur » (code USSD composé sur le téléphone) : mode par défaut de la plateforme ;
//   pawapay  — PawaPay (paiement Mobile Money : Orange, Moov, Telecel) ;
//   pispi    — PI-SPI (virement instantané de la BCEAO, avec l'application de sa banque).
export const MODES_PAIEMENT = {
  clavier: "Clavier numéroteur",
  pawapay: "PawaPay (Mobile Money)",
  pispi: "PI-SPI (virement instantané)",
};

function Dessin({ mode }) {
  if (mode === "pawapay") {
    // Téléphone avec une pièce : paiement Mobile Money
    return (
      <g fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="4" width="14" height="24" rx="3" />
        <path d="M14 24.5h4" />
        <circle cx="25" cy="21" r="6" fill="#fff" />
        <path d="M25 18.2v5.6M23.2 19.8c.4-.9 3.6-.9 3.6.4s-3.6.5-3.6 1.8 3.2 1.3 3.6.4" strokeWidth="1.5" />
      </g>
    );
  }
  if (mode === "pispi") {
    // Banque et flèche : virement instantané entre banques
    return (
      <g fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4 4.5 10v2h23v-2L16 4Z" />
        <path d="M8 14.5v8M13 14.5v8M19 14.5v8M24 14.5v8" />
        <path d="M5 26h22" />
        <path d="M22 29h6m0 0-2-2m2 2-2 2" strokeWidth="1.8" />
      </g>
    );
  }
  // Clavier numéroteur : 3 colonnes × 4 rangées de touches
  return (
    <g fill="#334155">
      {[0, 1, 2, 3].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={9 + c * 7} cy={6.5 + r * 6.5} r="2.3" />))}
    </g>
  );
}

/** Logo d'un mode de paiement : mode = "clavier" | "pawapay" | "pispi". `taille` en pixels (carré blanc arrondi). */
export default function LogoMode({ mode = "clavier", taille = 32, className = "" }) {
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-lg bg-white ring-1 ring-gray-200 ${className}`} style={{ width: taille, height: taille }}
      role="img" aria-label={MODES_PAIEMENT[mode] || mode}>
      <svg viewBox="0 0 32 32" width={taille * 0.78} height={taille * 0.78} aria-hidden="true"><Dessin mode={mode} /></svg>
    </span>
  );
}
