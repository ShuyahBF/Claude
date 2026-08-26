package com.ouoba.mobilepay.util

import android.content.Context
import android.content.Intent
import android.net.Uri

/** Construit le code USSD final en remplaçant les placeholders {cle} par les valeurs saisies. */
fun buildUssdCode(template: String, values: Map<String, String>): String {
    var result = template
    values.forEach { (key, value) -> result = result.replace("{$key}", value) }
    return result
}

/**
 * Ouvre le composeur téléphonique avec le code USSD pré-rempli.
 * N'exige aucune permission dangereuse : l'utilisateur doit appuyer sur "Appeler".
 */
fun openDialerWithUssd(context: Context, ussdCode: String) {
    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(ussdCode)}"))
    context.startActivity(intent)
}

/**
 * Compose directement le code USSD sans passer par le clavier.
 * Nécessite la permission CALL_PHONE, à demander à l'exécution avant l'appel.
 */
@Suppress("MissingPermission")
fun callUssdDirectly(context: Context, ussdCode: String) {
    val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:${Uri.encode(ussdCode)}"))
    context.startActivity(intent)
}
