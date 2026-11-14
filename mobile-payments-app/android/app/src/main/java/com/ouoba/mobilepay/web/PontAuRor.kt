package com.ouoba.mobilepay.web

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.pm.PackageManager
import android.text.InputType
import android.webkit.JavascriptInterface
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.ouoba.mobilepay.BuildConfig
import com.ouoba.mobilepay.util.UssdDirect
import com.ouoba.mobilepay.util.openDialerWithUssd
import org.json.JSONArray
import org.json.JSONObject

/**
 * PONT ENTRE LE SITE auRor ET LE TÉLÉPHONE (objet « window.AuRorAndroid » vu par le site).
 *
 * Pour un développeur WinDev : c'est la « DLL » que le site peut appeler. Chaque fonction annotée @JavascriptInterface est appelable par le site ;
 * les réponses asynchrones sont renvoyées au site en appelant window.auRorRetour[numéro](json) (voir lib/pontAndroid.js du site).
 *
 * Sécurité :
 *  - le pont n'est accessible qu'aux pages d'auRor : WebActivity refuse de charger toute autre adresse dans la fenêtre intégrée ;
 *  - le paiement direct passe TOUJOURS par une fenêtre de confirmation native (le site ne peut pas envoyer un code en silence) ;
 *  - le code secret (le mot PIN dans le code) est saisi dans une fenêtre native masquée : il ne passe jamais par le site et n'est jamais enregistré ;
 *  - paiement direct et lecture des SMS n'existent que dans la version « direct » (autorisations absentes de la version du Play Store).
 */
class PontAuRor(private val activite: WebActivity) {

    private val contexte: Context get() = activite

    /** Ce que cette version de l'application sait faire. */
    @JavascriptInterface
    fun capacites(): String = JSONObject().put("application", true).put("version", BuildConfig.VERSION_NAME)
        .put("direct", BuildConfig.MODE_DIRECT).put("sms", BuildConfig.MODE_DIRECT).toString()

    /** Ouvre le composeur avec le code pré-rempli (aucune autorisation) : l'utilisateur appuie lui-même sur « Appeler ». */
    @JavascriptInterface
    fun composer(code: String) {
        activite.runOnUiThread { openDialerWithUssd(contexte, code) }
    }

    /** Page « Pas de connexion » : bouton « Réessayer ». */
    @JavascriptInterface
    fun reessayer() { activite.runOnUiThread { activite.recharger() } }

    /**
     * Paiement direct : fenêtre de confirmation (résumé), saisie masquée du code secret si le code contient le mot PIN, puis envoi du code USSD.
     * Rend au site {texte} (réponse de l'opérateur) ou {erreur}.
     */
    @JavascriptInterface
    fun payerDirect(id: String, operateur: String, code: String, resume: String) {
        activite.runOnUiThread {
            if (!UssdDirect.disponible()) { activite.retour(id, JSONObject().put("erreur", "Le paiement direct n'est pas disponible dans cette version de l'application.")); return@runOnUiThread }
            val demandePin = Regex("PIN").containsMatchIn(code)
            val colonne = LinearLayout(contexte).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 24, 48, 0) }
            colonne.addView(TextView(contexte).apply { text = resume + "\n\nVérifiez le montant et le bénéficiaire : un paiement envoyé ne peut pas être annulé par l'application." })
            val champPin = EditText(contexte).apply { hint = "Code secret Mobile Money"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD }
            if (demandePin) colonne.addView(champPin)
            AlertDialog.Builder(contexte).setTitle("Envoyer ce paiement ?").setView(colonne)
                .setPositiveButton("✔ Envoyer") { _, _ ->
                    val pin = champPin.text.toString()
                    if (demandePin && pin.length < 4) { activite.retour(id, JSONObject().put("erreur", "Code secret manquant : paiement non envoyé.")); return@setPositiveButton }
                    val aEnvoyer = if (demandePin) code.replace("PIN", pin) else code
                    champPin.setText("")                                                // le code secret ne reste nulle part
                    activite.demanderAutorisations(arrayOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE)) { ok ->
                        if (!UssdDirect.autorise(contexte)) { activite.retour(id, JSONObject().put("erreur", "Autorisation « Appels » refusée : utilisez « Composer sur ce téléphone ».")); return@demanderAutorisations }
                        UssdDirect.envoyer(contexte, operateur, aEnvoyer) { r ->
                            activite.retour(id, if (r.texte != null) JSONObject().put("texte", r.texte) else JSONObject().put("erreur", r.erreur ?: "Échec de l'envoi."))
                        }
                    }
                }
                .setNegativeButton("✖ Annuler") { _, _ -> activite.retour(id, JSONObject().put("erreur", "Paiement annulé : rien n'a été envoyé.")) }
                .setOnCancelListener { activite.retour(id, JSONObject().put("erreur", "Paiement annulé : rien n'a été envoyé.")) }
                .show()
        }
    }

    /**
     * Lecture des SMS de paiement reçus ces derniers jours (version « direct » seulement). Rend au site {sms:[{adresse, recu_le, corps}]} ou {erreur}.
     * Seuls les SMS qui contiennent un montant en FCFA sont rendus ; rien n'est enregistré ni envoyé.
     */
    @JavascriptInterface
    fun lireSmsPaiements(id: String, jours: Int) {
        activite.runOnUiThread {
            if (!BuildConfig.MODE_DIRECT) { activite.retour(id, JSONObject().put("erreur", "La lecture des SMS n'est pas disponible dans cette version de l'application.")); return@runOnUiThread }
            activite.demanderAutorisations(arrayOf(Manifest.permission.READ_SMS)) { _ ->
                if (contexte.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                    activite.retour(id, JSONObject().put("erreur", "Autorisation « SMS » refusée. Si Android la grise : Réglages → Applications → auRor direct → ⋮ → « Autoriser les paramètres restreints »."))
                    return@demanderAutorisations
                }
                Thread {
                    val resultat = try { JSONObject().put("sms", SmsPaiements.lire(contexte, jours.coerceIn(1, 3650))) }
                    catch (e: Exception) { JSONObject().put("erreur", "Lecture des SMS impossible : " + (e.message ?: e.javaClass.simpleName)) }
                    activite.runOnUiThread { activite.retour(id, resultat) }
                }.start()
            }
        }
    }
}

/** Lecture de la boîte de réception (version « direct » seulement). */
object SmsPaiements {
    private val MONTANT = Regex("\\b(?:fcfa|f\\s?cfa|xof|cfa)\\b", RegexOption.IGNORE_CASE)

    /** SMS reçus depuis `jours` jours qui contiennent un montant en francs CFA, du plus récent au plus ancien (1000 au plus). */
    fun lire(c: Context, jours: Int): JSONArray {
        val depuis = System.currentTimeMillis() - jours * 86_400_000L
        val sortie = JSONArray()
        c.contentResolver.query(android.net.Uri.parse("content://sms/inbox"), arrayOf("address", "date", "body"), "date >= ?", arrayOf(depuis.toString()), "date DESC")?.use { q ->
            while (q.moveToNext() && sortie.length() < 1000) {
                val corps = q.getString(2).orEmpty()
                if (MONTANT.containsMatchIn(corps)) sortie.put(JSONObject().put("adresse", q.getString(0).orEmpty()).put("recu_le", q.getLong(1)).put("corps", corps))
            }
        }
        return sortie
    }
}
