import { useCallback, useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import Modal from "@/components/Modal";
import OngletsAdmin from "@/components/OngletsAdmin";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { apiClient, dateHeure, messageErreur } from "@/lib/api";

// Liste des comptes (administrateur, lot 45) : dernière connexion / déconnexion, adresse IP, abonnements actifs
// avec leur date d'expiration, et blocage d'un compte.
export default function AdminComptes() {
  const toast = useToast();
  const { user: moi } = useAuth();
  const [donnees, setDonnees] = useState(null);      // {total, page, par_page, comptes} ; null = chargement
  const [page, setPage] = useState(1);
  const [terme, setTerme] = useState("");
  const [recherche, setRecherche] = useState("");
  const [abonnes, setAbonnes] = useState(null);      // {id: [abonnements actifs]} ; null = en cours de lecture chez SAWALI
  const [selection, setSelection] = useState(null);  // compte sélectionné (fond orange)
  const [aBloquer, setABloquer] = useState(null);    // compte dont le blocage/déblocage est à confirmer
  const [historique, setHistorique] = useState(null); // {compte, connexions}
  const [aDeconnecter, setADeconnecter] = useState(null); // compte à déconnecter, ou "tous"
  const [inactivite, setInactivite] = useState({ secondes: 180, choix: [60, 120, 180, 300, 600, 900, 1800] });

  // 1. Les comptes s'affichent d'abord ; 2. les abonnements arrivent ensuite (lecture chez SAWALI, section séparée)
  const charger = useCallback(() => {
    setAbonnes(null);
    apiClient.get("/admin/comptes", { params: { q: recherche, page } }).then(({ data }) => {
      setDonnees(data);
      setInactivite({ secondes: data.inactivite_secondes, choix: data.choix_inactivite });
      if (data.comptes.length === 0) { setAbonnes({}); return; }
      apiClient.post("/admin/comptes/abonnements", { ids: data.comptes.map((c) => c.id) })
        .then((r) => setAbonnes(r.data.abonnes)).catch(() => setAbonnes(undefined));   // undefined = indisponible
    }).catch((err) => { toast.erreur(messageErreur(err, "Liste des comptes indisponible")); setDonnees({ total: 0, page: 1, par_page: 50, comptes: [] }); });
  }, [recherche, page, toast]);
  useEffect(() => { charger(); }, [charger]);

  const confirmerBlocage = async () => {
    const c = aBloquer;
    try {
      await apiClient.put(`/admin/comptes/${c.id}/blocage`, { bloque: !c.bloque });
      toast.succes(c.bloque ? "Compte débloqué" : "Compte bloqué : il est déconnecté");
      setABloquer(null);
      charger();
    } catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };

  // Déconnexion forcée : l'utilisateur voit un compte à rebours de 30 s puis revient à la page de connexion
  const confirmerDeconnexion = async () => {
    const cible = aDeconnecter;
    try {
      if (cible === "tous") {
        const { data } = await apiClient.post("/admin/comptes/deconnexion-generale");
        toast.succes(`Déconnexion annoncée à ${data.annonces} compte(s) : fermeture dans ${data.delai_s} s`);
      } else {
        const { data } = await apiClient.put(`/admin/comptes/${cible.id}/deconnexion`);
        toast.succes(`Déconnexion annoncée : fermeture dans ${data.delai_s} s`);
      }
      setADeconnecter(null);
      charger();
    } catch (err) { toast.erreur(messageErreur(err, "Action impossible")); }
  };

  // Durée d'inactivité avant fermeture de la session (liste déroulante)
  const changerInactivite = async (secondes) => {
    try {
      const { data } = await apiClient.put("/admin/comptes/reglage-inactivite", { secondes: Number(secondes) });
      setInactivite((i) => ({ ...i, secondes: data.inactivite_secondes }));
      toast.succes("Durée d'inactivité enregistrée");
    } catch (err) { toast.erreur(messageErreur(err, "Réglage impossible")); }
  };
  const libelleDuree = (s) => (s < 120 ? `${s} secondes` : `${s / 60} minutes`);

  const voirHistorique = async (c) => {
    try { const { data } = await apiClient.get(`/admin/comptes/${c.id}/connexions`); setHistorique({ compte: c, connexions: data.connexions }); }
    catch (err) { toast.erreur(messageErreur(err, "Historique indisponible")); }
  };

  // Colonne « Abonnement » : formule(s) active(s) et date d'expiration
  const celluleAbonnement = (c) => {
    if (abonnes === null) return <span className="text-xs text-gray-400">Lecture…</span>;
    if (abonnes === undefined) return <span className="text-xs text-gray-400">Indisponible</span>;
    const liste = abonnes[c.id];
    if (!liste?.length) return <span className="text-xs text-gray-400">Aucun</span>;
    return liste.map((a, i) => (
      <div key={i}><span className="badge bg-green-100 text-green-800">{a.formule}</span>
        <div className="text-xs text-gray-500">expire le {new Date(a.expire_le).toLocaleDateString("fr-FR")} ({a.jours_restants} j)</div></div>
    ));
  };

  if (donnees === null) return <Chargement />;
  const pages = Math.max(1, Math.ceil(donnees.total / donnees.par_page));
  return (
    <div className="space-y-4">
      <OngletsAdmin />
      <h1 className="text-2xl font-bold">Comptes <span className="text-base font-normal text-gray-500">({donnees.total})</span></h1>
      {/* Sécurité des sessions : fermeture après inactivité et déconnexion de tous les utilisateurs */}
      <section className="card flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="label" htmlFor="inactivite">Fermer la session après inactivité de</label>
          <select id="inactivite" className="input" value={inactivite.secondes} onChange={(e) => changerInactivite(e.target.value)}>
            {inactivite.choix.map((s) => <option key={s} value={s}>{libelleDuree(s)}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-500">Un compte à rebours de 30 s propose « Rester connecté » avant la fermeture.</p>
        </div>
        <button type="button" className="btn-outline" onClick={() => setADeconnecter("tous")}>Déconnecter tous les utilisateurs</button>
      </section>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setRecherche(terme.trim()); }}>
        <input className="input min-w-0 flex-1" placeholder="Nom, téléphone, e-mail, adresse IP…" value={terme} maxLength={60} onChange={(e) => setTerme(e.target.value)} />
        <button type="submit" className="btn-primary">Chercher</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="table">
          <thead><tr><th>Compte</th><th>Dernière connexion</th><th>Dernière déconnexion</th><th>Adresse IP</th><th>Abonnement actif</th><th>État</th><th /></tr></thead>
          <tbody>
            {donnees.comptes.map((c) => (
              <tr key={c.id} onClick={() => setSelection(c.id)} aria-selected={selection === c.id}
                className={selection === c.id ? "ligne-selectionnee cursor-pointer" : "cursor-pointer"}>
                <td>{c.prenom} {c.nom}{c.role === "admin" && <span className="badge ml-1 bg-gray-100 text-gray-600">admin</span>}
                  <div className="text-xs text-gray-500">{c.telephone}{c.email ? ` · ${c.email}` : ""}</div></td>
                <td>{c.derniere_connexion ? dateHeure(c.derniere_connexion) : <span className="text-xs text-gray-400">Jamais</span>}
                  {c.session_ouverte && <div className="text-xs text-green-700">session ouverte</div>}</td>
                <td>{c.derniere_deconnexion ? dateHeure(c.derniere_deconnexion) : <span className="text-xs text-gray-400">—</span>}</td>
                <td className="font-mono text-xs">{c.derniere_ip || "—"}</td>
                <td>{celluleAbonnement(c)}</td>
                <td>{c.bloque ? <span className="badge bg-red-100 text-red-800">Bloqué</span> : <span className="badge bg-green-100 text-green-800">Actif</span>}</td>
                <td className="whitespace-nowrap">
                  <button type="button" className="btn-outline btn-sm mr-1" onClick={(e) => { e.stopPropagation(); voirHistorique(c); }}>Sessions</button>
                  {c.id !== moi.id && !c.bloque && (
                    <button type="button" className="btn-outline btn-sm mr-1" onClick={(e) => { e.stopPropagation(); setADeconnecter(c); }}>Déconnecter</button>
                  )}
                  {c.role !== "admin" && (
                    <button type="button" className="btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); setABloquer(c); }}>{c.bloque ? "Débloquer" : "Bloquer"}</button>
                  )}
                </td>
              </tr>
            ))}
            {donnees.comptes.length === 0 && <tr><td colSpan={7} className="text-center text-gray-500">Aucun compte.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédent</button>
          <span>Page {page} sur {pages}</span>
          <button type="button" className="btn-outline btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant →</button>
        </div>
      )}

      {/* Confirmation du blocage / déblocage */}
      <Modal ouvert={!!aBloquer} titre={aBloquer?.bloque ? "Débloquer ce compte ?" : "Bloquer ce compte ?"} onFermer={() => setABloquer(null)}>
        {aBloquer && (
          <div className="space-y-3">
            <p className="text-sm">{aBloquer.prenom} {aBloquer.nom} ({aBloquer.telephone})</p>
            <p className="text-sm text-gray-600">{aBloquer.bloque ? "Le compte pourra de nouveau se connecter."
              : "Le compte est déconnecté aussitôt et ne pourra plus se connecter tant qu'il n'est pas débloqué."}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={confirmerBlocage}>{aBloquer.bloque ? "Débloquer" : "Bloquer"}</button>
              <button type="button" className="btn-outline flex-1" onClick={() => setABloquer(null)}>Annuler</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation de la déconnexion forcée */}
      <Modal ouvert={!!aDeconnecter} titre={aDeconnecter === "tous" ? "Déconnecter tous les utilisateurs ?" : "Déconnecter ce compte ?"} onFermer={() => setADeconnecter(null)}>
        {aDeconnecter && (
          <div className="space-y-3">
            {aDeconnecter !== "tous" && <p className="text-sm">{aDeconnecter.prenom} {aDeconnecter.nom} ({aDeconnecter.telephone})</p>}
            <p className="text-sm text-gray-600">Un message d'attente avec un compte à rebours de 30 secondes s'affiche sur son écran, puis sa session est fermée
              et il doit se reconnecter. Votre propre session n'est jamais fermée ainsi{aDeconnecter === "tous" ? ", et les autres administrateurs non plus" : ""}.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={confirmerDeconnexion}>Déconnecter</button>
              <button type="button" className="btn-outline flex-1" onClick={() => setADeconnecter(null)}>Annuler</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Dernières sessions du compte */}
      <Modal ouvert={!!historique} titre="Dernières sessions" onFermer={() => setHistorique(null)}>
        {historique && (
          <div className="space-y-2">
            <p className="text-sm">{historique.compte.prenom} {historique.compte.nom}</p>
            {historique.connexions.length === 0 ? <p className="text-sm text-gray-500">Aucune session enregistrée.</p> : (
              <ul className="divide-y divide-gray-100 text-sm">
                {historique.connexions.map((x, i) => (
                  <li key={i} className="py-2">
                    <div>Ouverture : {dateHeure(x.ouverte_le)} <span className="font-mono text-xs text-gray-500">{x.ip}</span></div>
                    <div className="text-gray-600">{x.fermee_le ? `Déconnexion : ${dateHeure(x.fermee_le)}` : "Déconnexion non enregistrée"}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
