// Réduit une photo avant l'envoi (téléphone : plusieurs Mo) : côté long ≤ 1 600 px, JPEG qualité 0,82 (≈ 300 Ko).
// Renvoie une « data URL » JPEG. Les photos prises de côté sont redressées par le navigateur (EXIF).
export async function reduireImage(fichier, bord = 1600, qualite = 0.82) {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  const echelle = Math.min(1, bord / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * echelle);
  canvas.height = Math.round(bitmap.height * echelle);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", qualite);
}
