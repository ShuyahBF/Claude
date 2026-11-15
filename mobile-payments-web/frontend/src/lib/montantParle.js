// Montant PRONONCÉ → nombre : « quatre mille sept cents francs » → 4700 ; « 4 700 FCFA » → 4700 ; « 8 mille » → 8000.
// Sert à la saisie vocale du montant (personne qui ne peut pas écrire, ou marchand qui dicte le montant). Logique pure, testée par tests/montantParle.test.mjs.
// Pour un développeur WinDev : on lit les mots un à un en gardant deux compteurs : le groupe en cours (moins de 1000) et le total ; « mille », « million »
// ferment le groupe et l'ajoutent au total. Les mots inconnus (« le montant est de… ») sont ignorés ; sans aucun nombre reconnu, le résultat est null.
const UNITES = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
const DIZAINES = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90, quatrevingt: 80, quatrevingts: 80 };
const PLAFOND = 50_000_000;                                                   // au-delà : probablement une erreur de reconnaissance

/** Texte prononcé → nombre entier de francs, ou null si aucun nombre n'est reconnu. */
export function montantParle(texte) {
  let t = String(texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");     // sans accents
  t = t.replace(/(\d)[\s.,  ](?=\d{3}(?!\d))/g, "$1");                                  // 4 700 · 4.700 · 4,700 → 4700 (milliers)
  t = t.replace(/quatre[\s-]+vingts?/g, "quatrevingt").replace(/[-']/g, " ");
  let total = 0, groupe = 0, trouve = false;
  for (const mot of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^\d+$/.test(mot)) { groupe += Number(mot); trouve = true; continue; }
    if (mot in UNITES) { groupe += UNITES[mot]; trouve = true; continue; }
    if (mot in DIZAINES) { groupe += DIZAINES[mot]; trouve = true; continue; }
    if (mot === "dix") { groupe += 10; trouve = true; continue; }
    if (mot === "cent" || mot === "cents") { groupe = (groupe === 0 ? 1 : groupe) * 100; trouve = true; continue; }
    if (mot === "mille" || mot === "milles") { total += (groupe === 0 ? 1 : groupe) * 1000; groupe = 0; trouve = true; continue; }
    if (mot === "million" || mot === "millions") { total += (groupe === 0 ? 1 : groupe) * 1_000_000; groupe = 0; trouve = true; continue; }
    if (mot === "milliard" || mot === "milliards") { total += (groupe === 0 ? 1 : groupe) * 1_000_000_000; groupe = 0; trouve = true; continue; }
    // « et », « francs », « cfa », « le montant est de »… : ignorés
  }
  const valeur = total + groupe;
  return trouve && valeur > 0 && valeur <= PLAFOND ? valeur : null;
}

/** Plusieurs transcriptions possibles (le téléphone en propose jusqu'à 5) → montants distincts, dans l'ordre de confiance du téléphone. */
export function montantsParles(transcriptions) {
  const vus = new Set(); const sortie = [];
  for (const t of transcriptions || []) {
    const v = montantParle(t);
    if (v && !vus.has(v)) { vus.add(v); sortie.push({ valeur: v, entendu: String(t) }); }
  }
  return sortie;
}
