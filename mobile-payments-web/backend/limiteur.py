"""Limitation du nombre d'appels publics par adresse IP (app Android, visites).

Les routes de l'app Android et la route des visites sont PUBLIQUES (sans
compte) : on limite donc le nombre d'appels par minute et par adresse IP pour
éviter qu'un robot ne remplisse l'annuaire des marchands ou n'inonde SAWALI.

Pour un développeur WinDev : c'est un tableau associatif en mémoire
(clé = adresse IP, valeur = liste des heures d'appel de la dernière minute).
La mémoire est vidée au redémarrage du serveur, ce qui suffit ici.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request, status

from config import get_settings
from signal_connexion import adresse_ip


class Limiteur:
    """Fenêtre glissante : au plus `maximum` appels par `fenetre` secondes et par clé."""

    def __init__(self, maximum: int, fenetre: float = 60.0):
        self.maximum = maximum
        self.fenetre = fenetre
        self._appels: Dict[str, Deque[float]] = defaultdict(deque)

    def autoriser(self, cle: str, maintenant: float | None = None) -> bool:
        """Vrai si l'appel est accepté (et le compte) ; faux si la limite est atteinte."""
        maintenant = time.monotonic() if maintenant is None else maintenant
        file = self._appels[cle]
        # On oublie les appels sortis de la fenêtre
        while file and maintenant - file[0] >= self.fenetre:
            file.popleft()
        if len(file) >= self.maximum:
            return False
        file.append(maintenant)
        # Ménage : au-delà de 10 000 adresses suivies, on repart de zéro (protection mémoire)
        if len(self._appels) > 10_000:
            self._appels.clear()
        return True

    def vider(self) -> None:
        self._appels.clear()


# Limiteurs partagés par toutes les routes publiques :
#  - écritures (POST) : LIMITE_PUBLIQUE_PAR_MINUTE appels par minute et par IP ;
#  - lectures (GET)   : 5 fois plus, car beaucoup de téléphones partagent la même adresse IP
#    chez l'opérateur mobile, et l'app lit le catalogue opérateur par opérateur.
limiteur_public = Limiteur(get_settings().limite_publique_par_minute)
limiteur_lecture = Limiteur(get_settings().limite_publique_par_minute * 5)


async def limiter_appels_publics(request: Request) -> None:
    """Dépendance FastAPI : refuse (429) au-delà de la limite par minute et par IP."""
    limiteur = limiteur_lecture if request.method == "GET" else limiteur_public
    if not limiteur.autoriser(adresse_ip(request) or "inconnue"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Trop de requêtes : réessayez dans une minute")
