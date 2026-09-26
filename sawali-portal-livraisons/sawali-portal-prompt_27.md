# Sawali — Lot 27 : tâches planifiées réactivées (avec garde-fous), modèles WhatsApp à formulaire (Flow), emojis, annotation d'images, sondages WhatsApp

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `sawali-portal-corrections_27_c83fc89.patch` sur la branche
`conflict_230926_1008`. Base attendue : ton commit `d091c30` (« Auto-generated
changes », juste après `55e46f2`, le lot 26 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit : applique-le en UN SEUL `git am`, puis redéploie (backend et frontend,
bouton Deploy compris) et enregistre sur GitHub (« Save to GitHub »).

## Le problème corrigé

Dans `backend/server.py`, tout le bloc qui démarre le planificateur
(APScheduler, 26 tâches) se trouvait **après le `return`** de
`admin_run_contract_overdue_now`. Il ne s'exécutait donc jamais, et aucune
tâche planifiée ne tournait :
- envois WhatsApp et SMS programmés ;
- rappels de rendez-vous, de tâches et de planning ;
- résumés, relances, sauvegardes, contrôles.

Le bloc a maintenant son propre crochet de démarrage `_start_scheduler`.

## Garde-fous (les tâches étaient arrêtées depuis longtemps)

1. **Envois WhatsApp et SMS programmés** : un envoi encore « en attente »
   mais en retard de plus de **3 heures** n'est plus envoyé.
   - Il passe en « Annulé », avec le motif « Non envoyé : en retard de plus
     de 3 h (planificateur inactif). Reprogrammez-le si besoin. »
   - Sans cela, tous les envois en attente depuis des mois partiraient d'un
     coup vers les clients.
2. **Relances automatiques de la Caisse** : pas de nouvelle relance
   automatique avant 6 jours, et pas de relance automatique d'une facture
   échue depuis plus de 90 jours. Une relance lancée à la main n'est pas
   concernée.
3. **Suspension automatique des comptes en retard de paiement** :
   - elle ne se fait que si le nouvel interrupteur est activé (Paramètres →
     Contrats → « Suspendre automatiquement les comptes en retard »,
     **désactivé par défaut**) ;
   - le super-admin n'est jamais suspendu ;
   - les alertes envoyées à l'administrateur continuent.
4. **Jamais dans l'environnement preview** : sa base reçoit des copies de la
   production, il enverrait de vrais messages en double. La détection se fait
   par « .preview. » dans `PUBLIC_BASE_URL`, `preview_endpoint` ou
   `REACT_APP_BACKEND_URL`, comme pour le résumé hebdomadaire.
   - `DISABLE_SCHEDULER=1` coupe le planificateur partout.
   - `SCHEDULER_IN_PREVIEW=1` le force dans la preview.
5. **Robustesse** :
   - chaque tâche est ajoutée séparément : une erreur n'empêche plus les
     autres de tourner ;
   - la sauvegarde hebdomadaire (JSON, compression, écriture) et le PDF du
     rapport s'exécutent dans un thread ;
   - le contrôle de l'IA (appel payant) passe de toutes les 15 minutes à une
     fois par heure.
6. **Page d'état** (admin) : `GET /api/admin/scheduler/status` indique si le
   planificateur tourne, pourquoi sinon, et le prochain passage de chaque
   tâche.

## Modèles WhatsApp avec bouton « Flux » (formulaire WhatsApp)

Exemple : le modèle `suivilogiciels_fr` (français), dont le bouton « Commencer
le Suivi » ouvre un formulaire WhatsApp (bouton de type « Flux terminé »).

1. **À l'envoi**, Meta exige, pour un bouton « Flux », un composant bouton
   portant un jeton (`flow_token`). Le portail ne l'envoyait pas, et Meta
   refusait le message.
   - `_wa_send_template` lit maintenant la définition du modèle chez Meta
     (mémorisée 1 heure), puis ajoute ce composant pour chaque bouton « Flux ».
   - Cela vaut pour tous les envois de modèles : conversation, envois groupés,
     automations, envois programmés.
   - Si Meta ne répond pas, le message part comme avant.
   - Le jeton est enregistré (collection `whatsapp_flow_sends`) pour relier la
     réponse au modèle envoyé.
2. **À la réception**, la réponse du formulaire (message « nfm_reply ») était
   perdue. Maintenant :
   - elle s'affiche dans la conversation (« 📋 Formulaire WhatsApp complété »,
     puis une ligne par réponse) ;
   - elle est enregistrée (collection `whatsapp_flow_responses`) ;
   - elle déclenche le nouvel événement d'automation **« Formulaire WhatsApp
     (Flow) complété »**, avec les variables `{wa_from}`, `{wa_sender_name}`,
     `{wa_flow_template}` et `{wa_flow_summary}`.

