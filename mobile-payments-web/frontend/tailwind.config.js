/** @type {import('tailwindcss').Config} */
import colors from "tailwindcss/colors";

// CHARTE auRor du 18/10/2026 : les couleurs sont MESURÉES sur le logo fourni par le propriétaire (téléphone, orbite, tuiles, « R » rouge) :
//   - cobalt #0031a0 (téléphone) pour les bandeaux, azur #006bf7 pour les boutons et les liens, cyan #02bfee et menthe #06c7a6 (orbite) ;
//   - violet #4926d7, émeraude #0ba957 (tuiles) et rouge #f21313 (le « R ») en touches rares ;
//   - fond blanc légèrement bleuté, textes en Open Sans, titres en Sora ; le nom « auRor » est toujours l'image du logo.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        gray: colors.slate,
        primary: "#006bf7", // boutons et liens (azur de l'orbite)
        "primary-dark": "#0050c4", // survol des boutons
        "primary-clair": "#9cc7ff", // textes vifs sur fond sombre
        accent: "#0a3d9e", // sur-titres, mots mis en valeur (bleu profond)
        ink: "#0f1d3d", // texte principal (bleu nuit très sombre)
        creme: "#f3f7fd", // fond de page (blanc bleuté)
        nuit: { 950: "#051a52", 900: "#0a2c85", 800: "#0f3ca3", 700: "#1550c4", 600: "#1f64e0" },
        // Couleurs du logo en touches rares
        auror: { cyan: "#02bfee", menthe: "#06c7a6", violet: "#4926d7", emeraude: "#0ba957", rouge: "#f21313" },
        // Couleurs des opérateurs (pastilles)
        orange: { operateur: "#ff7900" },
      },
      fontFamily: {
        sans: ["Open Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Sora", "Open Sans", "sans-serif"],
        script: ['"Mrs Saint Delafield"', "cursive"], // nom de l'application, en écriture manuscrite
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "0.5rem", "2xl": "0.75rem", "3xl": "1rem" },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": { "0%": { transform: "translateY(12px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
      },
      animation: { "fade-in": "fade-in 0.2s ease-out", "slide-up": "slide-up 0.25s ease-out" },
    },
  },
  plugins: [],
};
