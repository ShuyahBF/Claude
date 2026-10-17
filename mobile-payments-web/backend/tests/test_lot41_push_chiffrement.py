"""Lot 41 — Web Push : chiffrement RFC 8291 (exemple officiel de l'annexe A), clés VAPID, en-têtes."""
import asyncio

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

import push_web as pw

# Exemple officiel de la RFC 8291, annexe A
CLAIR = b"When I grow up, I want to be a watermelon"
AS_PRIVEE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"
UA_PRIVEE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"
UA_PUBLIQUE = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
SEL = "DGv6ra1nlYgDCS1FRnbzlw"
ATTENDU = ("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN")


def privee(b64):
    return ec.derive_private_key(int.from_bytes(pw.b64u_decode(b64), "big"), ec.SECP256R1())


def test_chiffrement_identique_a_l_exemple_de_la_rfc():
    corps = pw.chiffrer(CLAIR, UA_PUBLIQUE, AUTH, privee_serveur=privee(AS_PRIVEE), sel=pw.b64u_decode(SEL))
    assert pw.b64u(corps) == ATTENDU


def test_dechiffrement_aller_retour_et_unicite():
    ua = ec.generate_private_key(ec.SECP256R1())
    p256dh, auth = pw.b64u(pw._public_octets(ua.public_key())), pw.b64u(b"0123456789abcdef")
    msg = "💊 Paracétamol — Prise de 08:00".encode("utf-8")
    c1, c2 = pw.chiffrer(msg, p256dh, auth), pw.chiffrer(msg, p256dh, auth)
    assert pw.dechiffrer(c1, ua, auth) == msg and pw.dechiffrer(c2, ua, auth) == msg
    assert c1 != c2                                                    # sel et clé éphémère différents à chaque message
    assert msg not in c1                                               # rien de lisible dans le corps envoyé
    with pytest.raises(Exception):
        pw.dechiffrer(c1, ua, pw.b64u(b"mauvais-secret-xx"))           # mauvais secret d'authentification


def test_cles_vapid_creees_une_fois_et_en_tete_signee(client):
    loop = asyncio.new_event_loop()
    try:
        p1, k1 = loop.run_until_complete(pw.cles_vapid())
        p2, k2 = loop.run_until_complete(pw.cles_vapid())
    finally:
        loop.close()
    assert (p1, k1) == (p2, k2) and len(pw.b64u_decode(k1)) == 65 and "PRIVATE KEY" in p1
    en_tete = pw.en_tetes_vapid("https://fcm.googleapis.com/fcm/send/abc", p1, k1)["Authorization"]
    assert en_tete.startswith("vapid t=") and f", k={k1}" in en_tete
    jeton = en_tete.split("t=")[1].split(",")[0]
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), pw.b64u_decode(k1))
    claims = jwt.decode(jeton, pub, algorithms=["ES256"], audience="https://fcm.googleapis.com")      # signature et audience vérifiées
    assert claims["sub"].startswith("mailto:") and claims["exp"] > 0
