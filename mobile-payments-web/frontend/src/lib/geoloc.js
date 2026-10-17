// ============================================================================
// Géolocalisation (lot 49) : chaque compte l'active ou la désactive dans son Profil (réglage de départ : désactivée).
//   - positionActuelle()   : position du téléphone (le navigateur demande l'autorisation la première fois) ou null ;
//   - à la préparation d'un paiement : la position part avec la demande (le serveur l'ignore si le compte n'a pas activé la fonction) ;
//   - ArriveeMarchand.jsx  : à l'ouverture de l'application, propose d'ouvrir le paiement avec le marchand retrouvé.
// Limite honnête : un site ne peut pas surveiller la position application fermée ; l'invitation apparaît quand l'application est ouverte.
// ============================================================================

/** Position actuelle {lat, lon, precision} ou null (refus, délai dépassé, appareil sans GPS). Jamais d'exception. */
export function positionActuelle({ delaiMs = 8000, ageMaxMs = 30000 } = {}) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, precision: Math.round(p.coords.accuracy || 0) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: delaiMs, maximumAge: ageMaxMs },
    );
  });
}

/** Vrai si le navigateur sait géolocaliser. */
export function geolocalisationDisponible() { return "geolocation" in navigator; }

/** État de l'autorisation du navigateur : "granted" | "denied" | "prompt" | "inconnu". */
export async function etatAutorisation() {
  try { return (await navigator.permissions.query({ name: "geolocation" })).state; } catch { return "inconnu"; }
}
