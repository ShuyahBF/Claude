"""Construction des codes USSD et normalisation des identifiants.

Même logique que l'app Android (`buildUssdCode`) : chaque placeholder `{cle}`
du gabarit du service est remplacé par la valeur saisie. Le serveur vérifie en
plus que chaque valeur est bien formée, pour qu'un code incohérent ne soit
jamais proposé à l'utilisateur.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import quote

from config import get_settings

PLACEHOLDER = re.compile(r"\{([a-zA-Z0-9_]+)\}")
# Caractères autorisés dans un gabarit USSD : chiffres, *, #, placeholders
GABARIT_VALIDE = re.compile(r"[0-9*#]*(\{[a-zA-Z0-9_]+\}[0-9*#]*)*")
MONTANT_MAX = 10_000_000  # FCFA : garde-fou contre une faute de frappe


class ErreurSaisie(ValueError):
    """Valeur saisie refusée ; le message (en français) est affiché tel quel."""


def placeholders(gabarit: str) -> list[str]:
    """Clés attendues par un gabarit, dans l'ordre (ex. ['code', 'amount'])."""
    return PLACEHOLDER.findall(gabarit)


def gabarit_valide(gabarit: str) -> bool:
    """Un gabarit commence par « * », finit par « # » et ne contient que des
    chiffres, des « * », des « # » et des placeholders {cle}."""
    gabarit = gabarit or ""
    return bool(GABARIT_VALIDE.fullmatch(gabarit)) and gabarit.startswith("*") and gabarit.endswith("#")


def construire_code(gabarit: str, champs: list[dict], valeurs: dict[str, str]) -> str:
    """Remplace chaque {cle} par la valeur saisie, après contrôle de chaque champ.

    - champ "numeric" : chiffres uniquement ;
    - champ montant (clé "amount") : entier > 0 et <= MONTANT_MAX ;
    - un placeholder sans valeur fait échouer la construction.
    """
    libelles = {c["key"]: c.get("label", c["key"]) for c in champs}
    types = {c["key"]: c.get("type", "numeric") for c in champs}
    code = gabarit
    for cle in placeholders(gabarit):
        brut = str(valeurs.get(cle, "")).strip().replace(" ", "")
        libelle = libelles.get(cle, cle)
        if not brut:
            raise ErreurSaisie(f"« {libelle} » est obligatoire")
        if types.get(cle, "numeric") == "numeric" and not brut.isdigit():
            raise ErreurSaisie(f"« {libelle} » ne doit contenir que des chiffres")
        if types.get(cle) == "text" and not re.fullmatch(r"[0-9A-Za-z]+", brut):
            raise ErreurSaisie(f"« {libelle} » ne doit contenir que des lettres et des chiffres")
        if cle == "amount":
            montant = int(brut)
            if montant <= 0:
                raise ErreurSaisie("Le montant doit être supérieur à 0")
            if montant > MONTANT_MAX:
                raise ErreurSaisie("Montant trop élevé : vérifiez la saisie")
            brut = str(montant)  # retire les zéros de tête
        code = code.replace("{" + cle + "}", brut)
    return code


def lien_tel(code_ussd: str) -> str:
    """Lien « tel: » qui ouvre le composeur du téléphone avec le code pré-rempli.
    Le « # » doit être encodé (%23), sinon il serait lu comme une ancre."""
    return "tel:" + quote(code_ussd, safe="*")


# ---------------------------------------------------------------------------
# Identifiant de connexion : numéro de téléphone OU adresse e-mail
# ---------------------------------------------------------------------------
def normaliser_email(email: str) -> str:
    return email.strip().lower()


def normaliser_telephone(telephone: str) -> str:
    """Numéro au format international « +22670000000 ».

    Accepte « 70 00 00 00 », « 0022670000000 », « +226 70 00 00 00 »… Un numéro
    local de 8 chiffres reçoit l'indicatif par défaut (226, Burkina Faso)."""
    brut = telephone.strip()
    chiffres = re.sub(r"\D", "", brut)
    if brut.startswith("00"):
        chiffres = chiffres[2:]
    elif not brut.startswith("+") and len(chiffres) == 8:
        chiffres = get_settings().indicatif_defaut + chiffres
    if not 8 <= len(chiffres) <= 15:
        raise ErreurSaisie("Numéro de téléphone invalide")
    return "+" + chiffres


def analyser_identifiant(identifiant: str) -> tuple[str, str]:
    """('email', valeur) ou ('telephone', valeur) selon ce qu'a saisi l'utilisateur."""
    identifiant = (identifiant or "").strip()
    if not identifiant:
        raise ErreurSaisie("Saisissez votre numéro de téléphone ou votre e-mail")
    if "@" in identifiant:
        return "email", normaliser_email(identifiant)
    return "telephone", normaliser_telephone(identifiant)


def email_valide(email: Optional[str]) -> bool:
    return bool(email) and bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email))
