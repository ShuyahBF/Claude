package com.ouoba.mobilepay.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tests de la lecture du montant (sans téléphone) : textes types d'un afficheur client et de factures. */
class LectureMontantTest {
    private fun valeurs(t: String) = LectureMontant.extraire(t).map { it.valeur }

    @Test fun afficheurClientSimple() {
        assertEquals(listOf(8000L), valeurs("8000 FCFA"))
        assertEquals(listOf(12500L), valeurs("TOTAL 12 500 F"))
    }

    @Test fun separateursDeMilliersEtDecimales() {
        assertEquals(8000L, valeurs("Montant : 8.000").first())
        assertEquals(8000L, valeurs("Montant : 8,000").first())
        assertEquals(12500L, valeurs("NET A PAYER 12 500,00").first())
    }

    @Test fun leTotalPasseAvantLesLignesEtLaTva() {
        val facture = """
            Riz 25kg      15 000
            Huile 5L       6 500
            TVA 18%        3 330
            TOTAL TTC     21 500 FCFA
            Especes       25 000
            Rendu          3 500
        """.trimIndent()
        assertEquals(21500L, valeurs(facture).first())
    }

    @Test fun totalSurUneLigneEtMontantSurLaSuivante() {
        assertEquals(9750L, valeurs("Pharmacie\nNET A PAYER\n9 750\nMerci").first())
    }

    @Test fun datesHeuresTelephonesEtPetitesValeursIgnores() {
        val texte = "15/11/2026 11:59\nTel 70123456\nQte 2\nTOTAL 4 700"
        assertEquals(listOf(4700L), valeurs(texte))
    }

    @Test fun rienDeLisibleRendUneListeVide() {
        assertTrue(valeurs("Merci de votre visite").isEmpty())
    }

    @Test fun valeursDistinctesEtCinqAuPlus() {
        val l = LectureMontant.extraire((1..9).joinToString("\n") { "Article ${it * 1000 + 100}" } + "\nTOTAL 5 000\nTOTAL 5 000")
        assertTrue(l.size <= 5 && l.map { it.valeur }.toSet().size == l.size)
    }

    @Test fun libelleMillier() { assertEquals("12 500", LectureMontant.libelle(12500)) }
}
