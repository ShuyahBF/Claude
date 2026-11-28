"""Clés HMAC SAWALI : signature, vérification, anti-rejeu, secret jamais divulgué."""
import hmac_sawali as h


def test_signature_et_verification():
    client = {"emetteur": "gemao-x", **h.champs_cle("cle-secrete")}
    corps = '{"a":"1"}'
    ent = h.entetes_signes(client, corps)
    assert ent["X-Emetteur"] == "gemao-x"
    assert h.verifier(client, ent["X-Timestamp"], ent["X-Signature"], corps)
    assert not h.verifier(client, ent["X-Timestamp"], ent["X-Signature"], corps + " ")      # corps altéré
    assert not h.verifier(client, ent["X-Timestamp"], "00" * 32, corps)                      # fausse signature
    assert not h.verifier(client, ent["X-Timestamp"], ent["X-Signature"], corps, maintenant=int(ent["X-Timestamp"]) + 3600)  # rejeu tardif
    assert not h.verifier({"emetteur": "x"}, "1", "abc", corps)                              # client sans clé


def test_format_identique_aux_autres_plateformes():
    # « <horodatage>.<corps> » en HMAC-SHA256 hexadécimal : même schéma que signal_connexion.py d'auRor
    import hashlib, hmac
    attendu = hmac.new(b"k", b"1700000000.{}", hashlib.sha256).hexdigest()
    assert h.signer("k", "1700000000", "{}") == attendu


def test_cle_chiffree_au_repos():
    champs = h.champs_cle("ma-cle-en-clair")
    assert "ma-cle-en-clair" not in champs["cle_hmac_chiffree"]
    assert h.cle_du_client(champs) == "ma-cle-en-clair"
