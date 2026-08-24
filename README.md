# Gmail PDF Reader

Script Python qui parcourt une boîte de réception Gmail et lit le contenu de chaque PDF en pièce jointe, directement en mémoire (aucun fichier n'est écrit sur disque).

## Installation

```bash
pip install -r requirements.txt
```

## Configuration des identifiants Google

1. Aller sur [Google Cloud Console](https://console.cloud.google.com/), créer/sélectionner un projet.
2. Activer l'API **Gmail API**.
3. Créer des identifiants OAuth 2.0 de type **Application de bureau** (écran de consentement OAuth requis).
4. Télécharger le fichier JSON et le placer dans le dossier du script sous le nom `credentials.json`.
5. Au premier lancement, une fenêtre de navigateur s'ouvre pour autoriser l'accès ; un fichier `token.json` est ensuite créé pour réutiliser la session (à ne pas partager, il contient le jeton d'accès).

`credentials.json` et `token.json` sont des secrets : ne pas les committer (déjà exclus via `.gitignore`).

## Configuration Supabase

Le script enregistre chaque email traité dans la table `factures_gmail` (colonne `PDF`, type `bytea`, contient le ou les PDF fusionnés en un seul fichier binaire). Définissez ces deux variables d'environnement :

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_KEY="<clé service_role ou anon selon les policies RLS>"
```

Pour désactiver l'écriture Supabase (affichage console uniquement), utilisez `--no-supabase`.

## Utilisation

```bash
python gmail_pdf_reader.py
```

Dans un environnement sans navigateur (session distante, serveur headless), utilisez le flux OAuth manuel : une URL d'autorisation est affichée, à ouvrir dans votre propre navigateur ; collez ensuite l'URL de redirection (ou juste le code) dans le terminal.

```bash
python gmail_pdf_reader.py --manual-auth
```

Ou en tant que module dans un autre script :

```python
from gmail_pdf_reader import GmailPDFReader

reader = GmailPDFReader()
for bundle in reader.iter_email_pdfs(query="has:attachment filename:pdf", max_results=50):
    print(bundle.subject, bundle.filenames)
    print(bundle.text)  # texte extrait de tous les PDF de l'email
    # bundle.pdf_bytes : PDF fusionné (toutes pièces jointes de l'email), disponible en mémoire
```

`iter_email_pdfs` est un générateur : à chaque itération, un seul email est traité, ses PDF sont téléchargés en mémoire (`bytes`) et fusionnés en un seul fichier si plusieurs, le texte en est extrait via `pypdf`, puis l'objet est renvoyé. Rien n'est conservé une fois l'itération suivante démarrée, sauf si vous stockez `bundle` vous-même.

Le paramètre `query` accepte la syntaxe de recherche Gmail habituelle (`from:`, `after:`, `is:unread`, etc.).
