# Albarka — Lot 6 : statistiques graphiques des formulaires (animées, colorées)

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `albarka-portal-corrections_6_6d9a105.patch` sur la branche
`conflict_030926_0658`. Base attendue : ton commit `37de42f` (« Auto-generated
changes », juste après `d30e280`, le lot 5 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit : applique-le en UN SEUL `git am`, puis redéploie (backend et frontend,
bouton Deploy compris) et enregistre sur GitHub (« Save to GitHub »).

## Fichiers touchés

**Nouveau fichier frontend**
- `frontend/src/components/forms-core/charts.jsx` : briques visuelles des
  graphiques (palette, chiffres animés, cartes d'indicateurs, barres animées,
  infobulles)

**Frontend modifié**
- `frontend/src/components/forms-core/FormStats.jsx` : onglet Statistiques
  d'un formulaire refait en graphiques
- `frontend/src/components/forms-core/FormsLibrary.jsx` : vue d'ensemble de la
  bibliothèque en graphiques
- `frontend/src/version.js` : version `v2026.6` (barre jaune du menu)

**Backend modifié**
- `backend/forms_core/stats.py` : données supplémentaires pour les graphiques
- `backend/forms_core/api.py` : série des 30 derniers jours dans la vue
  d'ensemble

Les dossiers `forms_core/` et `components/forms-core/` sont la copie du
module commun forms-core, en version 1.2.0. Le serveur renvoie seulement des
champs en plus : aucune route nouvelle, aucune clé retirée, aucune donnée
modifiée, aucune migration, aucune dépendance nouvelle (Recharts est déjà
installé), aucune variable d'environnement.

## Ce que ça apporte

1. **Onglet « Statistiques » d'un formulaire** (Formulaires → Stats) :
   - barre de période : dates « Du / Au », raccourcis **7 j, 30 j, 90 j,
     1 an, Tout**, et bouton **Export Excel (CSV)** de la période ;
   - **6 indicateurs colorés** dont les chiffres défilent à l'ouverture :
     Réponses, Ouvertures, Conversion, Complétion moyenne, Invitations,
     Taux de réponse ;
   - **Réponses dans le temps** : barres en dégradé par jour (les jours sans
     réponse apparaissent à 0) ou courbe **cumulée** (bouton Par jour / Cumul) ;
   - anneaux **Provenance** (lien public / invitation) et **Identifiés vs
     anonymes**, avec le total au centre ;
   - **Entonnoir des invitations** : envoyées → ouvertes → répondues → en
     attente, en barres qui se remplissent ;
   - **Jours de la semaine** (une couleur par jour) et **Heures de la
     journée** (carte de chaleur : plus la case est foncée, plus il y a de
     réponses), avec le jour et l'heure les plus actifs ;
   - **Meilleurs répondants** (médailles or, argent, bronze) et **10 dernières
     réponses** (initiale colorée, provenance, date) ;
   - **une carte par question** : barres de couleurs différentes ou
     **camembert** au choix pour les listes et cases à cocher, anneau vert/rouge
     pour Oui/Non, **note moyenne en étoiles** et répartition pour les notes,
     moyenne / min / médiane / max au format français pour les nombres,
     dernières réponses en bulles pour les textes.
2. **Bibliothèque de formulaires** : les 4 chiffres deviennent des cartes
   colorées animées, avec en plus la **courbe des réponses des 30 derniers
   jours** (tous formulaires) et le graphique **Les plus remplis** : un clic
   sur une barre ouvre les statistiques du formulaire.
3. Tout reste lisible sur téléphone (les cartes passent l'une sous l'autre).

## À tester une fois déployé

1. La barre jaune du menu affiche **v2026.6**.
2. **Formulaires** : 4 cartes colorées dont les chiffres défilent, la courbe
   des 30 derniers jours et « Les plus remplis ». Clique sur une barre de
   « Les plus remplis » : les statistiques de ce formulaire s'ouvrent.
3. Ouvre un formulaire qui a des réponses → **Statistiques** : les 6
   indicateurs, le graphique des réponses dans le temps, les anneaux,
   l'entonnoir, les jours, les heures, les répondants et les dernières réponses
   s'affichent.
4. Clique sur **Cumul** : la courbe cumulée remplace les barres.
5. Clique sur **7 j** puis **Tout** : les chiffres changent selon la période.
6. Sur une question à choix, clique sur **Camembert** : l'anneau et sa légende
   (nombre et pourcentage) s'affichent.
7. Clique sur **Export Excel (CSV)** : le fichier des réponses se télécharge.
8. Sur téléphone, ouvre les mêmes statistiques : pas de défilement horizontal.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **AUCUN test, build, lint, Testing Agent ou
analyse automatique**. Applique le patch en UN SEUL `git am` et déploie,
c'est tout.
