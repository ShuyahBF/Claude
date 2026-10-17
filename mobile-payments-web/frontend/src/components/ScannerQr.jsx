import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";

// Scanner de QR code avec la caméra du téléphone (bibliothèque html5-qrcode).
// Appelle onResultat(texte) dès qu'un code est lu, puis se ferme.
export default function ScannerQr({ ouvert, onFermer, onResultat }) {
  const { user } = useAuth();
  const estAdmin = user?.role === "admin";   // « Charger une image » : réservé à l'administrateur (lot 41)
  const zoneId = "zone-scanner-qr";
  const scannerRef = useRef(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!ouvert) return undefined;
    let actif = true;
    setErreur("");
    // Import à la demande : la bibliothèque n'est chargée que si on scanne
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!actif) return;
      const scanner = new Html5Qrcode(zoneId);
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" }, // caméra arrière
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (texte) => {
            scanner.stop().catch(() => {});
            scannerRef.current = null;
            onResultat(texte);
          },
          () => {}, // image sans QR code : on continue
        )
        .catch(() => setErreur("Impossible d'accéder à la caméra. Autorisez-la dans votre navigateur, ou saisissez le code marchand."));
    });
    return () => {
      actif = false;
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [ouvert, onResultat]);

  // Administrateur : lecture d'un QR code dans une IMAGE enregistrée (capture, photo) au lieu de la caméra
  const [lecture, setLecture] = useState(false);
  const chargerImage = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setLecture(true); setErreur("");
    try {
      await scannerRef.current?.stop().catch(() => {});      // la caméra s'arrête avant de lire le fichier
      scannerRef.current = null;
      const { Html5Qrcode } = await import("html5-qrcode");
      const texte = await new Html5Qrcode("zone-fichier-qr").scanFile(fichier, false);
      onResultat(texte);
    } catch {
      setErreur("Aucun QR code lisible dans cette image. Fermez cette fenêtre puis rouvrez-la pour reprendre la caméra.");
    } finally { setLecture(false); }
  };

  return (
    <Modal ouvert={ouvert} titre="Scanner un QR code marchand" onFermer={onFermer}>
      <div id={zoneId} className="overflow-hidden rounded-xl bg-black" />
      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
      <p className="mt-3 text-sm text-gray-500">Placez le QR code du marchand dans le cadre.</p>
      {estAdmin && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <label className="btn-outline inline-flex cursor-pointer items-center gap-2 text-sm">
            🖼️ {lecture ? "Lecture…" : "Charger une image contenant un QR code"}
            <input type="file" accept="image/*" className="hidden" onChange={chargerImage} disabled={lecture} data-testid="qr-image" />
          </label>
          <p className="mt-1 text-xs text-gray-400">Réservé à l'administrateur.</p>
          <div id="zone-fichier-qr" className="hidden" />
        </div>
      )}
    </Modal>
  );
}
