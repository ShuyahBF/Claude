import { Link } from "react-router-dom";

// Page publique « Suppression de compte » (lot 80) : adresse à déclarer dans la Play Console (formulaire « Sécurité des données »).
// Elle explique, sans connexion, comment supprimer son compte et ses données, et ce qui est effacé ou gardé.
const ETAPES = [
  "Ouvrez l'application auRor et connectez-vous.",
  "Ouvrez le menu ☰, puis Profil.",
  "Tout en bas, touchez « Supprimer mon compte… », tapez votre mot de passe puis « Supprimer définitivement ».",
];
const EFFACE = ["Votre compte (nom, prénom, téléphone, e-mail, mot de passe chiffré)", "Vos paiements préparés et votre historique", "Vos rappels de paiements et de médicaments, vos anniversaires",
  "Vos cartes virtuelles", "Vos archives en ligne chiffrées", "Vos appareils de notification et vos liens de QR codes", "Votre journal de connexions et votre compte marchand"];
const GARDE = ["Les achats d'abonnement, conservés chez SAWALI pour la comptabilité (ils ne sont plus rattachés à aucun compte)", "Les codes marchands de l'annuaire commun, sans lien avec votre identité"];

export default function SuppressionCompte() {
  return (
    <div className="min-h-screen bg-creme">
      <header className="bg-nuit-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <img src="/auror-mot-blanc.webp" alt="auRor" className="h-10 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <p className="surtitre">auRor</p>
          <h1 className="mt-1 text-2xl font-bold">Supprimer mon compte et mes données</h1>
          <p className="mt-1 text-sm text-gray-600">Service édité par SAWALI SMART SYSTEMS, Burkina Faso.</p>
        </div>
        <section className="card space-y-2">
          <h2 className="text-lg font-semibold">Depuis l'application</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{ETAPES.map((e) => <li key={e}>{e}</li>)}</ol>
          <p className="text-sm text-gray-600">La suppression est immédiate et définitive. Vous êtes déconnecté et votre numéro peut servir à créer un nouveau compte.</p>
        </section>
        <section className="card space-y-2">
          <h2 className="text-lg font-semibold">Ce qui est effacé</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{EFFACE.map((e) => <li key={e}>{e}</li>)}</ul>
          <h2 className="pt-2 text-lg font-semibold">Ce qui est conservé</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{GARDE.map((e) => <li key={e}>{e}</li>)}</ul>
        </section>
        <section className="card space-y-2">
          <h2 className="text-lg font-semibold">Vous n'arrivez plus à vous connecter ?</h2>
          <p className="text-sm">Écrivez à <a className="font-semibold text-primary underline" href="mailto:contact@sawalismartsystems.com">contact@sawalismartsystems.com</a> depuis l'adresse ou en indiquant le numéro de téléphone de votre compte : nous supprimons le compte et ses données dans un délai d'un mois.</p>
        </section>
        <p className="text-center text-sm"><Link to="/confidentialite" className="text-primary underline">Politique de confidentialité</Link></p>
      </main>
    </div>
  );
}
