import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiClient, fcfa, messageErreur } from "@/lib/api";
import { capacites, lireSmsPaiements, payerDirectDialogue, journalUssd, payerDirectMontant } from "@/lib/pontAndroid";
import { enLettres } from "@/lib/nombreEnLettres";
import { analyserSms, chargerLignes, confirmePaiement, enregistrerLignes, fusionner } from "@/lib/smsPaiements";

// Paiement DIRECT dans l'application Android « direct » (lot 120). Plus de QR code ni de légende :
//  1. une fenêtre de SÉCURITÉ de l'application demande de RETAPER le montant et de saisir le code secret, puis envoie la séquence USSD ;
//  2. le paiement passe à « envoyé » : il ne peut PLUS être abandonné ;
//  3. l'application guette le SMS de retour de l'opérateur (si la lecture des SMS est disponible) : dès qu'il arrive avec le même montant, l'opération est CONFIRMÉE toute seule ;
//  4. problème de réseau et le marchand confirme la réception : « J'ai payé ».
const DELAI_MS = 5 * 60 * 1000;       // on guette le SMS pendant 5 minutes
const PAS_MS = 8000;
// Confirmation : le MONTANT et le MARCHAND doivent concorder avec le SMS (le montant seul ne suffit jamais). Orange n'affiche que le NOM du marchand, souvent en double : voir confirmePaiement (lib/smsPaiements.js).


