// Reconnaissance des QR codes lus par la caméra (lot 38).
//   - « paiement-mobile » : QR créé par ce site (adresse avec ?operateur=…&service=…&code=…) ;
//   - « operateur »       : QR imprimé sur une plaque d'opérateur. Orange Money : « OBF_$ » + base64 d'un numéro
//                           (ex. OBF_$MDAwMDAyMDExMTY3 → 000002011167). Ce numéro n'est PAS le code marchand.
// Pour ajouter un opérateur (ex. Moov Africa) : ajouter une ligne à FORMATS_OPERATEURS quand son format est connu.
const FORMATS_OPERATEURS = [
  // { operateur: nom exact dans le catalogue, motif: expression du texte du QR, extraire: (résultat du motif) → identifiant numérique }
  {
    operateur: "Orange",
    motif: /^OBF_\$([A-Za-z0-9+/=]+)$/,
    extraire: (m) => { try { return atob(m[1]); } catch { return ""; } },
  },
];

/** Analyse le texte d'un QR code. Renvoie { type, … } ou null si le QR n'est pas reconnu. */
export function analyserQr(texte) {
  const t = (texte || "").trim();
  for (const f of FORMATS_OPERATEURS) {
    const m = t.match(f.motif);
    if (m) {
      const identifiant = f.extraire(m);
      if (/^\d{4,30}$/.test(identifiant)) return { type: "operateur", operateur: f.operateur, identifiant };
    }
  }
  try {
    const url = new URL(t);
    const operateur = url.searchParams.get("operateur");
    if (operateur) return { type: "paiement-mobile", operateur, service: url.searchParams.get("service"), code: url.searchParams.get("code") || "" };
  } catch { /* pas une adresse */ }
  return null;
}
