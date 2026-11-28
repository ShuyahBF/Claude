# GeMAO — GMAO multi-clients (ZandGo, ALBARKA…)

Gestion de la maintenance assistée par ordinateur, **une plateforme, plusieurs clients étanches**, avec WhatsApp via SAWALI
signé par une **clé HMAC propre à chaque client**. FastAPI + MongoDB (Atlas) + React, comme auRor.

## Ce que fait GeMAO
- **Clients** (super-administrateur) : création d'un client = émetteur SAWALI + clé HMAC + administrateur ; suspension, WhatsApp coupé/activé, **rotation de clé**.
- **Par client** : équipements (état, criticité, historique), interventions (demande → planifiée → en cours → terminée),
  pièces et stock (seuil d'alerte, mouvements, sorties atomiques), maintenance préventive (plans périodiques, génération des échéances),
  utilisateurs (admin, technicien, demandeur), tableau de bord (MTTR, coûts, urgentes, pièces sous le seuil, préventif en retard).
- **Rôles** : `super_admin` (clients seulement, ou un client choisi via `X-Client-Id`), `admin`, `technicien`, `demandeur` (ne voit que ses demandes).
- **Isolation** : chaque document porte `client_id` ; un utilisateur ne sort jamais de son client (testé).

## Clés HMAC SAWALI (WhatsApp)
Schéma identique aux autres plateformes (auRor) : `X-Emetteur`, `X-Timestamp` (secondes), `X-Signature = HMAC-SHA256(clé, "<horodatage>.<corps brut>")`.
| Sens | Rôle de la clé du client |
|---|---|
| **Sortant** GeMAO → SAWALI (`POST {SAWALI_URL}{SAWALI_CHEMIN_ENVOI}`, corps `{"a","message","reference"}`) | signe l'envoi (technicien prévenu à l'affectation, demandeur à la clôture) |
| **Entrant** SAWALI → GeMAO (`POST /api/webhooks/sawali`, corps `{"id","de","message"}`) | vérifie la signature : émetteur connu, horodatage < 5 min, comparaison en temps constant, rejeu de `id` ignoré |

- La clé (256 bits) n'est **montrée qu'une fois** à la création / rotation ; en base elle est **chiffrée** (Fernet, `CLE_MAITRE`) avec une empreinte de 8 caractères.
- Message WhatsApp entrant : `PANNE <code équipement> <description>` depuis le numéro d'un utilisateur du client crée une intervention et répond avec son numéro.

## Activer un nouveau client (ex. ZandGo)
1. Super-admin → « Clients Et Clés HMAC » → créer le client (l'émetteur par défaut est `gemao-zandgo`).
2. Noter la clé affichée ; dans SAWALI, déclarer l'émetteur `gemao-zandgo` avec cette clé, et pointer son webhook vers `https://<api>/api/webhooks/sawali`.
3. Admin du client → « WhatsApp » → « Envoyer un essai » : le statut doit être « Envoyé ».

## Déploiement Render
`gemao/render.yaml` (Blueprint). Secrets à saisir : `MONGO_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SAWALI_URL`, `FRONTEND_ORIGIN` (+ `VITE_API_URL` côté site).
**Conserver `CLE_MAITRE`** : sans elle, les clés HMAC enregistrées ne se déchiffrent plus (il faudrait les renouveler).

## Lancer en local
```
cd gemao/backend && pip install -r requirements-dev.txt && python -m pytest -q          # 13 tests, base en mémoire
MONGO_URL=mongomock:// ADMIN_EMAIL=root@test.bf ADMIN_PASSWORD=… uvicorn server:app --port 8000
cd gemao/frontend && npm install && npm run dev && npm test
```

## À confirmer côté SAWALI
Le chemin d'envoi (`/api/webhook/gemao-message`) et les noms de champs du corps (`a`, `message`, `reference`) sont des hypothèses
calquées sur le schéma d'auRor : à aligner avec l'API réelle de SAWALI (variable `SAWALI_CHEMIN_ENVOI`, `backend/whatsapp.py`).
