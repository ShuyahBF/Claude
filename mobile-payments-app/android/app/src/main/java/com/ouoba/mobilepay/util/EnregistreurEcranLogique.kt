package com.ouoba.mobilepay.util

import java.io.File

/**
 * Logique PURE de l'enregistrement d'écran de débogage (testée sur l'ordinateur : EnregistreurEcranLogiqueTest). Aucune dépendance Android.
 * Pour un développeur WinDev : ce sont les petits calculs que l'on isole pour les tester sans téléphone.
 */
object EnregistreurEcranLogique {
    /** Durée maximale d'une vidéo (15 minutes, demande du propriétaire du 19/11/2026 ; 10 minutes avant) : au-delà l'enregistrement s'arrête tout seul (fichier léger, partage facile). */
    const val DUREE_MAX_MS = 900_000
    /** Les vidéos non envoyées sont effacées au bout de ce nombre de jours (elles contiennent ce qui était à l'écran). */
    const val JOURS_CONSERVATION = 7

    /**
     * Taille de la vidéo : le grand côté ne dépasse pas `max` pixels (fichier léger), les deux côtés sont PAIRS (exigence de l'encodeur H.264),
     * le rapport largeur / hauteur de l'écran est conservé. Rend (largeur, hauteur).
     */
    fun tailleVideo(largeurEcran: Int, hauteurEcran: Int, max: Int = 1280): Pair<Int, Int> {
        val l = largeurEcran.coerceAtLeast(2)
        val h = hauteurEcran.coerceAtLeast(2)
        val k = if (maxOf(l, h) > max) max.toDouble() / maxOf(l, h) else 1.0
        fun pair(v: Double) = (v.toInt() / 2 * 2).coerceAtLeast(2)
        return pair(l * k) to pair(h * k)
    }

    /** Nom du fichier : « auror-AAAAMMJJ-HHMMSS.mp4 » (date locale), sans caractère spécial. */
    fun nomFichier(prefixe: String, annee: Int, mois: Int, jour: Int, heure: Int, minute: Int, seconde: Int): String =
        "%s-%04d%02d%02d-%02d%02d%02d.mp4".format(prefixe.filter { it.isLetterOrDigit() }.ifEmpty { "ecran" }.lowercase(), annee, mois, jour, heure, minute, seconde)

    /** Fichiers à effacer : ceux dont la dernière modification a plus de `jours` jours. Seuls les « .mp4 » sont concernés. */
    fun aPurger(fichiers: List<File>, maintenantMs: Long, jours: Int = JOURS_CONSERVATION): List<File> =
        fichiers.filter { it.name.endsWith(".mp4") && maintenantMs - it.lastModified() > jours * 86_400_000L }

    /** Une vidéo plus courte que cette durée est inutilisable (l'encodeur n'a rien écrit) : elle est supprimée au lieu d'être partagée. */
    const val DUREE_MIN_MS = 800
}
