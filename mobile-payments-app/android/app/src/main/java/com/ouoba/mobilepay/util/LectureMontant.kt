package com.ouoba.mobilepay.util

import android.content.Context
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject

/**
 * LECTURE OPTIQUE DU MONTANT : l'utilisateur photographie l'afficheur du client, une facture papier ou une facture à l'écran (ou choisit une image),
 * le téléphone lit le texte (ML Kit, SUR LE TÉLÉPHONE : l'image ne quitte jamais l'appareil et n'est pas conservée) et propose les montants trouvés,
 * les plus probables d'abord (« TOTAL », « NET À PAYER »…). L'utilisateur en choisit un ; il lui est de toute façon redemandé de le retaper dans la fenêtre de sécurité.
 *
 * Pour un développeur WinDev : `extraire` est une fonction pure (texte → liste de montants classés), testable sans téléphone ; `reconnaitre` appelle la lecture de texte du système.
 */
object LectureMontant {
    /** Un montant candidat : sa valeur en FCFA, la ligne où il a été lu, et sa vraisemblance (plus grand = plus probable). */
    data class Candidat(val valeur: Long, val ligne: String, val score: Int)

    private const val MIN = 50L                    // en dessous : probablement une quantité, un numéro de ligne…
    private const val MAX = 50_000_000L

    // Nombre avec séparateurs de milliers (espace, point, virgule : 8 000 · 8.000 · 8,000) et décimales facultatives, ou nombre simple de 3 à 7 chiffres.
    // Les nombres collés à « / », « : » ou « - » (dates, heures) sont ignorés.
    private val NOMBRE = Regex("""(?<![\d.,/:\-])(\d{1,3}(?:[   .,]\d{3})+|\d{3,7})(?:[.,]\d{1,2})?(?![\d/:\-])""")
    private val MOT_TOTAL = Regex("""net\s*[àa]\s*payer|total|montant|[àa]\s*payer|reste|solde|ttc|[àa]\s*r[ée]gler""", RegexOption.IGNORE_CASE)
    private val MOT_DEVISE = Regex("""fcfa|f\s?cfa|\bcfa\b|xof|\bf\b""", RegexOption.IGNORE_CASE)
    private val MOT_A_EVITER = Regex("""tva|rendu|monnaie|esp[èe]ces|re[çc]u|remise|acompte|avance|t[ée]l|contact|n°|ref|r[ée]f""", RegexOption.IGNORE_CASE)

    /** Montants trouvés dans un texte lu, du plus probable au moins probable (5 au plus, valeurs distinctes). */
    fun extraire(texte: String): List<Candidat> {
        val trouves = mutableListOf<Candidat>()
        var boostSuivant = 0                                                       // « TOTAL » seul sur une ligne : le montant est sur la ligne suivante
        for (ligne in texte.lines().map { it.trim() }.filter { it.isNotEmpty() }) {
            val nombres = NOMBRE.findAll(ligne).toList()
            var bonus = boostSuivant; boostSuivant = 0
            if (MOT_TOTAL.containsMatchIn(ligne)) { if (nombres.isEmpty()) boostSuivant = 6 else bonus += 6 }
            if (MOT_DEVISE.containsMatchIn(ligne)) bonus += 3
            if (MOT_A_EVITER.containsMatchIn(ligne)) bonus -= 5
            nombres.forEachIndexed { i, m ->
                val valeur = m.groupValues[1].filter { it.isDigit() }.toLongOrNull() ?: return@forEachIndexed
                if (valeur < MIN || valeur > MAX) return@forEachIndexed
                trouves += Candidat(valeur, ligne, 1 + bonus + (if (i == nombres.lastIndex) 2 else 0))
            }
        }
        if (trouves.isEmpty()) return emptyList()
        val plusGrand = trouves.maxOf { it.valeur }                                // sur une facture, le total est le plus grand montant
        return trouves.map { if (it.valeur == plusGrand) it.copy(score = it.score + 1) else it }
            .groupBy { it.valeur }.map { (_, l) -> l.maxByOrNull { it.score }!! }
            .sortedWith(compareByDescending<Candidat> { it.score }.thenByDescending { it.valeur }).take(5)
    }

    /** « 8 000 » (espace insécable fin entre les milliers). */
    fun libelle(valeur: Long): String = "%,d".format(valeur).replace(',', ' ')

    /** Résultat rendu au site : { montants: [{valeur, texte, ligne}] } ou { erreur }. */
    fun enJson(candidats: List<Candidat>): JSONObject =
        if (candidats.isEmpty()) JSONObject().put("erreur", "Aucun montant lisible sur l'image. Cadrez de plus près, avec plus de lumière, ou tapez le montant.")
        else JSONObject().put("montants", JSONArray(candidats.map { JSONObject().put("valeur", it.valeur).put("texte", libelle(it.valeur) + " FCFA").put("ligne", it.ligne) }))

    /** Lit le texte de l'image (sur le téléphone) puis rend les montants à `surFin`. */
    fun reconnaitre(c: Context, image: Uri, surFin: (JSONObject) -> Unit) {
        try {
            TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(InputImage.fromFilePath(c, image))
                .addOnSuccessListener { surFin(enJson(extraire(it.text))) }
                .addOnFailureListener { surFin(JSONObject().put("erreur", "Lecture de l'image impossible : " + (it.message ?: "erreur"))) }
        } catch (e: Exception) { surFin(JSONObject().put("erreur", "Image illisible : " + (e.message ?: "erreur"))) }
    }
}
