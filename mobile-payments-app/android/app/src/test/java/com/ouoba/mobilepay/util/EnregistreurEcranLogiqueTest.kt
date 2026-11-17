package com.ouoba.mobilepay.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Tests de la logique de l'enregistrement d'écran de débogage (sans téléphone). */
class EnregistreurEcranLogiqueTest {
    @Test fun tailleReduiteEtPaire() {
        val (l, h) = EnregistreurEcranLogique.tailleVideo(1080, 2400)
        assertEquals(1280, h)                                        // le grand côté est ramené à 1280
        assertTrue(l % 2 == 0 && l in 570..580)                      // rapport conservé (1080 / 2400 × 1280 ≈ 576), largeur paire
    }

    @Test fun petitEcranNonAgrandi() {
        assertEquals(720 to 1280, EnregistreurEcranLogique.tailleVideo(720, 1280))
        assertEquals(480 to 800, EnregistreurEcranLogique.tailleVideo(481, 801))     // côtés impairs ramenés à des nombres pairs
    }

    @Test fun tailleJamaisNulle() {
        val (l, h) = EnregistreurEcranLogique.tailleVideo(0, -5)
        assertTrue(l >= 2 && h >= 2 && l % 2 == 0 && h % 2 == 0)
    }

    @Test fun nomDuFichier() {
        assertEquals("auror-20261117-194805.mp4", EnregistreurEcranLogique.nomFichier("auRor", 2026, 11, 17, 19, 48, 5))
        assertEquals("ecran-20260105-000000.mp4", EnregistreurEcranLogique.nomFichier("../..", 2026, 1, 5, 0, 0, 0))       // jamais de caractère de chemin dans le nom
    }

    @Test fun purgeDesVieillesVideosSeulement() {
        val maintenant = 1_800_000_000_000L
        fun f(nom: String, ageJours: Int) = File.createTempFile("auror-test", nom).apply { setLastModified(maintenant - ageJours * 86_400_000L); deleteOnExit() }
        val ancienne = f(".mp4", 8); val recente = f(".mp4", 2); val autre = f(".txt", 30)
        val aSupprimer = EnregistreurEcranLogique.aPurger(listOf(ancienne, recente, autre), maintenant)
        assertEquals(listOf(ancienne), aSupprimer)
    }
}