## Emojis dans le Centre de Messagerie

- Un bouton 😊 est ajouté à côté de la zone de saisie :
  - dans la conversation WhatsApp d'un contact ;
  - dans la fenêtre d'envoi de SMS ;
  - dans la boîte de réception unifiée.
- Le panneau propose des catégories, une recherche en français et les
  emojis utilisés récemment.
- L'emoji est inséré à la position du curseur.
- SMS : un compteur indique le nombre de SMS. Un emoji fait passer le
  message en Unicode (70 caractères par SMS au lieu de 160).

## Annoter une image avant de l'envoyer (conversation WhatsApp)

- Quand une image est jointe à la conversation d'un contact (trombone, Ctrl+V
  ou bouton « Coller »), un bouton **« Annoter »** apparaît à côté de
  l'aperçu. Un clic sur la vignette ouvre aussi l'éditeur.
- Outils :
  - **Flèche**, **Cercle** (pour entourer une zone), **Rectangle** ;
  - **Crayon** (main levée) et **Surligneur** ;
  - **Texte** : on clique à l'endroit voulu, on tape, puis Entrée ;
  - **Numéro** : pastilles 1, 2, 3… pour indiquer des étapes ;
  - **Flouter** : on encadre une zone pour la pixeliser (numéro de compte,
    visage, mot de passe). Le flou reste sous les autres annotations.
- 6 couleurs et 3 épaisseurs. Annuler / Rétablir (Ctrl+Z / Ctrl+Y), Tout effacer.
- Marche à la souris, au doigt et au stylet (téléphone, tablette).
- **Terminer** : l'image annotée remplace la pièce jointe (même légende, même
  bouton Envoyer). Elle reste en JPEG, ou en PNG pour une capture PNG.
- Aucune dépendance nouvelle : le dessin se fait dans le navigateur.

## Sondages WhatsApp (nouvelle page, à côté des Formulaires)

Menu « Sondages WhatsApp ». Des onglets « Formulaires | Sondages WhatsApp »
en tête des deux pages permettent de passer de l'une à l'autre.

1. **Concevoir** (Nouveau sondage) :
   - titre, introduction, message de remerciement, date limite facultative ;
   - questions : choix unique, choix multiples, oui/non, note de 1 à 5,
     recommandation de 0 à 10 (score NPS), réponse libre ;
   - chaque question peut être obligatoire, déplacée, dupliquée, supprimée ;
   - « Résultats anonymes » pour ne pas afficher les noms des répondants ;
   - l'aperçu « téléphone » montre ce que verra le destinataire ;
   - Enregistrer, Enregistrer et ouvrir, Clôturer, Dupliquer.
