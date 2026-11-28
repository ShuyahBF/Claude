"""Réglages de GeMAO, lus dans les variables d'environnement (Render) ou un fichier .env.

Pour un développeur WinDev : c'est l'équivalent du fichier de paramètres de l'application (INI).
Les valeurs marquées SECRET ne sont JAMAIS écrites dans le code ni dans les journaux.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Base MongoDB Atlas (SECRET). « mongomock:// » = base en mémoire (tests uniquement) ---
    mongo_url: str = "mongomock://"
    mongo_db_name: str = "gemao"
    mongo_collection_prefix: str = "gmao_"

    # --- Sécurité (SECRETS) ---
    jwt_secret: str = "change-me"               # signature des sessions
    jwt_heures: int = 12                         # durée d'une session
    cle_maitre: str = ""                         # chiffre les clés HMAC des clients au repos (vide = dérivée de jwt_secret)

    # --- Compte super-administrateur (créé au démarrage s'il n'existe pas) ---
    admin_email: str = ""
    admin_password: str = ""

    # --- Passerelle SAWALI : « Transmission WA Universelle » (même protocole que ZandGo et auRor) ---
    # Adresse complète de la route d'envoi de SAWALI. La clé HMAC et l'émetteur sont PAR CLIENT (base de données).
    liluvine_wa_url: str = ""
    liluvine_wa_source: str = "GeMAO"             # champ « source » du message (provenance affichée chez SAWALI)
    sawali_delai_secondes: int = 8
    tolerance_horodatage_secondes: int = 300      # webhook entrant : décalage d'horloge accepté

    # --- Présence auprès de SAWALI (règle 4) : signal au démarrage puis toutes les 5 minutes ---
    presence_sawali: str = "1"                    # « 0 » = désactivée (tests, poste de développement)
    presence_sawali_url: str = "https://api.sawalismartsystems.com/api/presence-logiciel"

    # --- Site (CORS) ---
    frontend_origin: str = "http://localhost:5173"

    @property
    def frontend_origins(self) -> List[str]:
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
