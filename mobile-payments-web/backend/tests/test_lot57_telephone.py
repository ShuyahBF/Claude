"""Lot 57 — numéros burkinabè : 8 chiffres exactement, opérateur d'après le 2e chiffre (règle de ZandGo), affichage par groupes de 2."""
import pytest

from operateurs_tel import formater, operateur_bf
from ussd import ErreurSaisie, normaliser_telephone


@pytest.mark.parametrize("numero,reseau", [
    ("+22670123456", "Moov"), ("+22607332313", "Orange"), ("+22665000000", "Orange"), ("+22658437050", "Telecel"),
    ("+22601000000", "Moov"), ("+22633000000", "Moov"), ("+22644000000", "Orange"), ("+22688000000", "Telecel"), ("+22699000000", "Telecel"),
])
def test_operateur_selon_le_deuxieme_chiffre(numero, reseau):
    assert operateur_bf(numero) == reseau
    assert operateur_bf(numero.replace("+", "")) == reseau                 # sans le « + »


def test_pas_d_operateur_hors_burkina_ou_mal_forme():
    assert operateur_bf("+2250700000000") is None                          # Côte d'Ivoire
    assert operateur_bf("+2267012345") is None                             # 7 chiffres
    assert operateur_bf("+226701234567") is None                           # 9 chiffres
    assert operateur_bf("") is None and operateur_bf(None) is None


def test_affichage_par_groupes_de_deux():
    assert formater("22607332313") == "+226 07 33 23 13"
    assert formater("+22670123456") == "+226 70 12 34 56"
    assert formater("+2250700000000") == "+2250700000000"                  # autre pays : chiffres tels quels
    assert formater("") == ""


def test_numero_burkinabe_exactement_8_chiffres():
    assert normaliser_telephone("07 33 23 13") == "+22607332313"            # un numéro peut commencer par 0
    assert normaliser_telephone("+226 70 12 34 56") == "+22670123456"
    for faux in ("+2267012345", "+226701234567", "002267012345"):
        with pytest.raises(ErreurSaisie):
            normaliser_telephone(faux)
    assert normaliser_telephone("+33 6 12 34 56 78") == "+33612345678"      # autres pays inchangés


def test_fiche_de_compte_porte_l_operateur(client, admin, utilisateur):
    user, _, _ = utilisateur                                                 # numéros de test : 70 xx xx 00 → 2e chiffre 0 → Moov
    r = client.get("/api/admin/comptes", headers=admin, params={"q": user["telephone"]})
    assert r.json()["comptes"][0]["operateur"] == "Moov"