2. **Envoyer** à plusieurs destinataires :
   - tous les contacts d'un ou plusieurs clients (ex. PHL), des groupes, une
     entreprise ou des contacts choisis un à un ;
   - « exclure les contacts déjà invités » et **échantillon aléatoire**
     (ex. 100 contacts tirés au hasard parmi 800) ;
   - la liste se vérifie et se décoche avant l'envoi ; un numéro n'est
     jamais invité deux fois ;
   - chaque destinataire reçoit un **lien personnel**
     (`https://sawalismartsystems.com/s/<jeton>`) : on sait qui a ouvert et
     qui a répondu, sans compte ni mot de passe ;
   - mode **Auto** : message libre pour les contacts qui ont écrit dans les
     24 h, **modèle Meta** approuvé pour les autres (règle de WhatsApp). Le
     lien va dans une variable du modèle (`{{lien}}`), ou dans la partie
     variable d'un bouton lien (`{{jeton}}`). Sans lien, l'envoi est refusé
     avec un message clair ;
   - l'envoi tourne en arrière-plan (une pause entre deux messages) ; la
     page des résultats montre la progression. Après un redémarrage du
     serveur, un envoi interrompu reprend (jamais dans la preview) ;
   - chaque message apparaît aussi dans la conversation du contact.
3. **Page de réponse** (`/s/<jeton>`), pensée pour le téléphone :
   - « Bonjour Awa », gros boutons, étoiles, échelle de 0 à 10 ;
   - les questions obligatoires sont contrôlées ;
   - la réponse peut être corrigée tant que le sondage est ouvert ;
   - sondage clôturé ou date passée : un message l'indique.
4. **Résultats** :
   - envoyés, ouverts, réponses, taux d'ouverture et de réponse, entonnoir ;
   - graphiques par question (barres, note moyenne, score NPS avec
     promoteurs / passifs / détracteurs, réponses libres) ;
   - taux de réponse par entreprise, réponses par jour ;
   - filtre par envoi et par **période** (du … au …) : c'est la base des
     bilans de période par client ;
   - liste des destinataires et de leur état ;
   - **Relancer** les non-répondants (même lien), export **Excel** (CSV).

Les sondages sont rangés par client (tenant) : chaque client ne voit que les
siens ; l'admin et le Superviseur voient tout.

Nouvelles collections Mongo : `wa_surveys`, `wa_survey_invites`,
`wa_survey_responses`, `wa_survey_campaigns`. Les index sont créés au démarrage.

## Fichiers touchés

**Nouveaux fichiers**
- `frontend/src/components/EmojiPicker.jsx`
- `frontend/src/components/ImageAnnotator.jsx`
- `backend/routes/wa_surveys.py` (sondages WhatsApp : routes, envoi, résultats)
- `backend/tests/test_wa_surveys_lot27.py` (test autonome — tu ne le lances pas)
- `frontend/src/pages/portal/Surveys.jsx`, `SurveyEditor.jsx`, `SurveyResults.jsx`
- `frontend/src/components/SurveySendModal.jsx`, `FormsSurveysTabs.jsx`
- `frontend/src/pages/public/PublicSurvey.jsx`
- `backend/tests/test_scheduler_lot27.py`, `backend/tests/test_wa_flow_lot27.py`
  (tests autonomes — tu ne les lances pas)

**Modifiés**
- `backend/server.py` :
  - planificateur déplacé dans `_start_scheduler` ;
  - `_expire_stale_schedules` ;
  - interrupteur de suspension ;
  - page d'état ;
  - sauvegarde dans un thread ;
  - réponse des formulaires WhatsApp dans le webhook, événement
    « whatsapp.flow_completed » ;
  - branchement des sondages WhatsApp (quelques lignes, après les groupes
    de contacts).
- `frontend/src/App.js` : routes `/portal|admin/surveys…` et `/s/:token`
- `frontend/src/components/PortalLayout.jsx` : lien « Sondages WhatsApp »
- `frontend/src/pages/portal/FormsList.jsx` : onglets Formulaires / Sondages
- `backend/routes/whatsapp_helpers.py` : bouton « Flux » ajouté à l'envoi,
  lecture de la réponse du formulaire
