# Albarka — Lot 7 : factures au format du cabinet, documents à partir de modèles, tableau de paie

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `albarka-portal-corrections_7_f8aa0cf.patch` sur la branche
`conflict_030926_0658`. Base attendue : **le lot 6 que tu as publié**
(`albarka-portal-corrections_6_6d9a105.patch`, version v2026.6). Le lot 6 est
en production mais n'a pas encore été enregistré sur GitHub : si ce n'est pas
fait, enregistre-le d'abord (« Save to GitHub »), puis applique ce lot 7.
Le patch ne touche pas au dossier `.emergent`. C'est un `git format-patch`
d'un seul commit : applique-le en UN SEUL `git am`, puis redéploie (backend et
frontend, bouton Deploy compris) et enregistre sur GitHub.

## Fichiers touchés

**Nouveaux fichiers backend**
- `backend/albarka_docgen.py` : papiers à en-tête, réglages des documents, somme en toutes lettres, QR code et page de vérification
- `backend/albarka_invoice_layout.py` : PDF des factures et proformas au format du cabinet
- `backend/albarka_letters.py` : modèles à variables, génération des documents, nettoyage du texte mis en forme
- `backend/albarka_payroll.py` : tableau de paie mensuel (fiche de renseignement)
- `backend/tests/test_documents_lot7.py` : tests autonomes avec MongoDB simulé (tu ne les lances pas)

**Backend modifié**
- `backend/albarka_phase_c.py` : lignes de titre et de détail, TVA unique, retenue, net à payer
- `backend/albarka_billing_docs.py` : PDF au format du cabinet pour les factures et proformas
- `backend/albarka_client_space.py` : l'espace client affiche le net à payer
- `backend/albarka_missions.py`, `backend/albarka_models.py` : description mise en forme des missions
- `backend/server.py` : nouvelles routes ; au démarrage, index et modèle « Avis de mission »

**Nouveaux fichiers frontend**
- `frontend/src/components/RichTextEditor.jsx` : éditeur « comme Word »
- `frontend/src/components/PayrollTable.jsx` : tableau de paie
- `frontend/src/pages/admin/AdminTemplates.jsx` : page « Documents & modèles »
- `frontend/src/pages/admin/DocSettingsPanel.jsx` : papiers à en-tête et signataire
- `frontend/src/pages/public/VerifyDocument.jsx` : page ouverte par le QR code
- `frontend/src/lib/docfiles.js` : ouverture des PDF, Word et Excel

**Frontend modifié**
- `frontend/src/App.js` : routes `/admin/modeles` et `/verifier/:token`
- `frontend/src/components/PortalLayout.jsx` : lien « Documents & modèles »
- `frontend/src/pages/admin/AdminBilling.jsx` : saisie des factures au format du cabinet
- `frontend/src/pages/admin/AdminHR.jsx` : onglet « Tableau de paie »
- `frontend/src/pages/admin/AdminSettings.jsx` : onglet « Documents »
- `frontend/src/pages/portal/Missions.jsx` : description mise en forme, bouton Modifier, bouton Document
- `frontend/src/index.css`, `frontend/src/version.js` (v2026.7)

**Aucune dépendance nouvelle** : l'éditeur est écrit sans bibliothèque ; les
PDF utilisent ReportLab et PyMuPDF, déjà utilisés par le portail ; le QR code
utilise `qrcode`, déjà présent. **Aucune variable d'environnement nouvelle.**
Aucune donnée existante n'est modifiée. Nouvelles collections Mongo :
`letterheads`, `doc_templates`, `generated_documents`, `payroll_lines`,
`payroll_tables`. Les anciennes factures gardent leurs montants ; leur PDF
passe au nouveau format quand il est régénéré.

## Ce que ça apporte

1. **Factures et proformas au format du cabinet** (Caisse → Nouvelle facture) :
   - lignes **Quantité / Description / Prix unitaire / Total** ;
   - **lignes de titre** sans montant (ex. « Assistance comptable et suivi
     fiscal ») et **détail sur plusieurs lignes** sous chaque description ;
     les lignes se déplacent avec ▲ ▼ ;
   - **TVA unique calculée en fin de facture**, 18 % par défaut ;
   - **retenue à la source facultative** (ex. 5 % du hors-taxe) et
     **NET À PAYER** ; les totaux se calculent pendant la saisie ;
   - encadré **« Facturer à »** : saisi, ou pris sur la fiche du client
     (raison sociale, adresse, IFU, RCCM) ;
   - PDF identique au modèle Word : bandeau « FACTURE N° » bleu-gris,
     « Facturer à », tableau, totaux, « Nous vous remercions de votre
     confiance. », « Arrêtée la présente facture à la somme de … FRANCS CFA »
     en toutes lettres, signataire ;
   - **QR code** : scanné, il ouvre une page publique qui confirme que le
     document est authentique (numéro, date, client, montant, situation) ;
   - un encaissement du net à payer solde la facture. Les reçus ne changent pas.
2. **Papiers à en-tête** (Paramètres → Documents, et Documents & modèles →
   Papiers à en-tête) :
   - plusieurs papiers possibles (ex. ALBARKA, GESPHARM) ;
   - chacun a une image d'en-tête et une image de pied de page ; sans image,
     c'est du papier préimprimé (marge haute vide, 4,8 cm comme la facture) ;
   - un papier est **par défaut** ; chaque facture ou document peut en choisir
     un autre ou « Aucun en-tête » ;
   - on y règle aussi la ville, le titre et le nom du **signataire**, l'IFU et
     le RCCM du cabinet, la phrase de remerciement, et les TVA et retenue par
     défaut.
