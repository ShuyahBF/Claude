// Lecture d'un PDF dans le navigateur (lot 84) : la PREMIÈRE page est dessinée puis renvoyée en « data URL » JPEG, exactement comme
// une photo réduite (voir image.js) ; elle part ensuite à la lecture OCR habituelle. Aucun fichier n'est envoyé tel quel au serveur.
// La bibliothèque (pdf.js, version « legacy » pour les anciens téléphones) n'est chargée QUE si l'utilisateur choisit un PDF :
// le reste du site n'en est pas alourdi.
export const estPdf = (fichier) => fichier?.type === "application/pdf" || /\.pdf$/i.test(fichier?.name || "");

// bord : côté long de l'image en pixels (1 600 comme pour les photos) ; qualite : JPEG 0,82
export async function pdfPremierePage(fichier, bord = 1600, qualite = 0.82) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  try {
    const page = await document.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const echelle = bord / Math.max(base.width, base.height);          // l'ordonnance est agrandie ou réduite à 1 600 px
    const vue = page.getViewport({ scale: echelle });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.round(vue.width);
    canvas.height = Math.round(vue.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";                                           // fond blanc : un PDF est transparent par défaut
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vue }).promise;
    return { image: canvas.toDataURL("image/jpeg", qualite), pages: document.numPages };
  } finally {
    document.destroy();
  }
}
