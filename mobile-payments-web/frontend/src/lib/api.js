import axios from "axios";

// Adresse de l'API : VITE_API_BASE_URL si définie au build (fixée dans render.yaml),
// sinon le serveur local en développement.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

// Session : cookie HttpOnly posé par le serveur à la connexion (withCredentials =
// le navigateur l'envoie à chaque appel). Ni jeton ni mot de passe dans le stockage
// du navigateur. L'en-tête « X-Paiement-Mobile » protège contre les requêtes
// forgées depuis un autre site (CSRF).
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "X-Paiement-Mobile": "1" },
});

// Messages génériques du framework (en anglais) : jamais affichés tels quels
const MESSAGES_GENERIQUES = new Set(["not found", "method not allowed", "internal server error", "unauthorized",
  "forbidden", "unprocessable entity", "bad request"]);

/** Transforme une erreur d'API en phrase affichable en français. */
export function messageErreur(err, repli = "Une erreur est survenue") {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") {
    return MESSAGES_GENERIQUES.has(detail.trim().toLowerCase()) ? repli : detail;
  }
  if (!err?.response) return "Serveur injoignable. Vérifiez votre connexion.";
  return repli;
}

/** Montant lisible : 2500 -> « 2 500 FCFA ». */
export function fcfa(montant) {
  if (montant === null || montant === undefined || montant === "") return "—";
  return `${Number(montant).toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
}

/** Date lisible : « 29/09/2026 à 14:05 ». */
export function dateHeure(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Libellés français des catégories de services. */
export const CATEGORIES = {
  merchant_payment: "Paiement marchand",
  bill_payment: "Facture",
  money_transfer: "Transfert",
  airtime_topup: "Crédit de communication",
  internet_bundle: "Forfait Internet",
  other: "Autre",
};

/** Couleur de pastille de chaque opérateur (repère visuel). */
export function couleurOperateur(nom) {
  const n = (nom || "").toLowerCase();
  if (n.includes("orange")) return "#ff7900";
  if (n.includes("moov")) return "#0066b3";
  if (n.includes("telecel")) return "#e30613";
  return "#4f46e5";
}