3. **Éditeur de texte « comme Word »**. Sa barre de mise en forme contient :
   - annuler / rétablir ;
   - style (paragraphe, titres), police, taille ;
   - gras, italique, souligné, barré, couleur, surlignage ;
   - alignements, justification, puces, numéros, retraits ;
   - **tableaux** (lignes et colonnes ajoutées ou supprimées) ;
   - **images** (largeur réglable), ligne horizontale, effacer la mise en forme.
4. **Missions** :
   - la description se saisit dans cet éditeur ;
   - un bouton **Modifier** permet de la reprendre ;
   - un clic sur la description la déplie dans la liste ;
   - le bouton **Document** ouvre la génération d'un ordre ou d'un avis de
     mission pour ce client, et les variables « Mission » sont remplies
     automatiquement.
5. **Documents & modèles** (nouveau lien du menu) :
   - un document peut être enregistré comme **modèle réutilisable** ;
   - le bouton **Variable** de l'éditeur place des éléments variables :
     automatiques (lieu et date, numéro du document, raison sociale, contact,
     adresse, IFU du client, signataire, mission) ou propres au modèle,
     **communes** (même valeur pour tous) ou **par destinataire** ;
   - le modèle **« Avis de mission »** est fourni d'office, repris de ton
     document. Ses éléments variables sont :
     - lieu et date ;
     - fonction du destinataire (« Pharmacien Gérant ») ;
     - établissement (« PHARMACIE Elite ») ;
     - ville ;
     - numéro (« 126/GESP/DG/2026 ») ;
     - formule d'appel (« Docteur ») ;
     - objet et période de la mission ;
     - signataire ;
   - **Générer** :
     - on coche les destinataires (clients) et on remplit les valeurs
       communes et le tableau des valeurs par destinataire ;
     - on choisit la date et le papier, et au besoin le dépôt dans l'espace
       client (avec ou sans message au client) ;
     - on peut voir un aperçu ;
     - **autant de documents** sont produits, chacun avec son PDF et son QR
       code, et numérotés automatiquement : format réglable (`{n}/GESP/DG/{annee}`),
       prochain numéro modifiable ;
     - on peut tout imprimer en un seul PDF, ou télécharger chaque document en
       Word ;
   - un modèle se **modifie, se duplique, se supprime et se verrouille**. Un
     modèle verrouillé ne peut plus être ni modifié ni supprimé. Seuls
     peuvent le déverrouiller : la personne qui l'a verrouillé, son auteur,
     la Direction/DG, un Administrateur ou le Superviseur.
6. **Tableau de paie** (Paie & RH → Tableau de paie) :
   - la « Fiche de renseignement — liste actualisée du personnel permanent »
     d'un client, pour un mois ;
   - colonnes : N°, nom et prénoms, salaire de base, ancienneté, indemnités de
     fonction, de logement, de transport et de responsabilité, salaire brut
     (calculé tout seul), salaire net ; ligne TOTAL ;
   - un nouveau mois repart du mois précédent, sinon de la liste des employés
     du client ;
   - **PDF** : tableau en paysage au papier à en-tête, avec QR code, suivi du
     questionnaire RH (« Rubrique paie », « Rubrique observation
     préoccupation », « La responsable ») en portrait, qu'on peut décocher ;
   - **Excel** : fichier CSV.

## À tester une fois déployé

1. La barre jaune du menu affiche **v2026.7**.
2. **Paramètres → Documents** :
   - ajoute un papier « GESPHARM » avec l'image d'en-tête et l'image de pied
     de page ; les aperçus s'affichent et il devient « par défaut » ;
   - saisis le nom du signataire et enregistre.
3. **Caisse → Nouvelle facture** :
   - ajoute une **ligne de titre**, puis une ligne « AOUT - 2024 » à
     52 632 avec un détail sur deux lignes ;
   - coche **Retenue 5 %** ; les totaux affichent 52 632 / 9 474 / 62 106 /
     2 632 / **59 474** ;
   - crée, puis ouvre le PDF : format du modèle, papier GESPHARM, somme en
     lettres, signataire, QR code.
4. Scanne le QR code avec un téléphone : la page « Document authentique »
   affiche le numéro, le client et 59 474 FCFA.
5. **Documents & modèles** :
   - le modèle « Avis de mission » est là ; ouvre-le avec **Éditer**, essaie
     la barre de mise en forme (tableau, image, retrait) et le menu
     **Variable** ;
   - mets **126** comme prochain numéro et enregistre.
6. **Générer** :
   - coche deux clients et modifie une formule d'appel dans le tableau ;
   - coche **Déposer dans l'espace du client** et génère : 2 documents
     numérotés 126 et 127/GESP/DG/2026 ;
   - « Tout imprimer » ouvre un seul PDF ; « Word » télécharge un .doc
     modifiable ;
   - les clients voient le document dans « Factures & documents » (catégorie
     Courrier).
7. **Verrouille** le modèle : Éditer passe en lecture seule et Supprimer est
   grisé. Déverrouille avec la Direction.
8. **Missions** :
   - « Nouvelle mission » : la description se met en forme (gras, liste,
     tableau) ;
   - dans la liste, clique sur la description pour la déplier ;
   - **Document** ouvre la génération pour ce client.
9. **Paie & RH → Tableau de paie** :
   - choisis un client et un mois, puis saisis les indemnités et le net ;
     le brut se calcule seul ;
   - **Enregistre**, puis **PDF** (tableau et questionnaire) et **Excel** ;
   - le mois suivant repart du mois saisi.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **AUCUN test, build, lint, Testing Agent ou
analyse automatique**. Applique le patch en UN SEUL `git am` et déploie,
c'est tout.
