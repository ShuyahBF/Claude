// Test de RENDU des écrans de paiement (lot 191/192) : chaque écran est « dessiné » une fois, côté serveur, avec de fausses données.
// Il aurait détecté la page blanche du 17/11/2026 (variable lue avant sa déclaration : l'écran plantait dès son affichage).
// Lancer : cd frontend && node tests/rendu.test.mjs   (utilise Vite et React déjà installés ; aucun navigateur)
import { createServer } from "vite";

const ok = (n, v) => { console.log((v ? "OK  " : "ECHEC ") + n); if (!v) process.exitCode = 1; };
const serveur = await createServer({ root: new URL("..", import.meta.url).pathname, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  // React et ses bibliothèques sont chargés par Node (même exemplaire que celui que Vite donne aux écrans) ; seuls les fichiers de src/ passent par Vite
  const React = (await import("react")).default;
  const { renderToString } = await import("react-dom/server");
  const { MemoryRouter } = await import("react-router-dom");
  const { ToastProvider } = await serveur.ssrLoadModule("/src/components/Toast.jsx");
  const { AuthProvider } = await serveur.ssrLoadModule("/src/context/AuthContext.jsx");
  const h = React.createElement;
  const dans = (enfant) => h(MemoryRouter, null, h(ToastProvider, null, h(AuthProvider, null, enfant)));

  const PAIEMENT = { id: "p-1", operateur: "Orange", service_nom: "Paiement marchand", categorie: "merchant_payment", montant: 2500, code_ussd: "*144*10*6557908*2500*PIN#",
    marchand: { code: "6557908", libelle: "La Ménagère" }, valeurs: { code: "6557908", amount: "2500" }, statut: "prepare" };

  for (const [nom, chemin, props] of [
    ["PaiementDirect (paiement en ligne)", "/src/components/PaiementDirect.jsx", { paiement: PAIEMENT, onTermine: () => {} }],
    ["PaiementDirect (paiement préparé hors connexion)", "/src/components/PaiementDirect.jsx", { paiement: { ...PAIEMENT, id: "local-abc", hors_ligne: true }, onTermine: () => {} }],
    ["PaiementDirect (marchand sans nom)", "/src/components/PaiementDirect.jsx", { paiement: { ...PAIEMENT, marchand: { code: "6557908", libelle: null } }, onTermine: () => {} }],
    ["Payer (page de paiement)", "/src/pages/Payer.jsx", {}],
    ["SynchroHorsLigne", "/src/components/SynchroHorsLigne.jsx", {}],
    ["NomMarchandProfil", "/src/components/NomMarchandProfil.jsx", {}],
  ]) {
    let erreur = null, html = "";
    try { const Composant = (await serveur.ssrLoadModule(chemin)).default; html = renderToString(dans(h(Composant, props))); } catch (e) { erreur = e; }
    ok(`${nom} : s'affiche sans erreur${erreur ? ` — ${erreur.message}` : ""}`, !erreur);
    if (!erreur && nom.startsWith("PaiementDirect")) ok(`${nom} : montre le paiement`, html.includes("Paiement direct") && html.includes("Orange"));
  }

  // Lot 199 : l'avatar de Liluvine (portrait « dessin animé réaliste ») s'affiche dans tous ses états et toutes ses émotions
  {
    const Avatar = (await serveur.ssrLoadModule("/src/components/AvatarLiluvine.jsx")).default;
    let tout = true, motif = "";
    for (const etat of ["repos", "reflexion", "parle"]) for (const emotion of ["calme", "joie", "encouragement", "empathie", "surprise", "urgence"]) {
      try { const html = renderToString(h(Avatar, { etat, emotion, taille: 84 })); if (!html.includes('data-testid="avatar-liluvine"') || !html.includes("<svg")) { tout = false; motif = `${etat}/${emotion}`; } }
      catch (e) { tout = false; motif = `${etat}/${emotion} : ${e.message}`; }
    }
    ok(`AvatarLiluvine : 18 combinaisons état / émotion s'affichent${motif ? ` — ${motif}` : ""}`, tout);
  }
} finally { await serveur.close(); }
