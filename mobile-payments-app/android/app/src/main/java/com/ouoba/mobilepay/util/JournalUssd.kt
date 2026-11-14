package com.ouoba.mobilepay.util

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * JOURNAL DES ENVOIS USSD (sur le téléphone, jamais envoyé ailleurs).
 *
 * Garde, ligne par ligne et avec l'heure : le code composé, les textes des fenêtres de l'opérateur, la réponse exacte et les échecs (avec leur code).
 * Il sert à comprendre un paiement qui ne passe pas, sans deviner. Le CODE SECRET n'y figure JAMAIS : il est toujours remplacé par ****.
 * Le fichier (journal_ussd.txt, dossier privé de l'application) est limité à 20 Ko : les lignes les plus anciennes disparaissent.
 */
object JournalUssd {
    private const val MAX = 20_000
    private fun fichier(c: Context) = File(c.filesDir, "journal_ussd.txt")

    /** Ajoute une ligne horodatée. `secret` (si fourni) est masqué partout dans la ligne. */
    @Synchronized
    fun ajouter(c: Context, ligne: String, secret: String? = null) {
        try {
            val propre = if (!secret.isNullOrEmpty()) ligne.replace(secret, "****") else ligne
            val f = fichier(c)
            var texte = (if (f.exists()) f.readText() else "") + SimpleDateFormat("dd/MM HH:mm:ss", Locale.FRANCE).format(Date()) + "  " + propre + "\n"
            if (texte.length > MAX) texte = texte.takeLast(MAX).substringAfter('\n')
            f.writeText(texte)
        } catch (_: Exception) { /* le journal ne doit jamais bloquer un paiement */ }
    }

    /** Les dernières lignes du journal (les plus récentes en bas). */
    @Synchronized
    fun lire(c: Context, lignes: Int = 40): String = try { fichier(c).takeIf { it.exists() }?.readLines()?.takeLast(lignes)?.joinToString("\n") ?: "" } catch (_: Exception) { "" }
}
