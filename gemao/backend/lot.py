"""Source unique du numéro de lot et de la version de GeMAO (règle 1 du propriétaire).

LOT = numéro de la PR fusionnée ; à mettre à jour à CHAQUE déploiement (cela force aussi le redéploiement
du service Render, qui ne redéploie un `rootDir` que si un fichier de son dossier change).
VERSION = compteur de déploiements « 1.N » : +1 à chaque déploiement.
Une nouveauté portant le MÊME numéro de lot doit exister dans nouveautes.py (test test_regle_nouveautes)."""
LOT = "1"
VERSION = "1.1"
LOT_LIBELLE = "Première version : GMAO multi-clients, clés HMAC SAWALI par client, WhatsApp"
