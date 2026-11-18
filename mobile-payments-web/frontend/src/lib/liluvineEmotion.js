// Émotion de LILUVINE (la coach) : détectée à partir de ses propres mots, et initiative d'une conversation selon le moment.
// Pur calcul, sans réseau : rien de ce que l'utilisateur écrit n'est envoyé ailleurs pour cela (les confidences restent sur le téléphone).
// Pour un développeur WinDev : deux procédures globales, EmotionDeTexte(texte) et InitiativeDuMoment(contexte), sans accès fichier.

/** Émotions de l'avatar. */
export const EMOTIONS = ["calme", "joie", "encouragement", "empathie", "surprise", "urgence"];

const sansAccents = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Mots repères (sans accents) par émotion : le texte est lu en minuscules, sans accents
const MOTS = {
  encouragement: ["courage", "tu peux", "vous pouvez", "continuez", "continue", "perseverez", "persevere", "fier", "fiere", "confiance en vous", "confiance en toi",
    "un pas apres l'autre", "petit a petit", "vous y arriverez", "tu y arriveras", "bravo pour", "belle etape", "etape"],
  joie: ["bravo", "felicitation", "super", "genial", "formidable", "magnifique", "ravie", "heureuse", "contente", "bonne nouvelle", "quelle joie", "youpi", "se rejouis"],
  empathie: ["desolee", "difficile", "triste", "je comprends", "douloureux", "peine", "douleur", "fatigue", "epuis", "seul", "inquiet", "stress", "pleurer", "je suis la", "courage a vous", "ca doit etre"],
  surprise: ["vraiment", "ah bon", "wow", "incroyable", "surprenant", "etonnant"],
};
// En cas d'égalité, l'ordre de priorité : encouragement, joie, empathie, surprise
const PRIORITE = ["encouragement", "joie", "empathie", "surprise"];

/** Émotion de la réponse de Liluvine : « calme » par défaut ; « urgence » quand SAWALI a signalé une détresse (le texte n'est alors pas analysé). */
export function emotionDeTexte(texte, urgence = false) {
  if (urgence) return "urgence";
  const t = sansAccents(texte);
  let meilleure = "calme", score = 0;
  for (const e of PRIORITE) {
    const n = MOTS[e].reduce((s, m) => s + (t.includes(m) ? 1 : 0), 0);
    if (n > score) { meilleure = e; score = n; }
  }
  return meilleure;
}

/** Jour local « AAAA-MM-JJ » (celui de l'utilisateur, pas UTC). */
export const jourLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const BONJOURS = [
  "Bonjour ! Comment démarre votre journée ? Dites-moi ce qui vous attend aujourd'hui.",
  "Bonjour et belle journée à vous ! Comment vous sentez-vous ce matin ?",
  "Bonjour ! Bien dormi ? Racontez-moi comment commence cette journée.",
  "Bonjour ! Une nouvelle journée commence : qu'aimeriez-vous y réussir aujourd'hui ?",
  "Bonjour ! Je suis là pour vous écouter ce matin. Comment allez-vous ?",
];

/**
 * BONJOUR DU MATIN : tous les matins (de 5 h à 11 h, heure du téléphone), Liluvine écrit la première, UNE SEULE fois par jour.
 * `dernierBonjour` = jour local « AAAA-MM-JJ » du dernier bonjour. La phrase change d'un jour à l'autre. Phrase locale : aucun appel au serveur.
 * Rend { texte, emotion, jour } ou null (hors du matin, ou bonjour déjà dit aujourd'hui).
 */
export function bonjourDuMatin({ maintenant = new Date(), dernierBonjour = null } = {}) {
  const h = maintenant.getHours();
  if (h < 5 || h >= 11) return null;
  const jour = jourLocal(maintenant);
  if (dernierBonjour === jour) return null;
  const rang = Math.floor(maintenant.getTime() / 86400000) % BONJOURS.length;
  return { texte: BONJOURS[rang], emotion: "joie", jour };
}

const HUIT_HEURES = 8 * 3600 * 1000;
const TROIS_JOURS = 3 * 24 * 3600 * 1000;

/**
 * Liluvine ÉCRIT PARFOIS LA PREMIÈRE (une phrase locale, aucun appel au serveur, donc aucun coût et aucune confidence envoyée).
 * Règles : jamais deux initiatives à moins de 8 heures ; ensuite une chance sur deux et demie (60 %) ; le texte dépend de l'heure,
 * ou du temps écoulé depuis la dernière page du journal (plus de 3 jours : elle prend des nouvelles).
 * `alea` est un nombre entre 0 et 1 (injecté pour pouvoir tester). Rend { texte, emotion } ou null.
 */
export function initiativeDuMoment({ maintenant = new Date(), derniereEntree = null, derniereInitiative = null, alea = Math.random() } = {}) {
  const ms = maintenant.getTime();
  if (derniereInitiative && ms - derniereInitiative < HUIT_HEURES) return null;
  if (alea >= 0.6) return null;
  if (derniereEntree && ms - derniereEntree > TROIS_JOURS) {
    return { texte: "Ça fait quelques jours que votre journal est resté fermé… Tout va bien ? Je suis là si vous voulez en parler.", emotion: "empathie" };
  }
  const h = maintenant.getHours();
  if (h >= 5 && h < 11) return { texte: "Bonjour ! Comment démarre votre journée ? Dites-moi ce qui vous attend aujourd'hui.", emotion: "joie" };
  if (h >= 11 && h < 18) return { texte: "Coucou ! Une petite pause ? Qu'est-ce qui vous a fait sourire aujourd'hui ?", emotion: "joie" };
  if (h >= 18 && h < 22) return { texte: "Bonsoir ! Comment s'est passée votre journée ? Je suis là si vous avez envie de la raconter.", emotion: "calme" };
  return { texte: "Il se fait tard… Un peu de mal à trouver le sommeil ? Je suis là si vous voulez vider votre tête.", emotion: "empathie" };
}
