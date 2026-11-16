import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { messageErreur } from "@/lib/api";
import { MESSAGE_SECRET, coffreExiste, creerCoffre, lireEtatCoffre, ouvrirCoffre, ouvrirParCodeSecours, secretValide } from "@/lib/coffre";

// Accès au coffre (lot 168) : créer la phrase secrète / le code PIN la première fois, ou l'ouvrir ensuite (avec le code de l'application d'authentification si elle
// est activée), ou le rouvrir avec le code de secours si le secret est oublié. C'est le MÊME coffre que les archives en ligne.
// `onPret({ codeSecours })` est appelé quand la clé est ouverte en mémoire ; `codeSecours` = code à montrer UNE fois (création, ou très ancien coffre), sinon null.
export default function CoffreAcces({ onPret, onAnnuler, libelleOuverture = "Ouvrir mon coffre" }) {
  const toast = useToast();
  const [etat, setEtat] = useState(undefined);                // undefined = lecture ; null = service indisponible
  const [type, setType] = useState("pin");                    // création : « pin » | « phrase »
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [totp, setTotp] = useState("");
  const [oubli, setOubli] = useState(false); const [codeSaisi, setCodeSaisi] = useState("");
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { lireEtatCoffre().then(setEtat); }, []);

  if (etat === undefined) return <p className="text-sm text-gray-600">⏳ Lecture de votre coffre…</p>;
  if (etat === null) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">Le service du coffre est indisponible pour le moment : réessayez dans un instant.</p>;

  const existe = coffreExiste(etat);
  const typeAcces = existe ? (etat.pin || "phrase") : type;                // type attendu à l'ouverture
  const saisie = (set) => (e) => set(typeAcces === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value);

  const creer = async (e) => {
    e.preventDefault();
    if (!secretValide(type, a)) { toast.erreur(MESSAGE_SECRET(type)); return; }
    if (a !== b) { toast.erreur("Les deux saisies ne sont pas identiques"); return; }
    setOccupe(true); toast.info("Création de votre coffre en cours…");
    try { const { code } = await creerCoffre(a, type); onPret({ codeSecours: code }); }
    catch (err) { toast.erreur(messageErreur(err, "Création impossible")); } finally { setOccupe(false); }
  };
  const ouvrir = async (e) => {
    e.preventDefault(); setOccupe(true); toast.info("Ouverture en cours…");
    try { const r = await ouvrirCoffre(a, etat, totp); onPret({ codeSecours: r.codeSecours }); }
    catch (err) { toast.erreur(messageErreur(err, err?.message || "Ouverture impossible")); } finally { setOccupe(false); }
  };
  const recuperer = async (e) => {
    e.preventDefault();
    if (!secretValide(typeAcces, a)) { toast.erreur(MESSAGE_SECRET(typeAcces)); return; }
    if (a !== b) { toast.erreur("Les deux saisies ne sont pas identiques"); return; }
    setOccupe(true); toast.info("Vérification du code de secours en cours…");
    try { await ouvrirParCodeSecours(codeSaisi, a, typeAcces, etat); toast.succes("Coffre rouvert : votre nouveau secret est enregistré."); onPret({ codeSecours: null }); }
    catch (err) { toast.erreur(messageErreur(err, err?.message || "Récupération impossible")); } finally { setOccupe(false); }
  };
  const champSecret = (id, libelle, valeur, set) => (
    <div><label className="label" htmlFor={id}>{libelle}</label>
      <input id={id} className="input" type="password" autoComplete="off" inputMode={typeAcces === "pin" ? "numeric" : "text"} value={valeur} onChange={saisie(set)} /></div>);
  const retour = onAnnuler && <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={onAnnuler}>↩️ Retour</button>;

  // Création du coffre
  if (!existe) {
    return (
      <form className="space-y-3" onSubmit={creer} data-testid="coffre-creer">
        <p className="text-sm text-gray-700">Pour chiffrer vos sauvegardes, choisissez un <b>secret</b> que vous seul connaissez. Il vous sera demandé sur un nouveau téléphone. <b>Ni auRor ni SAWALI ne peuvent le retrouver.</b></p>
        <div><label className="label" htmlFor="cf-type">Type de secret</label>
          <select id="cf-type" className="input" value={type} onChange={(e) => { setType(e.target.value); setA(""); setB(""); }}>
            <option value="pin">🔢 Code PIN (4 à 12 chiffres)</option><option value="phrase">🔤 Phrase secrète (4 caractères ou plus)</option></select></div>
        {champSecret("cf-a", type === "pin" ? "Votre code PIN" : "Votre phrase secrète", a, setA)}
        {champSecret("cf-b", "Répétez-le", b, setB)}
        <div className="flex flex-wrap gap-2">{retour}<button type="submit" className="btn-primary" disabled={occupe}>🔐 Créer mon coffre</button></div>
      </form>
    );
  }
  // Secret oublié : code de secours
  if (oubli) {
    return (
      <form className="space-y-3" onSubmit={recuperer} data-testid="coffre-secours">
        <p className="text-sm text-gray-700">Saisissez le <b>code de secours</b> qui vous a été montré à la création, puis choisissez un nouveau {typeAcces === "pin" ? "code PIN" : "secret"}.</p>
        <div><label className="label" htmlFor="cf-code">Code de secours</label><input id="cf-code" className="input font-mono" autoComplete="off" placeholder="XXXX-XXXX-…" value={codeSaisi} onChange={(e) => setCodeSaisi(e.target.value)} /></div>
        {champSecret("cf-a", typeAcces === "pin" ? "Nouveau code PIN" : "Nouvelle phrase secrète", a, setA)}
        {champSecret("cf-b", "Répétez-le", b, setB)}
        <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setOubli(false)}>↩️ Retour</button><button type="submit" className="btn-primary" disabled={occupe}>🔓 Rouvrir avec ce code</button></div>
      </form>
    );
  }
  // Ouverture
  return (
    <form className="space-y-3" onSubmit={ouvrir} data-testid="coffre-ouvrir">
      <p className="text-sm text-gray-700">Saisissez votre {typeAcces === "pin" ? "code PIN" : "phrase secrète"} (le même que pour vos archives en ligne).</p>
      {champSecret("cf-a", typeAcces === "pin" ? "Votre code PIN" : "Votre phrase secrète", a, setA)}
      {etat.a2f && <div><label className="label" htmlFor="cf-totp">Code à 6 chiffres de l'application d'authentification</label><input id="cf-totp" className="input" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>}
      <div className="flex flex-wrap items-center gap-2">{retour}<button type="submit" className="btn-primary" disabled={occupe || !a}>🔓 {libelleOuverture}</button>
        <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => { setOubli(true); setA(""); setB(""); }}>Secret oublié ?</button></div>
    </form>
  );
}
