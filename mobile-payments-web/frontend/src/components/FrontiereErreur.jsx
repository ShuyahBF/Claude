import { Component } from "react";
import { LIBELLE_VERSION } from "@/version";

// ============================================================================
// FRONTIÈRE D'ERREUR (lot 197) — fin des « pages blanches ».
// Avant : si UN écran plantait à l'affichage, React retirait toute la page : écran blanc, aucune explication.
// Maintenant : la page reste debout et montre ce qui s'est passé (message + début de la pile d'appels + version), avec « Copier le détail »
// (à envoyer pour comprendre), « Recharger » et « Réinitialiser » (efface le verrou d'écran et les données de session gardées sur le téléphone).
// Pour un développeur WinDev : c'est l'équivalent d'un gestionnaire d'exceptions global autour de la fenêtre principale.
// ============================================================================
export default class FrontiereErreur extends Component {
  state = { erreur: null, copie: false };

  static getDerivedStateFromError(erreur) { return { erreur }; }

  componentDidCatch(erreur, info) {
    // Gardé aussi dans la console (et visible dans un enregistrement d'écran de débogage)
    // eslint-disable-next-line no-console
    console.error("Erreur d'affichage", erreur, info?.componentStack);
  }

  detail() {
    const e = this.state.erreur;
    return [`auRor — ${LIBELLE_VERSION}`, `Page : ${typeof window !== "undefined" ? window.location.pathname : ""}`,
      `Erreur : ${e?.message || e}`, "", String(e?.stack || "").split("\n").slice(0, 8).join("\n")].join("\n");
  }

  copier = async () => {
    try { await navigator.clipboard.writeText(this.detail()); this.setState({ copie: true }); } catch { /* presse-papiers refusé : le texte reste visible à l'écran */ }
  };

  reinitialiser = () => {
    // Verrou d'écran et données de session du téléphone : on repart propre (le compte n'est pas supprimé, il faudra peut-être se reconnecter)
    try { sessionStorage.clear(); } catch { /* stockage indisponible */ }
    window.location.assign("/");
  };

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{ minHeight: "100dvh", padding: 16, background: "#F7F5F3", color: "#111", fontFamily: "system-ui, sans-serif" }} role="alert" data-testid="frontiere-erreur">
        <div style={{ maxWidth: 480, margin: "0 auto", background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,.12)" }}>
          <p style={{ fontSize: 32, margin: 0 }} aria-hidden="true">⚠️</p>
          <h1 style={{ fontSize: 18, margin: "8px 0" }}>Un écran n'a pas pu s'afficher</h1>
          <p style={{ fontSize: 14, color: "#444" }}>Vos données ne sont pas perdues. Touchez « Recharger ». Si cela revient, touchez « Copier le détail » et envoyez-le pour qu'on corrige.</p>
          <pre style={{ fontSize: 11, background: "#F3F4F6", padding: 8, borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflow: "auto" }}>{this.detail()}</pre>
          <div style={{ display: "grid", gap: 8 }}>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: 12, borderRadius: 10, border: 0, background: "#0F6B4A", color: "#fff", fontWeight: 700 }}>🔄 Recharger</button>
            <button type="button" onClick={this.copier} style={{ padding: 12, borderRadius: 10, border: "1px solid #999", background: "#fff" }}>{this.state.copie ? "✅ Détail copié" : "📋 Copier le détail"}</button>
            <button type="button" onClick={this.reinitialiser} style={{ padding: 12, borderRadius: 10, border: "1px solid #999", background: "#fff" }}>🧹 Réinitialiser l'écran et repartir</button>
          </div>
        </div>
      </div>
    );
  }
}
