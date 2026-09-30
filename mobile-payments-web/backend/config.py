"""Réglages de l'API, lus dans les variables d'environnement (ou le fichier .env).

Aucun secret n'est écrit dans le code : JWT_SECRET, MONGO_URL et le mot de
passe de l'administrateur viennent uniquement de l'environnement (Render).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Base MongoDB (Atlas en production ; "mongomock://" = base en mémoire pour les tests) ---
    mongo_url: str = "mongomock://"
    mongo_db_name: str = "paiement_mobile"
    # Préfixe des collections : le cluster Atlas peut être partagé avec d'autres projets
    mongo_collection_prefix: str = "mpw_"

    # --- Adresses ---
    # Site public (la PREMIÈRE adresse sert aussi aux liens des QR marchands), séparées par des virgules
    frontend_origin: str = "http://localhost:5173"
    public_site_url: str = "http://localhost:5173"

    # --- Session ---
    jwt_secret: str = "a-changer-en-production"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 30  # 30 jours
    session_cookie_nom: str = "mpw_session"
    # "auto" : cookie Secure si le site est en https ; "true"/"false" pour forcer
    session_cookie_securise: str = "auto"

    # --- Administrateur créé au démarrage (gestion du catalogue des services USSD) ---
    admin_email: str = ""
    admin_password: str = ""

    # --- Indicatif téléphonique par défaut (numéros saisis sans indicatif) ---
    indicatif_defaut: str = "226"  # Burkina Faso

    # --- Protection contre les essais de mots de passe ---
    max_echecs_connexion: int = 10
    fenetre_echecs_minutes: int = 15

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
