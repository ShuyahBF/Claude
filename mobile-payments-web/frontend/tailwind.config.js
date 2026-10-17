/** @type {import('tailwindcss').Config} */
import colors from "tailwindcss/colors";

// CHARTE du 17/10/2026 (inspirée du design « Nicole Windle Yoga » fourni par le propriétaire) :
//   - vert-bleu profond #2b4447 pour les bandeaux, prune #622e44 pour les boutons et les liens (couleurs mesurées sur la maquette) ;
//   - fond blanc / crème, textes en Open Sans, menus en petites capitales espacées, nom de l'application en écriture manuscrite.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        gray: colors.slate,
        primary: "#622e44", // boutons et liens (prune)
        "primary-dark": "#4a2234", // survol des boutons
        "primary-clair": "#e3b6c9", // textes vifs sur fond sombre
        accent: "#2b4447", // sur-titres, mots mis en valeur (vert-bleu profond)
        ink: "#1c2d30", // texte principal (vert-bleu très sombre)
        creme: "#f7f5f3", // fond de page
        nuit: { 950: "#1b2c2e", 900: "#2b4447", 800: "#355459", 700: "#3f646a", 600: "#4a7379" },
        // Couleurs des opérateurs (pastilles)
        orange: { operateur: "#ff7900" },
      },
      fontFamily: {
        sans: ["Open Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Open Sans", "sans-serif"],
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