- `backend/routes/cashier.py` : garde-fous des relances automatiques
- `backend/models.py` : réglage `contract_auto_suspend_enabled`
- `backend/health_report.py` : PDF dans un thread
- `frontend/src/pages/portal/Contacts.jsx` : emojis, compteur SMS, bouton « Annoter »
- `frontend/src/pages/portal/UnifiedInbox.jsx` : emojis
- `frontend/src/pages/portal/WaBulk.jsx`, `SmsBulk.jsx` : motif d'annulation affiché
- `frontend/src/pages/admin/AdminSettings.jsx` : interrupteur « Suspendre automatiquement… »

Aucune dépendance nouvelle (APScheduler est déjà dans `requirements.txt`),
aucune variable d'environnement obligatoire.

## Vérification juste après le déploiement (importante)

Dans les logs du backend de **production**, tu dois voir
`[scheduler] démarré — 26 tâche(s) planifiée(s)`. Dans la **preview**, tu dois
voir `[scheduler] non démarré : environnement PREVIEW (...)`.

Si la production affiche « non démarré : environnement PREVIEW », c'est que
l'une des variables ci-dessus contient une adresse « .preview. » en
production. Corrige cette variable, ou ajoute `SCHEDULER_IN_PREVIEW=1` sur la
production uniquement, puis dis-le-moi.

## À tester une fois déployé

1. Connecte-toi avec le compte admin et ouvre
   `https://sawalismartsystems.com/api/admin/scheduler/status`. Tu dois voir
   `"running": true` et 26 tâches avec leur prochain passage.
2. WhatsApp → Envois groupés (et SMS → Envois groupés) : les anciens envois
   restés « en attente » sont passés en « Annulé » avec le motif. Programme un
   nouvel envoi dans 2 minutes : il part à l'heure.
3. Paramètres → Contrats : l'interrupteur « Suspendre automatiquement les
   comptes en retard » est présent et désactivé.
4. Centre de Messagerie → conversation d'un contact : clique sur 😊, cherche
   « merci », insère 🙏 au milieu d'une phrase et envoie. Le client le reçoit.
5. Envoie le modèle `suivilogiciels_fr` à ton propre numéro (conversation
   d'un contact, envoi par modèle). Le message arrive avec le bouton « Commencer le
   Suivi ». Ouvre-le, remplis le formulaire et envoie-le : la réponse
   « 📋 Formulaire WhatsApp complété » apparaît dans la conversation.
   Automations → « Nouvelle automation » : l'événement « Formulaire WhatsApp (Flow)
   complété » est proposé.
6. Conversation d'un contact : joins une capture d'écran, clique sur
   **Annoter**, trace une flèche, entoure une zone, floute un numéro et ajoute
   un texte, puis **Terminer**. L'aperçu montre l'image annotée ; envoie-la :
   le client la reçoit avec les annotations.
7. Envoi de SMS : ajoute un emoji.
8. **Sondages WhatsApp → Nouveau sondage** :
   - crée « Test satisfaction » avec une question à choix, une note et une
     recommandation ;
   - clique sur « Enregistrer et ouvrir », puis Envoyer ;
   - choisis ton propre client (ou un groupe qui contient ton numéro), puis
     « Voir les destinataires » et Suivant ;
   - choisis un modèle Meta approuvé et mets `{{lien}}` dans une variable ;
   - Envoyer : tu reçois le lien sur WhatsApp. Ouvre-le sur ton téléphone,
     réponds et envoie ;
   - dans les Résultats : 1 envoyé, 1 ouvert, 1 réponse, et les graphiques
     sont remplis. Le compteur passe en orange et indique
   « envoi en Unicode (70 caractères par SMS) ».

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact (écran
ou logs backend). Rappel : **AUCUN test, build, lint, Testing Agent ou
analyse automatique**. Applique le patch en UN SEUL `git am` et déploie,
c'est tout.
