# forms-core — module commun de gestion de formulaires

Source **unique** du module Formulaires (création, envoi aux clients, lien
public, réponses, statistiques), partagé par les sites :

| Site | Dépôt / branche | Copie du backend | Copie du frontend | Adaptateur du site |
|---|---|---|---|---|
| Albarka | `ShuyahBF/albarka-portal` · `conflict_030926_0658` | `backend/forms_core/` | `frontend/src/components/forms-core/` | `backend/albarka_forms.py` + `frontend/src/pages/admin/AdminForms.jsx`, `pages/portal/MyForms.jsx`, `pages/public/FillForm.jsx` (lot 3, v1.0.0) |

Version courante : voir `VERSION` (identique à `__version__` dans `backend/forms_core/__init__.py`).

## Principe

- `backend/forms_core/` ne connaît **aucun site**. Il fournit :
  - `fields` : les 19 types de champs, la normalisation d'un formulaire
    (pages, options, bornes, colonnes, affichage conditionnel) et des réglages ;
  - `validation` : le contrôle d'une réponse **côté serveur** (obligatoires,
    formats e-mail/téléphone/URL/date, bornes, options, champs cachés écartés) ;
  - `stats` : indicateurs et **statistiques par question** ;
  - `export` : export CSV lisible dans Excel (BOM UTF-8, séparateur « ; ») ;
  - `api` : toutes les routes HTTP (`create_routers(adapter)`), branchées sur
    un **adaptateur** fourni par le site, et `ensure_indexes(adapter)` à
    appeler au démarrage du site (index Mongo : jetons uniques, réponses par
    formulaire, anti-abus).
- `frontend/forms-core/` fournit les écrans : `FormsLibrary` (liste),
  `FormDetail` (onglets Constructeur / Envoi & suivi / Réponses /
  Statistiques), `FormBuilder`, `FormRenderer` (moteur de rendu unique),
  `FormSendPanel`, `FormResponses`, `FormStats`, `PublicFormPage`, `MyForms`.
  Ils n'importent que `react-router-dom`, `@/lib/api` (`apiClient`),
  `sonner`, `lucide-react` et `recharts`, et la couleur `primary` de Tailwind.

## L'adaptateur du site (sous-classe de `forms_core.FormsAdapter`)

| Attribut / méthode | Rôle |
|---|---|
| `db` | base Motor |
| `code_prefix` | préfixe des numéros (`FORM-ALBARKA-0001`) |
| `manager_dependency` | dépendance FastAPI : qui gère les formulaires (rôle) |
| `user_dependency` | dépendance FastAPI : utilisateur connecté (espace client) |
| `scope_of(user)` | cloisonnement (un espace par cabinet/tenant) |
| `recipient_id_of(user)` | identifiant de destinataire d'un client connecté |
| `list_recipients(user)` / `get_recipient(id)` | clients sélectionnables / coordonnées non masquées |
| `send_invitation(...)` | envoi du lien par e-mail et/ou WhatsApp → `{canal: {ok, error}}` |
| `store_file(...)` / `file_url(id)` | stockage des fichiers joints et signatures / lien temporaire |
| `public_base_url(request)` | adresse du site pour construire les liens |
| `notify_submission(...)`, `log_event(...)` | facultatifs |

## Routes (préfixes par défaut)

- Gestionnaires `/forms` : liste, vue d'ensemble, catalogue, catégories,
  création, modification, duplication, archivage/restauration, réponses
  (liste, suppression, fichiers), statistiques, export CSV, destinataires,
  invitations (envoi, suivi, relance, désactivation), lien public (activer,
  nouveau lien, désactiver), QR code PNG.
- Public `/public/forms/{jeton}` : lecture, envoi de fichier, réponse
  (limite de 30 réponses/heure par connexion, champ piège anti-robots).
- Espace client `/me/forms` : formulaires reçus et leur statut.

Collections Mongo : `forms`, `forms_submissions`, `forms_invitations`,
`forms_categories`, `forms_counters`, `forms_rate`.

## Mettre à jour le module (procédure)

1. Corriger **ici** (`forms-core/`), jamais directement dans un site.
2. Monter la version dans `VERSION` **et** `backend/forms_core/__init__.py`.
3. Lancer les tests : `cd forms-core && python -m pytest tests -q`.
4. Pour chaque site : `./forms-core/sync.sh <racine du clone>` puis
   `./forms-core/sync.sh --check <racine>` (doit afficher « identique »).
5. Produire un lot par site (patch + prompt, `PATCH_DELIVERY_CONVENTIONS.md`).
