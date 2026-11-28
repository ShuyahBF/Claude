"""WHATSAPP via SAWALI.

  - GET  /whatsapp/messages          : journal des messages du client (entrants et sortants) ;
  - POST /whatsapp/test              : message d'essai (vérifie la clé HMAC du client de bout en bout) ;
  - POST /webhooks/sawali            : WEBHOOK ENTRANT public, sans session — authentifié UNIQUEMENT par la signature
                                       HMAC du client (en-têtes X-Emetteur, X-Timestamp, X-Signature).

Message entrant : « PANNE <code équipement> <description> » envoyé par le numéro d'un utilisateur du client
crée une demande d'intervention ; la réponse WhatsApp donne le numéro d'OT. Tout autre texte reçoit l'aide.
"""
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

import hmac_sawali
import whatsapp
from db import SANS_ID, db
from outils import chiffres, client_actif, exiger, maintenant, nouvel_id
from routes.interventions import Demande, creer_ot

router = APIRouter(tags=["whatsapp"])
AIDE = "GeMAO : pour signaler une panne, envoyez « PANNE <code équipement> <description> »."


class Essai(BaseModel):
    telephone: str
    texte: str = "Message d'essai GeMAO."


@router.get("/whatsapp/messages")
async def messages(cid: str = Depends(client_actif), _=Depends(exiger("admin", "technicien"))):
    return [m async for m in db.wa_messages.find({"client_id": cid}, SANS_ID).sort("le", -1).limit(200)]


@router.post("/whatsapp/test")
async def essai(e: Essai, cid: str = Depends(client_actif), _=Depends(exiger("admin"))):
    client = await db.clients.find_one({"id": cid}, SANS_ID)
    # Essai explicite : l'utilisateur attend le résultat (statut), c'est le seul envoi réalisé dans la requête
    return {"statut": await whatsapp.envoyer(client, e.telephone, e.texte, "essai")}


@router.post("/webhooks/sawali")
async def webhook(request: Request):
    brut = (await request.body()).decode("utf-8", "replace")        # le corps BRUT est signé : on ne le reformate pas
    emetteur = request.headers.get("x-emetteur", "")
    client = await db.clients.find_one({"emetteur": emetteur, "actif": True}, SANS_ID) if emetteur else None
    # Même réponse pour « émetteur inconnu » et « signature fausse » : on ne révèle rien
    if not client or not hmac_sawali.verifier(client, request.headers.get("x-timestamp", ""),
                                              request.headers.get("x-signature", ""), brut):
        raise HTTPException(401, "Signature invalide.")
    try:
        msg = json.loads(brut)
        de, texte, mid = chiffres(msg["de"]), str(msg.get("message", "")).strip(), str(msg["id"])
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Corps invalide : « id », « de » et « message » attendus.")
    try:
        await db.wa_vus.insert_one({"client_id": client["id"], "message_id": mid, "le": maintenant()})
    except DuplicateKeyError:
        return {"ok": True, "doublon": True}                         # rejeu : déjà traité, rien à refaire
    await db.wa_messages.insert_one({"id": nouvel_id(), "client_id": client["id"], "sens": "entrant", "telephone": de,
                                     "texte": texte, "reference": mid, "statut": "recu", "le": maintenant()})
    reponse = await traiter(client, de, texte)
    whatsapp.en_arriere_plan(whatsapp.envoyer(client, de, reponse, mid))   # règle 7 : la réponse WhatsApp part en arrière-plan
    return {"ok": True}


async def traiter(client: dict, de: str, texte: str) -> str:
    """Interprète le message reçu et renvoie le texte de la réponse WhatsApp."""
    users = [u async for u in db.users.find({"client_id": client["id"], "actif": True}, SANS_ID) if chiffres(u.get("telephone"))]
    auteur = next((u for u in users if chiffres(u["telephone"]) == de), None)
    if not auteur:
        return "GeMAO : votre numéro n'est pas enregistré chez ce client."
    m = re.match(r"^\s*panne\s+(\S+)\s*(.*)$", texte, re.IGNORECASE | re.DOTALL)
    if not m:
        return AIDE
    eq = await db.equipements.find_one({"client_id": client["id"], "code": {"$regex": f"^{re.escape(m.group(1))}$", "$options": "i"}}, SANS_ID)
    if not eq:
        return f"GeMAO : équipement « {m.group(1)} » introuvable."
    descr = m.group(2).strip() or "Panne signalée par WhatsApp"
    ot = await creer_ot(client["id"], auteur["id"], Demande(equipement_id=eq["id"], titre=descr[:160], description=descr,
                                                             priorite="haute", arret_production=True), source="whatsapp")
    return f"GeMAO : demande {ot['numero']} enregistrée pour {eq['nom']}. Un technicien va être affecté."
