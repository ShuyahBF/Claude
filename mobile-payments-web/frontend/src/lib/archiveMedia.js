// archiveMedia.js — préparation des documents à archiver (lot 56) : photos réduites, capture de l'écran, aperçus.

/** Photo ou image réduite (2 000 px au plus, JPEG) : un document lisible pèse 300 à 800 Ko au lieu de plusieurs Mo.
 *  Les PDF et les images déjà petites ou animées sont gardés tels quels. */
export async function reduireImage(fichier, maxPx = 2000, qualite = 0.88) {
  if (!fichier.type.startsWith("image/") || /gif|svg/.test(fichier.type)) return fichier;
  try {
    const bitmap = await createImageBitmap(fichier);
    const echelle = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    if (echelle === 1 && fichier.size < 700_000) { bitmap.close?.(); return fichier; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * echelle); canvas.height = Math.round(bitmap.height * echelle);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);     // fond blanc (PNG transparents)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualite));
    return blob && blob.size < fichier.size ? new File([blob], fichier.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : fichier;
  } catch { return fichier; }
}

/** Le navigateur sait-il capturer l'écran ? (ordinateurs ; la plupart des navigateurs de téléphone ne le savent pas) */
export const captureEcranDisponible = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

/** Capture UNE image de l'écran, de la fenêtre ou de l'onglet choisi par l'utilisateur (le navigateur demande lequel). Renvoie un fichier PNG ou null. */
export async function capturerEcran() {
  let flux;
  try {
    flux = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement("video");
    video.srcObject = flux; video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 400));                                   // laisse l'image se stabiliser
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    return blob ? new File([blob], `capture-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`, { type: "image/png" }) : null;
  } catch { return null; }                                                            // annulé ou refusé par l'utilisateur
  finally { flux?.getTracks().forEach((t) => t.stop()); }
}

/** Année d'une date « AAAA-MM-JJ » (celle du jour par défaut). */
export const anneeDe = (date) => (/^\d{4}/.test(date || "") ? date.slice(0, 4) : String(new Date().getFullYear()));
export const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const taille = (o) => (o >= 1_000_000 ? `${(o / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(o / 1000))} Ko`);

/** Enregistre un Blob dans le dossier de téléchargements de l'appareil. */
export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
