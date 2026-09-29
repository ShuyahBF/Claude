/** @type {import('tailwindcss').Config} */
import colors from "tailwindcss/colors";

// Même charte qu'adLyn (SAWALI SMART SYSTEMS) : bleu nuit pour les bandeaux,
// bleu vif pour les boutons, indigo pour les sur-titres, gris ardoise.
// Titres en Space Grotesk, textes en Geist, codes USSD en Geist Mono.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        gray: colors.slate,
        primary: "#1e90ff", // boutons et liens
        "primary-dark": "#0a66c2", // survol des boutons
        "primary-clair": "#2ba4ff", // textes vifs sur fond sombre
        accent: "#4f46e5", // sur-titres, mots mis en valeur
        ink: "#081226", // texte principal (bleu nuit)
        nuit: { 950: "#050b18", 900: "#081226", 800: "#0a1730", 700: "#0e1f3d", 600: "#152232" },
        // Couleurs des opérateurs (pastilles)
        orange: { operateur: "#ff7900" },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
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
