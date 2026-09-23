# Prototype — extraction de pièces comptables scannées (Albarka)

Prototype autonome pour comparer les modèles Claude sur de vraies pièces du
cabinet comptable (imprimées, manuscrites, avec filigranes) avant intégration
dans Albarka : choix du modèle avant téléversement, coût affiché en FCFA pour
chaque pièce, tableau de bord (coût cumulé, précision moyenne, nb pièces,
coût moyen) par période.

## Installation

```bash
cd document-extraction-prototype
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."     # ta clé API Anthropic
export USD_TO_XOF_RATE="600"              # optionnel — taux USD->XOF à ajuster (voir pricing.py)
uvicorn app:app --reload
```

Ouvre ensuite http://localhost:8000

## Ce que fait le prototype

1. **Liste déroulante de modèles** — Claude Opus 5, Sonnet 5, Haiku 4.5 (tarifs
   officiels câblés dans `models_config.py`).
2. **Téléversement** d'une image (JPG/PNG) ou d'un PDF scanné.
3. **Extraction structurée** (numéro, date, émetteur, IFU/RCCM, client, lignes,
   sous-total, taxes, montant total) via l'API Anthropic (vision), avec une
   confiance auto-déclarée par le modèle et la liste des champs qu'il juge
   incertains (mis en évidence en orange dans l'interface).
4. **Coût affiché en FCFA** pour cette pièce précise, calculé à partir des
   tokens réellement consommés (`response.usage`) × le tarif officiel du
   modèle choisi × le taux USD→XOF configuré.
5. **Validation humaine** — le comptable peut corriger les champs directement
   dans le formulaire puis "Signaler des corrections" : la précision réelle
   (% de champs non corrigés) est alors enregistrée et distinguée de la
   simple confiance auto-déclarée du modèle dans tout le tableau de bord.
6. **Tableau de bord** par période (aujourd'hui / 7 jours / 30 jours / tout) :
   coût cumulé FCFA, précision moyenne, nombre de pièces traitées, coût
   moyen par pièce.

## Limites assumées de ce prototype (à traiter avant la vraie mise en prod)

- **Persistance** : SQLite local (`extractions.db`), à remplacer par la vraie
  base d'Albarka en conservant le même schéma de champs (voir `db.py`).
- **Taux de change USD→FCFA** : constante configurable (`USD_TO_XOF_RATE`),
  pas un taux de marché live — le FCFA est arrimé à l'EURO (655,957 XOF/EUR),
  pas au dollar, donc ce taux fluctue légèrement ; à rafraîchir périodiquement
  ou à brancher sur une vraie source de change avant la production.
- **Précision** : tant qu'une pièce n'a pas été relue par un comptable, le
  chiffre affiché est la confiance QUE LE MODÈLE S'ATTRIBUE LUI-MÊME — jamais
  une garantie. Ne jamais comptabiliser un montant extrait sans relecture
  humaine, en particulier sur les pièces manuscrites.
- **Autres fournisseurs (GPT-4o, Gemini, Mistral OCR)** : non implémentés ici
  — je n'avais pas de clé API à tester pour ces fournisseurs et je préfère ne
  pas deviner leur intégration exacte plutôt que de livrer du code non
  vérifié. `models_config.py` est structuré pour qu'ajouter un fournisseur
  supplémentaire reste localisé (nouvelle entrée + une fonction d'extraction
  dédiée dans `extractor.py`) — dis-moi si tu veux qu'on l'ajoute et avec
  quelle clé API.
- **Authentification** : aucune — à protéger avant tout déploiement au-delà
  d'un test local (l'app n'a aucune notion d'utilisateur/cabinet).

## Résultats sur tes 3 pièces d'exemple

Non testés en conditions réelles dans cette session : je n'ai pas de clé
`ANTHROPIC_API_KEY` disponible dans cet environnement pour appeler l'API
réelle. La logique (extraction, calcul de coût, agrégation FCFA, formulaire
de validation) est écrite et le code démarre sans erreur — teste-le avec ta
propre clé sur `LES_MODERNE_SERVICE_MOTO.jpg`, `GESPHARM` et `ADO_SECURITE`
pour valider la précision réelle avant d'aller plus loin.
