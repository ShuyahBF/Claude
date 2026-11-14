package com.ouoba.mobilepay.util

import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.model.ServiceField
import org.junit.Assert.*
import org.junit.Test

/** Tests du résumé de paiement et de la protection du code secret (lot 17). Données FICTIVES. */
class ResumePaiementTest {
    private val simple = Service("1", "Orange", "BF", "Paiement marchand", "merchant_payment", "*100*{code}*{amount}#",
        listOf(ServiceField("code", "Code marchand", "numeric", true), ServiceField("amount", "Montant (FCFA)", "numeric")))
    private val avecPin = simple.copy(_id = "2", ussdTemplate = "*100*{code}*{amount}*{pin}#",
        fields = simple.fields + ServiceField("pin", "Code secret", "numeric"))

    @Test fun montantEnFrancs() {
        assertEquals("2 500 FCFA", ResumePaiement.montant("2500"))
        assertEquals("1 250 000 FCFA", ResumePaiement.montant(" 1250000 "))
        assertEquals("abc", ResumePaiement.montant("abc"))                                      // texte non numérique : laissé tel quel
    }

    @Test fun leCodeSecretNApparaitJamais() {
        val valeurs = mapOf("code" to "445566", "amount" to "2500", "pin" to "1234")
        val lignes = ResumePaiement.lignes(avecPin, valeurs, Merchant(code = "445566", operator = "Orange", label = "BOUTIQUE TEST"))
        assertTrue(lignes.none { it.second.contains("1234") || it.first.contains("secret", true) })
        assertTrue(lignes.contains("Montant (FCFA)" to "2 500 FCFA"))
        assertTrue(lignes.contains("Code marchand" to "445566 (BOUTIQUE TEST)"))
        assertEquals("*100*445566*2500*••••#", ResumePaiement.codeAffiche("*100*445566*2500*1234#", "1234"))
        assertEquals("*100*445566*2500#", ResumePaiement.codeAffiche("*100*445566*2500#", ""))
    }

    @Test fun questionDeConfirmation() {
        assertEquals("Envoyer 2 500 FCFA — Paiement marchand (Orange) ?", ResumePaiement.question(simple, mapOf("amount" to "2500")))
        assertEquals("Envoyer la demande — Paiement marchand (Orange) ?", ResumePaiement.question(simple, emptyMap()))
    }

    @Test fun serviceAvecCodeSecretMasqueSurLePlayStore() {
        assertTrue(ResumePaiement.demandePin(avecPin)); assertFalse(ResumePaiement.demandePin(simple))
        assertEquals(listOf(simple), ResumePaiement.servicesUtilisables(listOf(simple, avecPin), modeDirect = false))   // Play Store : jamais de code secret
        assertEquals(2, ResumePaiement.servicesUtilisables(listOf(simple, avecPin), modeDirect = true).size)
    }
}
