import { Link } from "react-router-dom";
import { LIBELLE_VERSION } from "@/version";

// ============================================================================
// Politique de confidentialité — page PUBLIQUE (lot 16 « Play Store »).
// Adresse : /confidentialite (aucune connexion requise). C'est cette adresse
// qui est déclarée dans la Play Console et ouverte depuis l'application
// Android (bouton « Politique de confidentialité »).
// Le texte est volontairement simple : une section = un titre + un paragraphe
// ou une liste (tableau SECTIONS ci-dessous, facile à modifier).
// ============================================================================

// Date de dernière mise à jour affichée en haut de la page
const MISE_A_JOUR = "11/10/2026";

// Mention de non-affiliation (identique à celle de l'application Android)
const MENTION_NON_AFFILIATION =
  "Paiement Mobile n'est affilié ni à Orange, ni à Moov Africa, ni à Telecel Faso ; les marques citées appartiennent à leurs propriétaires.";

// Contenu de la politique : chaque section a un titre et des paragraphes et/ou une liste à puces
const SECTIONS = [
  {
    titre: "1. Qui sommes-nous ?",
    paragraphes: [
      "Paiement Mobile (application Android « Raccourcis Paiement Mobile » et site paiement-mobile-site.onrender.com) est un service édité par SAWALI SMART SYSTEMS, Burkina Faso. Il aide à préparer les codes USSD des paiements Mobile Money (paiement marchand, transfert, achat de crédit…).",
    ],
  },
  {
    titre: "2. Ce que fait — et ne fait pas — Paiement Mobile",
    liste: [
      "L'application et le site préparent le code USSD et ouvrent le composeur de votre téléphone (ou affichent un QR code à scanner). C'est vous qui lancez l'appel.",
      "Paiement Mobile ne réalise AUCUNE transaction : le paiement est traité uniquement par le réseau de votre opérateur.",
      "Aucun code secret Mobile Money n'est jamais demandé, enregistré ni transmis. Vous le saisissez uniquement dans le menu de votre opérateur, qui s'affiche après l'appel.",
      "Paiement Mobile ne détient, ne reçoit et ne transfère aucun fonds.",
    ],
  },
  {
    titre: "3. Les données que nous traitons",
    liste: [
      "Profil : nom, prénom, numéro de téléphone et, si vous le donnez, adresse e-mail (facultative).",
      "Annuaire des marchands : codes marchands et intitulés (noms) que vous ou d'autres utilisateurs enregistrez pour les reconnaître.",
      "Historique des paiements préparés sur le site : service, opérateur, code USSD généré, montant et statut que vous indiquez (« payé », « abandonné »). L'application Android ne transmet pas d'historique des paiements.",
      "Compte du site : mot de passe, conservé uniquement sous forme chiffrée (empreinte), jamais en clair.",
      "Données techniques : adresse IP et type de navigateur lors des connexions au site ; pour l'application, version installée et modèle de l'appareil (sans nom ni numéro de téléphone).",
    ],
  },
  {
    titre: "4. Pourquoi nous les utilisons (finalités)",
    liste: [
      "Créer et sécuriser votre compte, vous identifier lors de la connexion.",
      "Préparer les codes USSD et afficher le nom du marchand correspondant à un code.",
      "Vous permettre de retrouver vos paiements préparés (historique du site).",
      "Superviser le bon fonctionnement du service et détecter les connexions suspectes.",
    ],
    paragraphes: [
      "Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.",
    ],
  },
  {
    titre: "5. Hébergement et sécurité",
    paragraphes: [
      "Le site et son serveur sont hébergés par Render (render.com) ; les données sont stockées dans une base MongoDB Atlas (MongoDB, Inc.). Ces prestataires peuvent héberger les données hors du Burkina Faso, avec des garanties de sécurité contractuelles.",
      "Toutes les communications entre l'application, le site et le serveur sont chiffrées (HTTPS). L'application Android garde aussi une copie locale de votre profil et des marchands sur votre téléphone pour fonctionner sans réseau.",
    ],
  },
  {
    titre: "6. Transmission à SAWALI Smart Systems (supervision)",
    liste: [
      "Présence du logiciel : l'application et le serveur signalent régulièrement leur version, le modèle de l'appareil ou du serveur et la date de démarrage, afin de vérifier qu'ils fonctionnent et sont à jour.",
      "Alertes de connexion : lors d'une connexion ou d'une inscription au site, l'administrateur reçoit une alerte comprenant l'adresse IP, le navigateur et l'identité du compte (nom, téléphone). Les visites anonymes sont signalées avec un identifiant aléatoire, sans donnée personnelle.",
    ],
    paragraphes: [
      "Aucune autre transmission à des tiers n'a lieu, sauf obligation légale.",
    ],
  },
  {
    titre: "7. Durée de conservation",
    liste: [
      "Profil et historique : conservés tant que votre compte existe ; supprimés dans un délai d'un mois après votre demande de suppression.",
      "Vous pouvez supprimer vous-même un paiement de votre historique à tout moment depuis le site.",
      "Données techniques de supervision et alertes de connexion : conservées le temps nécessaire à la supervision, 12 mois au maximum.",
      "Codes marchands et intitulés : conservés tant qu'ils sont utiles à l'annuaire partagé.",
    ],
  },
  {
    titre: "8. Vos droits",
    paragraphes: [
      "Conformément à la loi n°001-2021/AN du 30 mars 2021 portant protection des personnes à l'égard du traitement des données à caractère personnel au Burkina Faso, vous disposez d'un droit d'accès, de rectification, d'opposition et de suppression de vos données. Pour l'exercer, écrivez-nous (adresse ci-dessous) : nous répondons dans un délai d'un mois.",
      "Vous pouvez également saisir la Commission de l'Informatique et des Libertés (CIL) du Burkina Faso.",
      "La désinstallation de l'application efface les données conservées sur votre téléphone ; la suppression de votre compte côté serveur se fait sur simple demande.",
    ],
  },
  {
    titre: "9. Non-affiliation",
    paragraphes: [MENTION_NON_AFFILIATION],
  },
];

