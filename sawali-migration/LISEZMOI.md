# Installateur du bouton « Migration vers Render » (site SAWALI sur Emergent)

`installer_migration.py` ajoute au site SAWALI hébergé sur Emergent la section
**AdminSettings > Diagnostics & Logs > « Migration vers Render (sauvegarde complète) »**
(sauvegarde de toute la base vers MongoDB Atlas, des fichiers / archives / secrets chiffrés vers R2).

- Autonome : les 3 fichiers sont embarqués dans le script et vérifiés par SHA-256.
- Ne modifie que 2 fichiers existants (`backend/server.py`, `frontend/src/pages/admin/AdminSettings.jsx`), en ajoutant quelques lignes.
- Relançable sans risque.
- Code source identique à celui du dépôt `ShuyahBF/shuyah-mirror` (demande de fusion #1).

Exécution (dans le terminal du projet Emergent) :

```bash
curl -fsSL <URL brute du fichier> -o /tmp/installer_migration.py && python3 /tmp/installer_migration.py /app
```
