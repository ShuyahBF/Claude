# Contexte projet et préférences

Ce fichier centralise le contexte à réutiliser automatiquement dans les futures sessions Claude Code sur ce repo.

## Développeur

- **Nom** : J.F. Ouoba (jfrancois.ouoba@gmail.com)
- **Langage principal** : Windev (PCSOFT)
- **En apprentissage** : Python, Visual Studio 2026
- **Base de données habituelle** : HFSQL (PCSOFT) — privilégier les connecteurs **OLEDB** (ou solution la plus simple) pour y accéder depuis un autre langage
- **Base de données occasionnelle** : MongoDB Atlas
- **Convention de code** : toujours ajouter un commentaire clair expliquant le bloc de code créé/modifié, quel que soit le langage

## Projet : Site-SawaliSmartSystems

Terme/projet à retenir pour les prochaines sessions. Détails à compléter au fur et à mesure des échanges (objectif du site, stack technique exacte, base de données utilisée, état d'avancement, hébergement, etc.) — pour l'instant aucune information supplémentaire n'a été fournie par l'utilisateur.

## Repo actuel : Gmail PDF Reader

- Script Python (`gmail_pdf_reader.py`) qui lit les PDF en pièce jointe d'une boîte Gmail directement en mémoire (aucun fichier écrit sur disque).
- Auth via OAuth2 Google (Gmail API), avec flux manuel disponible pour environnements headless (`--manual-auth`).
- Persistance des emails traités dans Supabase, table `factures_gmail` (colonne `PDF`, type `bytea`), désactivable via `--no-supabase`.
- Secrets (`credentials.json`, `token.json`) exclus du versioning via `.gitignore`.