export default function Confidentialite() {
  return (
    <div className="min-h-screen bg-creme">
      {/* En-tête bleu nuit avec le logo, comme les autres pages du site */}
      <header className="bg-nuit-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <img src="/icone.svg" alt="" className="h-8 w-8" />
          <span className="logo-ecrit text-4xl">Paiement Mobile</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <p className="surtitre">Paiement Mobile</p>
          <h1 className="mt-1 text-2xl font-bold">Politique de confidentialité</h1>
          <p className="mt-1 text-sm text-gray-500">Dernière mise à jour : {MISE_A_JOUR}</p>
        </div>

        {/* Une carte par section */}
        {SECTIONS.map((section) => (
          <section key={section.titre} className="card space-y-2">
            <h2 className="text-lg font-semibold">{section.titre}</h2>
            {section.liste && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                {section.liste.map((ligne) => <li key={ligne}>{ligne}</li>)}
              </ul>
            )}
            {section.paragraphes?.map((texte) => (
              <p key={texte} className="text-sm text-gray-700">{texte}</p>
            ))}
          </section>
        ))}

        {/* Contact officiel (le même que sur la page de connexion) */}
        <section className="card space-y-2">
          <h2 className="text-lg font-semibold">10. Nous contacter</h2>
          <p className="text-sm text-gray-700">
            SAWALI SMART SYSTEMS — <a href="mailto:contact@sawalismartsystems.com" className="font-semibold text-primary">contact@sawalismartsystems.com</a>
            {" · "}<a href="tel:+22625658165" className="font-semibold text-primary">+226 25 65 81 65</a>
          </p>
        </section>

        <p className="text-center text-sm">
          <Link to="/connexion" className="font-semibold text-primary">← Retour à la connexion</Link>
        </p>
      </main>

      <footer className="py-4 text-center text-xs text-gray-400">{LIBELLE_VERSION}</footer>
    </div>
  );
}