export default function PaiementDirect({ paiement, onTermine }) {
  const toast = useToast();
  const [etat, setEtat] = useState("dialogue");        // dialogue | non_envoye | envoye | confirme
  const [message, setMessage] = useState("");
  const [journal, setJournal] = useState("");             // journal des envois USSD (ce qui a été composé et la réponse exacte), relu à chaque changement d'état
  useEffect(() => { if (etat === "non_envoye" || etat === "envoye") setJournal(journalUssd()); }, [etat]);
  const [reponse, setReponse] = useState("");           // texte rendu par l'opérateur à l'envoi
  const envoyeLe = useRef(0);
  const lance = useRef(false);
  const sms = !!capacites()?.sms;

  const changerStatut = useCallback(async (statut) => {
    try { await apiClient.put(`/paiements/${paiement.id}/statut`, { statut }); return true; }
    catch (err) { toast.erreur(messageErreur(err)); return false; }
  }, [paiement.id, toast]);

  /** Ouvre la fenêtre de sécurité de l'application puis envoie le code. */
  const payer = useCallback(async () => {
    setEtat("dialogue"); setMessage("");
    // Informations de la fenêtre de sécurité de l'application (blocs distincts) : le montant est écrit en CHIFFRES et en LETTRES — « 200 000 FCFA (deux cent mille francs) » —
    // pour qu'une faute de frappe (20 000 au lieu de 200 000) saute aux yeux
    const resume = JSON.stringify({
      service: paiement.service_nom, operateur: paiement.operateur,
      montant: paiement.montant ? fcfa(paiement.montant) : "", lettres: paiement.montant ? `${enLettres(paiement.montant)} francs` : "",
      marchand: paiement.marchand ? (paiement.marchand.libelle || "Marchand sans nom") : "", code: paiement.marchand?.code || "",
    });
    // Deux façons d'envoyer, selon le service :
    //  - la séquence contient {pin} (code secret au milieu du code) : envoi en UNE fois, le mot PIN est remplacé par l'application ;
    //  - sinon (cas d'Orange : l'opérateur demande le code secret dans une seconde fenêtre) : le code est composé SANS code secret et l'application tape le code secret dans la fenêtre
    const enUneFois = paiement.code_ussd.includes("PIN") || !capacites()?.dialogue;
    const r = enUneFois
      ? await payerDirectMontant({ operateur: paiement.operateur, code: paiement.code_ussd.includes("PIN") ? paiement.code_ussd : paiement.code_ussd.replace(/#\s*$/, "*PIN#"), resume, montant: paiement.montant })
      : await payerDirectDialogue({ operateur: paiement.operateur, code: paiement.code_ussd, resume, montant: paiement.montant });
    if (r.erreur) { setMessage(r.erreur); setEtat("non_envoye"); return; }
    envoyeLe.current = Date.now();
    setReponse(r.texte || "");
    await changerStatut("envoye");                      // dès maintenant : abandon impossible
    setEtat("envoye");
  }, [paiement, changerStatut]);

  // La fenêtre de sécurité s'ouvre dès l'arrivée sur cet écran (une seule fois)
  useEffect(() => { if (!lance.current) { lance.current = true; payer(); } }, [payer]);

  // Guet du SMS de retour : confirmation automatique
  useEffect(() => {
    if (etat !== "envoye" || !sms) return undefined;
    let arrete = false;
    const debut = Date.now();
    const verifier = async () => {
      if (arrete || Date.now() - debut > DELAI_MS) return;
      const r = await lireSmsPaiements(1);
      if (arrete || !r.sms) return;
      const critere = { montant: paiement.montant, codeMarchand: paiement.marchand?.code, libelle: paiement.marchand?.libelle, envoyeLe: envoyeLe.current };
      const trouve = r.sms.find((x) => confirmePaiement(x, critere));
      if (trouve && await changerStatut("effectue")) {
        // La ligne du SMS est aussi gardée sur le téléphone (historique des SMS de paiement)
        const ligne = analyserSms(trouve);
        if (ligne) enregistrerLignes(fusionner(chargerLignes(), [ligne]).lignes);
        setEtat("confirme"); toast.succes("Paiement confirmé par le SMS de l'opérateur");
      }
    };
    const t = setInterval(verifier, PAS_MS);
    verifier();
    return () => { arrete = true; clearInterval(t); };
  }, [etat, sms, paiement.montant, changerStatut, toast]);

  const jAiPaye = async () => { if (await changerStatut("effectue")) { setEtat("confirme"); toast.succes("Paiement noté comme effectué"); } };
  const abandonner = async () => { if (await changerStatut("abandonne")) onTermine(); };

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="paiement-direct">
      <p className="surtitre">Paiement direct</p>
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{paiement.service_nom}</span>
          <span>· {paiement.operateur}</span>
          {paiement.montant ? <span className="ml-auto text-lg font-bold text-accent">{fcfa(paiement.montant)}</span> : null}
        </div>
        {paiement.marchand && <p className="text-sm text-gray-600">Marchand : <b>{paiement.marchand.libelle || "sans nom"}</b> <span className="font-mono">({paiement.marchand.code})</span></p>}

        {/* RAPPEL du code USSD (important) : toujours visible, SANS la partie code secret (saisie à l'étape suivante) */}
        <div>
          <div className="rounded-lg bg-nuit-900 px-4 py-3 text-center font-mono text-xl tracking-wider text-white sm:text-2xl" data-testid="rappel-code">{paiement.code_ussd.replace(/\*?PIN/, "")}</div>
          <p className="mt-1 text-center text-xs text-gray-500">Étape suivante : une fenêtre vous demande de retaper le montant et votre code secret.</p>
        </div>

        {etat === "dialogue" && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">⏳ Fenêtre de sécurité ouverte : retapez le montant et saisissez votre code secret.</p>}

        {journal && (etat === "non_envoye" || etat === "envoye") && (
          <details className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700" data-testid="journal-ussd">
            <summary className="cursor-pointer font-semibold">🔎 Détails techniques : ce qui a été envoyé et la réponse exacte</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{journal}</pre>
            <p className="mt-1 text-gray-500">Le code secret n'apparaît jamais (remplacé par ****). Ce journal reste sur votre téléphone.</p>
          </details>
        )}

        {etat === "non_envoye" && (
          <div className="space-y-2">
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900"><b>Paiement non envoyé.</b> {message}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary flex-1" onClick={payer}>🔁 Réessayer</button>
              <button type="button" className="btn-outline flex-1" onClick={abandonner}>✖ Abandonner ce paiement</button>
            </div>
          </div>
        )}

        {etat === "envoye" && (
          <div className="space-y-2">
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <b>📨 Code envoyé à l'opérateur.</b> {sms ? "L'opération sera confirmée automatiquement à la réception de son SMS (même montant et même marchand)." : "Attendez le SMS de l'opérateur."}
              {" "}Ce paiement ne peut plus être abandonné.
            </p>
            {reponse && <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><b>Réponse de l'opérateur :</b> {reponse}</p>}
            {sms && !paiement.marchand?.libelle && (
              <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Ce marchand n'a pas encore de nom dans auRor : le SMS de l'opérateur ne pourra pas le reconnaître. Donnez-lui un nom pour la prochaine fois ; ici, utilisez « J'ai payé » après confirmation du marchand.</p>
            )}
            <p className="text-xs text-gray-600">Problème de réseau, mais le marchand confirme avoir reçu le paiement ? Appuyez sur « J'ai payé ».</p>
            <button type="button" className="btn-primary w-full" onClick={jAiPaye}>✅ J'ai payé</button>
          </div>
        )}

        {etat === "confirme" && (
          <div className="space-y-2">
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><b>✅ Paiement confirmé.</b> Il est dans votre historique.</p>
            <button type="button" className="btn-primary w-full" onClick={onTermine}>➕ Nouveau paiement</button>
          </div>
        )}
      </div>
    </div>
  );
}
