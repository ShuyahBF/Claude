package com.ouoba.mobilepay.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import com.ouoba.mobilepay.BuildConfig

/**
 * ENVOI DIRECT DU CODE USSD (lot 17, option « paiement direct »).
 *
 * Disponible UNIQUEMENT dans la version compilée avec -PmodeDirect=true (APK installé à la main) : la version du Play Store garde le composeur
 * (aucune autorisation sensible). Pour un développeur WinDev :
 *  - `sendUssdRequest` envoie le code sur le réseau téléphonique (pas par Internet) et rend le TEXTE de la réponse de l'opérateur ; aucune fenêtre ne s'ouvre ;
 *  - UN SEUL échange : si l'opérateur répond par un menu ou demande le code secret dans un second écran, l'application ne peut pas poursuivre.
 *    C'est pourquoi un service « direct » doit avoir un gabarit COMPLET (ex. *144*10*{code}*{amount}*{pin}#) — voir ResumePaiement.CLE_PIN ;
 *  - rien n'est enregistré : ni le code envoyé, ni le code secret, ni la réponse ; l'application n'a pas d'historique de paiements.
 */
object UssdDirect {
    /** Réponse de l'opérateur (texte) ou motif de l'échec. */
    data class Reponse(val texte: String?, val erreur: String?)

    /** Vrai si cette version sait envoyer le code elle-même (option compilée ET Android 8 minimum). */
    fun disponible() = BuildConfig.MODE_DIRECT && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    fun autorise(c: Context) = c.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED

    /** Identifiant de la carte SIM dont le nom contient celui de l'opérateur (« Orange BF » pour « Orange ») ; null = carte par défaut du téléphone. */
    private fun carteDe(c: Context, operateur: String): Int? {
        if (c.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return null
        return try {
            val jeton = operateur.trim().lowercase().split(' ', '-').firstOrNull { it.length >= 3 } ?: return null
            c.getSystemService(SubscriptionManager::class.java).activeSubscriptionInfoList.orEmpty()
                .firstOrNull { (it.carrierName?.toString().orEmpty().lowercase()).contains(jeton) }?.subscriptionId
        } catch (e: SecurityException) { null }
    }

    /**
     * Message d'un échec d'envoi, AVEC le code d'échec du système (pour savoir quoi corriger) :
     *  -1 (USSD_RETURN_FAILURE) : l'opérateur n'a pas exécuté le code — séquence refusée, ou code secret incorrect, ou menu qui attend une réponse ;
     *  -2 (USSD_ERROR_SERVICE_UNAVAIL) : service USSD indisponible sur cette carte (réseau, carte SIM, mode avion).
     * Le code envoyé et le code secret ne sont JAMAIS repris dans le message.
     */
    fun messageEchec(codeEchec: Int): String = when (codeEchec) {
        TelephonyManager.USSD_ERROR_SERVICE_UNAVAIL -> "Service USSD indisponible sur cette carte (code d'échec $codeEchec) : vérifiez le réseau et la carte SIM. Aucun paiement n'a été confirmé."
        else -> "L'opérateur a refusé ou n'a pas compris le code (code d'échec $codeEchec). Causes possibles : code secret incorrect, ou séquence que l'opérateur n'accepte pas " +
            "(à corriger dans le gabarit du service d'auRor). Aucun paiement n'a été confirmé."
    }

    /** Envoie le code (délai maximal 45 s) et rend la réponse au thread principal. Ne garde aucune trace du code. */
    fun envoyer(c: Context, operateur: String, code: String, surFin: (Reponse) -> Unit) {
        val principal = Handler(Looper.getMainLooper())
        var fini = false
        fun terminer(r: Reponse) { if (!fini) { fini = true; principal.removeCallbacksAndMessages(null); surFin(r) } }
        if (!disponible()) { terminer(Reponse(null, "Le paiement direct n'est pas disponible dans cette version.")); return }
        if (!autorise(c)) { terminer(Reponse(null, "Autorisation « Appels » non accordée.")); return }
        principal.postDelayed({ terminer(Reponse(null, "Pas de réponse de l'opérateur (délai dépassé). Vérifiez votre solde ou votre historique avant de réessayer.")) }, 45_000)
        try {
            val base = c.getSystemService(TelephonyManager::class.java)
            val tm = carteDe(c, operateur)?.let { base.createForSubscriptionId(it) } ?: base
            tm.sendUssdRequest(code.trim(), object : TelephonyManager.UssdResponseCallback() {
                override fun onReceiveUssdResponse(telephonyManager: TelephonyManager, request: String, response: CharSequence) = terminer(Reponse(response.toString(), null))
                override fun onReceiveUssdResponseFailed(telephonyManager: TelephonyManager, request: String, failureCode: Int) =
                    terminer(Reponse(null, messageEchec(failureCode)))
            }, principal)
        } catch (e: SecurityException) { terminer(Reponse(null, "Autorisation refusée par le téléphone."))
        } catch (e: Exception) { terminer(Reponse(null, "Envoi impossible : " + (e.message ?: e.javaClass.simpleName))) }
    }
}
