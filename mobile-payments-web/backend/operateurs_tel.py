"""Opérateur d'un numéro burkinabè (Orange, Moov, Telecel) et mise en forme lisible d'un numéro (lot 57).

RÈGLE CONFIRMÉE PAR LE PROPRIÉTAIRE (11/10/2026, plateforme ZandGo) — reprise à l'identique :
  - tous les numéros du Burkina Faso (+226) ont EXACTEMENT 8 chiffres nationaux ;
  - le 2e chiffre de ces 8 chiffres identifie le réseau :
        0, 1, 2, 3 → Moov     (ex. 70 12 34 56)
        4, 5, 6, 7 → Orange   (ex. 07 33 23 13, 65 00 00 00)
        8, 9       → Telecel  (ex. 58 43 70 50)
L'opérateur sert à l'AFFICHAGE (pastille) : il ne change rien aux paiements.
Même logique côté site : frontend/src/lib/operateurs.js (garder les deux fichiers identiques).
Pour un développeur WinDev : de simples « procédures globales » sans accès à la base.
"""
from __future__ import annotations

import re
from typing import Optional

INDICATIF_BF = "226"
LONGUEUR_BF = 8
RESEAUX_BF = {"0": "Moov", "1": "Moov", "2": "Moov", "3": "Moov", "4": "Orange", "5": "Orange", "6": "Orange", "7": "Orange", "8": "Telecel", "9": "Telecel"}


def _chiffres(telephone: Optional[str]) -> str:
    return re.sub(r"\D", "", str(telephone or ""))


def operateur_bf(telephone: Optional[str]) -> Optional[str]:
    """Réseau d'un numéro burkinabè international (« +22607332313 » → « Orange »). None si pas burkinabè ou pas 8 chiffres après 226."""
    c = _chiffres(telephone)
    if not c.startswith(INDICATIF_BF) or len(c) != len(INDICATIF_BF) + LONGUEUR_BF:
        return None
    return RESEAUX_BF.get(c[len(INDICATIF_BF) + 1])


def formater(telephone: Optional[str]) -> str:
    """« 22607332313 » → « +226 07 33 23 13 » (groupes de 2 au Burkina) ; autre pays : « +chiffres » ; "" si aucun chiffre."""
    c = _chiffres(telephone)
    if not c:
        return ""
    if c.startswith(INDICATIF_BF) and len(c) == len(INDICATIF_BF) + LONGUEUR_BF:
        n = c[len(INDICATIF_BF):]
        return f"+{INDICATIF_BF} " + " ".join(n[i:i + 2] for i in range(0, LONGUEUR_BF, 2))
    return f"+{c}"
