"""Cartes « Nouveautés » de la page Paramètres (règle 5 : une entrée par lot déployé, MÊME numéro que lot.py).
`rubrique` = titre EXACT d'une rubrique de la page Paramètres (RUBRIQUES) : la carte ouvre le réglage, jamais l'écran d'usage."""
RUBRIQUES = ("Version Et Nouveautés", "WhatsApp Et Clés HMAC", "Performances")

NOUVEAUTES = [
    {"lot": "1", "titre": "Première version de GeMAO",
     "description": "GMAO multi-clients : équipements, interventions, stock, préventif, WhatsApp signé par une clé HMAC par client.",
     "date": "2026-11-28", "rubrique": "WhatsApp Et Clés HMAC"},
]
