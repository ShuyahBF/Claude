// Petit « bloup » de bulle quand un message de Liluvine arrive : deux notes douces, synthétisées (aucun fichier son à charger).
// Réglage « son activé » mémorisé dans le navigateur (activé par défaut). Jamais d'erreur : un téléphone qui refuse le son ne gêne rien
// (les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : avant cela, le son est simplement ignoré).
const CLE = "mpw_liluvine_son";
let contexte = null;

export function sonActif() { try { return localStorage.getItem(CLE) !== "0"; } catch { return true; } }
export function reglerSon(actif) { try { localStorage.setItem(CLE, actif ? "1" : "0"); } catch { /* sans importance */ } }

export async function jouerBulle() {
  if (!sonActif()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    contexte = contexte || new Ctx();
    if (contexte.state === "suspended") await contexte.resume();
    const t0 = contexte.currentTime;
    [[660, 0], [880, 0.11]].forEach(([frequence, retard]) => {          // deux notes montantes : la, puis la plus haut
      const osc = contexte.createOscillator(), gain = contexte.createGain();
      osc.type = "sine"; osc.frequency.value = frequence;
      gain.gain.setValueAtTime(0.0001, t0 + retard);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + retard + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + retard + 0.22);
      osc.connect(gain); gain.connect(contexte.destination);
      osc.start(t0 + retard); osc.stop(t0 + retard + 0.25);
    });
  } catch { /* le son est un confort, jamais une obligation */ }
}
