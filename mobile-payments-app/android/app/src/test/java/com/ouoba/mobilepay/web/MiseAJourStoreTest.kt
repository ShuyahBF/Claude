package com.ouoba.mobilepay.web

import org.junit.Assert.*
import org.junit.Test

/** Logique pure de la vérification de nouvelle version (sans réseau). */
class MiseAJourStoreTest {
    private val reponse = """{"app":{},"versions":[
        {"version_code":57,"version_nom":"1.56","statut":"publiee"},
        {"version_code":58,"version_nom":"1.57","statut":"publiee"},
        {"version_code":59,"version_nom":"1.58","statut":"en_attente"},
        {"version_code":50,"version_nom":"1.50","statut":"archivee"}]}"""

    @Test fun `la plus grande version publiee est retenue, pas celle en attente`() {
        val v = MiseAJourStore.lireVersionPubliee(reponse)
        assertEquals(58L, v?.code); assertEquals("1.57", v?.nom)
    }

    @Test fun `aucune version publiee donne null`() {
        assertNull(MiseAJourStore.lireVersionPubliee("""{"versions":[]}"""))
        assertNull(MiseAJourStore.lireVersionPubliee("""{"versions":[{"version_code":9,"statut":"en_attente"}]}"""))
    }

    @Test fun `annonce seulement si plus recente et non ecartee`() {
        val v = MiseAJourStore.Nouvelle(58, "1.57")
        assertTrue(MiseAJourStore.aAnnoncer(v, 57, 0))
        assertFalse(MiseAJourStore.aAnnoncer(v, 58, 0))      // déjà à jour
        assertFalse(MiseAJourStore.aAnnoncer(v, 57, 58))     // « Plus tard » déjà choisi pour cette version
        assertTrue(MiseAJourStore.aAnnoncer(MiseAJourStore.Nouvelle(59, "1.58"), 57, 58))   // une version encore plus récente revient
        assertFalse(MiseAJourStore.aAnnoncer(null, 57, 0))
    }
}
