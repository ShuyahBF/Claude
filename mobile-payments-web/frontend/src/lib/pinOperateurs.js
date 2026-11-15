// Opérateurs dont la fenêtre de code secret s'ouvre TOUJOURS, même quand le code secret est dans la séquence USSD.
// Orange : constaté en essai réel (15/11/2026) ; l'envoi « en une fois » est refusé (code d'échec -1), seul le mode en deux temps fonctionne.
// Pour un développeur WinDev : une liste unique, lue par le paiement direct et par le Profil, pour que les deux disent la même chose.
const EXIGENT_LA_FENETRE = ["orange"];

/** Vrai si l'opérateur impose sa fenêtre pour le code secret (mode en deux temps obligatoire). */
export const exigeFenetrePin = (operateur) => EXIGENT_LA_FENETRE.some((o) => String(operateur || "").toLowerCase().includes(o));
