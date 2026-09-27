# Albarka — Lot 8 : paie Burkina Faso paramétrable (cabinet et clients), retenue et arrondis des factures

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `albarka-portal-corrections_8_b1465a9.patch` sur la branche
`conflict_030926_0658`. Base attendue : ton commit `7b86f23` (« Auto-generated
changes », juste après `4313f2e`, le lot 7 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit : applique-le en UN SEUL `git am`, puis redéploie (backend et frontend,
bouton Deploy compris) et enregistre sur GitHub (« Save to GitHub »).

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/albarka_paie_moteur.py` : moteur de calcul de la paie (module pur,
  paramètres par défaut du Burkina Faso)
- `backend/albarka_paie.py` : modèles de configuration, employeurs, fiches
  paie, bulletins, livre de paie, PDF
- `backend/tests/test_paie_lot8.py` : tests autonomes avec MongoDB simulé
  (tu ne les lances pas)

**Backend modifié**
- `backend/server.py` : routes de la paie ; au démarrage, index et modèle
  « Burkina Faso — standard »
- `backend/albarka_docgen.py` :
  - le QR code d'un bulletin est vérifiable ;
  - réglages de la retenue à la source (libellé, taux avec IFU, taux sans IFU)
- `backend/albarka_phase_c.py` : TVA et retenue arrondies au franc (0,5 vers le haut)
- `backend/albarka_payroll.py` : le tableau de paie du lot 7 reprend le net
  et l'ancienneté des bulletins calculés

**Nouveaux fichiers frontend** (`frontend/src/components/paie/`)
- `paieCommon.jsx` : éléments communs
- `PaieParamsEditor.jsx` : éditeur des paramètres, avec aperçu du calcul
- `PaieSettings.jsx` : modèles et configuration par employeur
- `PaieEmployees.jsx` : salariés et fiche paie
- `PaieBulletins.jsx` : bulletins et livre de paie

**Frontend modifié**
- `frontend/src/pages/admin/AdminHR.jsx` : nouveaux onglets de Paie & RH
- `frontend/src/pages/admin/AdminBilling.jsx` : retenue selon le prestataire, libellé
- `frontend/src/pages/admin/DocSettingsPanel.jsx` : réglages de la retenue
- `frontend/src/version.js` : v2026.8

**Aucune dépendance nouvelle** : ReportLab, PyMuPDF et qrcode sont déjà
utilisés. **Aucune variable d'environnement nouvelle.** Aucune donnée existante
n'est modifiée.

Nouvelles collections Mongo :
- `paie_modeles` : modèles de configuration ;
- `paie_employeurs` : configuration de chaque employeur ;
- `paie_bulletins` : bulletins.

Les salariés restent dans `employees`. Le personnel du cabinet y a
`tenant_id = "cabinet"`.

## Ce que ça apporte

Le cabinet calcule la paie de **son propre personnel** et celle de **ses clients**.

1. **Calcul du bulletin**, repris du fichier Excel du cabinet (bulletin de
   CARD-IPRO SARL) :
   - salaire de base, prime d'ancienneté, indemnités, primes du mois : c'est
     le salaire brut ;
   - CNSS salariale : 5,5 % du brut plafonné à 600 000, soit 33 000 au plus ;
   - CNSS « fiscale » : la CNSS retenue, limitée à 8 % du salaire de base ;
   - exonérations : logement 20 % plafonné à 75 000, transport 5 % plafonné à
     30 000, fonction 5 % plafonné à 50 000 ; une indemnité peut être
     déclarée « non exonérée » pour un salarié ;
   - abattement forfaitaire : 25 % du salaire de base, ou un taux selon la
     catégorie du salarié ;
   - base IUTS, puis barème par tranches (0 % jusqu'à 30 000, puis 12,1 % /
     13,9 % / 15,7 % / 18,4 % / 21,7 % / 25 %) ;
   - abattement pour charges de famille ;
   - soutien patriotique : 1 % du net ;
   - retenues du mois (acomptes, prêts…), puis le **net à payer**.

   Arrondis par défaut : pas de décimales ; montants au franc ; base IUTS à
   la centaine inférieure ; salaire net à la centaine la plus proche.

   Le bulletin de Sandrine YAOLILE ressort à **300 000 net** et **297 000 net à
   payer**, comme dans le fichier.
2. **Tout est paramétrable**, dans Paie & RH → Paramètres de paie.
   - **Modèles de configuration**, indépendants du cabinet et des clients. On
     peut régler :
     - le barème IUTS (tranches et taux) ;
     - la CNSS salariale et patronale ;
     - les taxes patronales (TPA) ;
     - les exonérations et les rubriques d'indemnités ;
     - l'abattement forfaitaire (taux unique ou par catégorie) ;
     - les **charges de famille** (nombre de charges et taux, lignes
       ajoutées ou supprimées) ;
     - la prime d'ancienneté ;
     - le soutien patriotique ;
     - les arrondis (franc, 5, 10, 25, 50, centaine…).

     On modifie puis on clique sur **Appliquer**. **Restaurer les valeurs par
     défaut** revient aux valeurs du Burkina Faso. Un **aperçu du calcul**
     s'actualise pendant la saisie. Le modèle « Burkina Faso — standard » est
     créé au premier démarrage.
   - **Chaque employeur** (le cabinet et chaque client) choisit son modèle et
     peut le **personnaliser pour lui seul**. Le bouton **Restaurer les
     valeurs du modèle** revient ensuite au modèle.
   - L'en-tête du bulletin se règle aussi : raison sociale, adresse,
     téléphone, n° CNSS employeur.
3. **Fiche paie du salarié** (onglet Salariés) :
   - employeur (cabinet ou client), fonction, matricule, n° CNSS ;
   - catégorie, charges de famille ;
   - date d'embauche : la prime d'ancienneté démarre à 3 ans ;
   - indemnités.
   - Deux modes : **brut → net**, ou **net négocié → brut**. Dans le second,
     on saisit le net voulu et le salaire de base est calculé.
   - Le calcul s'affiche en direct.
4. **Bulletins de paie** (onglet Bulletins) :
   - « Préparer / recalculer le mois » crée un bulletin par salarié ;
   - pour chaque bulletin : primes, acomptes, prêts et autres retenues du
     mois, puis **Valider**. Un bulletin validé ne bouge plus ; **Rouvrir** le
     rend à nouveau modifiable ;
   - **PDF** au format du modèle du cabinet, avec QR code de vérification,
     et **Tout imprimer** dans un seul PDF.
5. **Livre de paie** (onglet Livre de paie) :
   - tous les salariés du mois : brut, CNSS, IUTS, soutien patriotique,
     retenues, net à payer, **charges patronales** et coût total ;
   - détail des charges patronales : CNSS employeur par branche, TPA ;
   - PDF et Excel.
6. **Factures** :
   - la TVA et la retenue sont arrondies **au franc le plus proche** (0,5 vers
     le haut) ;
   - retenue à la source : « Prestataire avec IFU (5 %) », « Prestataire sans
     IFU (10 %) » ou « Autre taux » ;
   - le **libellé** (« retenue » par défaut) se modifie sur chaque facture ;
   - les deux taux et le libellé par défaut se règlent dans Paramètres →
     Documents.

## À tester une fois déployé

1. La barre jaune affiche **v2026.8**.
2. **Paie & RH → Paramètres de paie** :
   - le modèle « Burkina Faso — standard » est là ;
   - l'aperçu (salaire 231 672, logement 50 000, transport 30 000, fonction
     30 000, 1 charge) affiche **Net 300 000** et **Net à payer 297 000**.
3. Dans ce modèle :
   - « Charges de famille » : modifie un taux, clique sur **Appliquer**, puis
     sur **Restaurer les valeurs par défaut** ;
   - « Abattement forfaitaire » : choisis « Selon la catégorie », puis Appliquer.
4. **Configuration par employeur** : choisis un client, puis :
   - saisis son n° CNSS et clique sur Appliquer ;
   - clique sur « Personnaliser pour cet employeur », change le taux du
     soutien patriotique, puis Appliquer ;
   - enfin « Restaurer les valeurs du modèle ».
5. **Salariés** : choisis ce client, puis « Nouveau salarié » avec les
   montants ci-dessus. Le calcul en direct affiche 297 000.
6. Ajoute un second salarié en mode **Net négocié → brut** (net 200 000) :
   le salaire de base est calculé pour obtenir 200 000 net.
7. Ajoute un salarié à l'employeur **« Cabinet ALBARKA (personnel du
   cabinet) »**, avec une date d'embauche de plus de 3 ans : la prime
   d'ancienneté apparaît.
8. **Bulletins** : choisis le client et le mois, puis « Préparer / recalculer
   le mois ».
   - Ouvre un bulletin, ajoute un acompte de 50 000 et enregistre : le net à
     payer baisse de 50 000.
   - **Valide**, ouvre le **PDF**, puis scanne le QR code : la page indique
     « Bulletin de paie ».
9. **Livre de paie** : les totaux et les charges patronales s'affichent. PDF
   et Excel se téléchargent.
10. **Tableau de paie** du même mois : la colonne « Salaire net » est remplie
    avec le net calculé.
11. **Caisse → Nouvelle facture** : coche « Retenue à la source ».
    - Choisis « Prestataire sans IFU » : le taux passe à 10 %.
    - Modifie le libellé : il apparaît dans les totaux et sur le PDF.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **AUCUN test, build, lint, Testing Agent ou
analyse automatique**. Applique le patch en UN SEUL `git am` et déploie,
c'est tout.
