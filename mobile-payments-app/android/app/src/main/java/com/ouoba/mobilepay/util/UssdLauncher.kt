package com.ouoba.mobilepay.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/** Adresse publique de la politique de confidentialité (site web, lot 16). */
const val URL_CONFIDENTIALITE = "https://paiement-mobile-site.onrender.com/confidentialite"

/** Construit le code USSD final en remplaçant les placeholders {cle} par les valeurs saisies. */
fun buildUssdCode(template: String, values: Map<String, String>): String {
    var result = template
    values.forEach { (key, value) -> result = result.replace("{$key}", value) }
    return result
}

/**
 * Construit l'adresse « tel: » du composeur à partir du code USSD.
 * Uri.encode garde « * » et les chiffres tels quels mais transforme « # » en « %23 » :
 * sans cet encodage, tout ce qui suit le « # » serait pris pour une ancre de lien et
 * perdu (le composeur afficherait par ex. « *144*2 » au lieu de « *144*2*1# »).
 */
fun telUriPourUssd(ussdCode: String): Uri = Uri.parse("tel:${Uri.encode(ussdCode)}")

/**
 * Ouvre le composeur téléphonique avec le code USSD pré-rempli (ACTION_DIAL).
 * N'exige AUCUNE permission : c'est l'utilisateur qui appuie lui-même sur « Appeler ».
 * Depuis le lot 16, c'est le seul mode proposé (plus d'appel direct ni de permission CALL_PHONE).
 */
fun openDialerWithUssd(context: Context, ussdCode: String) {
    val intent = Intent(Intent.ACTION_DIAL, telUriPourUssd(ussdCode))
    try {
        context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        // Tablette sans téléphonie : aucun composeur disponible
        Toast.makeText(context, "Aucune application de téléphone sur cet appareil.", Toast.LENGTH_LONG).show()
    }
}

/** Ouvre une page web dans le navigateur (ex. la politique de confidentialité). */
fun ouvrirDansNavigateur(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "Aucun navigateur disponible. Adresse : $url", Toast.LENGTH_LONG).show()
    }
}
