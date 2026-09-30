"""Catalogue de départ des services USSD (Burkina Faso), repris de l'app Android
(`mobile-payments-app/backend/src/seed/seed.js`).

Il est inséré au démarrage UNIQUEMENT si le catalogue est vide : ensuite,
l'administrateur le gère depuis le site (page Administration).
⚠️ Codes fournis à titre indicatif : à vérifier auprès de chaque opérateur.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from db import db


def _champ(key, label, type_="numeric", marchand=False):
    return {"key": key, "label": label, "type": type_, "isMerchantCode": marchand}


MONTANT = _champ("amount", "Montant (FCFA)")

SERVICES = [
    ("Orange", "Paiement marchand", "merchant_payment", "*144*10*{code}*{amount}#",
     [_champ("code", "Code marchand", marchand=True), MONTANT], "Paiement Orange Money chez un marchand affilié"),
    ("Orange", "Paiement de facture", "bill_payment", "*144*4*{code}*{amount}#",
     [_champ("code", "Code du fournisseur", marchand=True), MONTANT],
     "Règlement de facture (eau, électricité, etc.) via Orange Money"),
    ("Orange", "Transfert d'argent", "money_transfer", "*144*1*{phone}*{amount}#",
     [_champ("phone", "Numéro du bénéficiaire"), MONTANT], "Transfert d'argent vers un autre numéro Orange Money"),
    ("Orange", "Achat de crédit de communication", "airtime_topup", "*144*4*1*{amount}#",
     [MONTANT], "Rechargement de crédit de communication depuis le solde Orange Money"),
    ("Moov Africa", "Paiement marchand", "merchant_payment", "*555*2*{code}*{amount}#",
     [_champ("code", "Code marchand", marchand=True), MONTANT], "Paiement Moov Money chez un marchand affilié"),
    ("Moov Africa", "Transfert d'argent", "money_transfer", "*555*1*{phone}*{amount}#",
     [_champ("phone", "Numéro du bénéficiaire"), MONTANT], "Transfert d'argent Moov Money"),
    ("Telecel Faso", "Paiement marchand", "merchant_payment", "*133*3*{code}*{amount}#",
     [_champ("code", "Code marchand", marchand=True), MONTANT], "Paiement Telecel Money chez un marchand affilié"),
]


async def initialiser_catalogue() -> int:
    """Insère le catalogue de départ si aucun service n'existe. Renvoie le nombre inséré."""
    if await db.services.count_documents({}) > 0:
        return 0
    maintenant = datetime.now(timezone.utc).isoformat()
    for operateur, nom, categorie, gabarit, champs, description in SERVICES:
        await db.services.insert_one({
            "id": str(uuid.uuid4()), "operateur": operateur, "pays": "BF", "nom": nom, "categorie": categorie,
            "gabarit_ussd": gabarit, "champs": champs, "description": description, "actif": True,
            "cree_le": maintenant, "modifie_le": maintenant,
        })
    return len(SERVICES)
