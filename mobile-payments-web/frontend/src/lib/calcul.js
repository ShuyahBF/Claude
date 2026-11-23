// calcul.js — petite calculette SÛRE (lot 218) pour estimer un montant : + − × ÷ ( ) et % (« 20% » = 0,2 ; « 5000 + 10% » = 5500).
// Pas d'eval : analyseur à descente récursive. Logique PURE, testée par tests/calcul.test.mjs.
// Pour un développeur WinDev : c'est un évaluateur d'expression écrit à la main (priorité des opérateurs : parenthèses, × ÷, + −).

/** Découpe l'expression en jetons ; null si un caractère est inconnu. Les espaces (même insécables) dans un nombre sont ignorés (« 1 500 »). */
function jetons(texte) {
  const t = String(texte).replace(/[\s  ]/g, "").replace(/[x×*]/gi, "*").replace(/[÷:]/g, "/").replace(/−/g, "-").replace(/,/g, ".");
  const r = [];
  for (let i = 0; i < t.length;) {
    const c = t[i];
    if (/[0-9.]/.test(c)) { let j = i; while (j < t.length && /[0-9.]/.test(t[j])) j++; const v = Number(t.slice(i, j)); if (!Number.isFinite(v) || (t.slice(i, j).match(/\./g) || []).length > 1) return null; r.push({ n: v }); i = j; }
    else if ("+-*/()%".includes(c)) { r.push({ o: c }); i++; }
    else return null;
  }
  return r;
}

/** Évalue l'expression. Rend un nombre, ou null si elle est incomplète ou invalide (division par zéro comprise). */
export function evaluer(texte) {
  const j = jetons(texte);
  if (!j || !j.length) return null;
  let p = 0;
  const suivant = () => j[p];
  // facteur = [+|-] ( nombre | "(" somme ")" ) [ "%" ] ; rend { v, pct } (pct = vrai si le nombre est suivi de %)
  function facteur() {
    const s = suivant();
    if (!s) return null;
    if (s.o === "-") { p++; const f = facteur(); return f === null ? null : { v: -f.v, pct: false }; }
    if (s.o === "+") { p++; return facteur(); }
    let v;
    if (s.o === "(") { p++; const e = somme(); if (e === null || !suivant() || suivant().o !== ")") return null; p++; v = e; }
    else if (s.n !== undefined) { p++; v = s.n; }
    else return null;
    if (suivant() && suivant().o === "%") { p++; return { v: v / 100, pct: true }; }
    return { v, pct: false };
  }
  // terme = facteur { (*|/) facteur }
  function terme() {
    const f = facteur();
    if (f === null) return null;
    let v = f.v, pct = f.pct;
    while (suivant() && (suivant().o === "*" || suivant().o === "/")) {
      const op = j[p++].o;
      const d = facteur();
      if (d === null || (op === "/" && d.v === 0)) return null;
      v = op === "*" ? v * d.v : v / d.v; pct = false;
    }
    return { v, pct };
  }
  // somme = terme { (+|-) terme } ; « a + b% » = a + (a × b/100)
  function somme() {
    const t = terme();
    if (t === null) return null;
    let v = t.v;
    while (suivant() && (suivant().o === "+" || suivant().o === "-")) {
      const op = j[p++].o;
      const d = terme();
      if (d === null) return null;
      const droite = d.pct ? v * d.v : d.v;
      v = op === "+" ? v + droite : v - droite;
    }
    return v;
  }
  const v = somme();
  if (v === null || p < j.length) return null;                            // reste non compris (ex. « 5 5 »)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** Montant entier en FCFA (arrondi) ; null si invalide ou négatif. */
export function montantEntier(texte) {
  const v = evaluer(texte);
  return v === null || v < 0 ? null : Math.round(v);
}
