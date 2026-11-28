// Captures d'écran découragées sur tout le site (règle « Sécurité de l'interface »).
// Limite à rappeler : un site web ne peut pas bloquer une capture faite par le système ou le téléphone.
export function installerSecuriteEcran() {
  const flou = (oui) => document.documentElement.classList.toggle("flou-securite", oui);
  document.addEventListener("keyup", (e) => {
    if (e.key === "PrintScreen") {                      // Impr. écran : presse-papiers vidé + écran flouté un instant
      navigator.clipboard?.writeText("").catch(() => {});
      flou(true); setTimeout(() => flou(false), 1500);
    }
  });
  window.addEventListener("blur", () => flou(true));    // page qui perd le focus : contenu flouté
  window.addEventListener("focus", () => flou(false));
  document.addEventListener("visibilitychange", () => flou(document.hidden));
  // Clic droit, appui long et glisser interdits sur les médias
  const bloquer = (e) => { if (e.target.closest?.("img, video, canvas")) e.preventDefault(); };
  document.addEventListener("contextmenu", bloquer);
  document.addEventListener("dragstart", bloquer);
}
