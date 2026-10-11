package com.ouoba.mobilepay.data.remote

import android.content.Context
import android.os.Build
import com.ouoba.mobilepay.BuildConfig
import com.ouoba.mobilepay.util.isOnline
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Signal de présence auprès de SAWALI (règle 4 du propriétaire, lot 13).
 *
 * Toute application que nous déployons déclare sa présence à SAWALI :
 *   POST https://api.sawalismartsystems.com/api/presence-logiciel
 * au lancement, puis au plus toutes les 5 minutes (ici : à chaque retour de l'app au premier plan,
 * si le dernier signal date de plus de 5 minutes — pas d'envoi tant que l'app est fermée, pour
 * ménager la batterie et le forfait de l'utilisateur).
 *
 * Principes :
 *  - envoi en arrière-plan (file d'attente d'OkHttp), JAMAIS bloquant ; toute erreur est ignorée ;
 *  - aucun secret ni donnée personnelle : ni nom, ni téléphone, seulement le modèle de l'appareil.
 *
 * Pour un développeur WinDev : c'est l'équivalent de la procédure « SignalPresenceSawali »
 * appelée par un « TimerSys », avec un envoi HTTP lancé dans un thread séparé.
 */
object PresenceSawali {

    private const val URL_PRESENCE = "https://api.sawalismartsystems.com/api/presence-logiciel"
    private const val APPLICATION = "paiement-mobile-android"
    private const val SITE = "paiement-mobile"
    private const val INTERVALLE_MS = 5 * 60 * 1000L

    // Heure du dernier envoi (0 = jamais) ; @Volatile car lue/écrite depuis plusieurs threads
    @Volatile
    private var dernierEnvoiMs = 0L

    // Heure de démarrage du processus de l'app (premier accès à cet objet), au format ISO UTC
    private val demarreLe: String = isoUtc(Date())

    // Client HTTP dédié, avec des délais courts : un signal raté n'a aucune conséquence
    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()
    }

    /** Envoie un signal si le dernier date de plus de 5 minutes. Rend la main immédiatement. */
    fun signaler(context: Context) {
        val maintenant = System.currentTimeMillis()
        if (maintenant - dernierEnvoiMs < INTERVALLE_MS) return
        runCatching {
            if (!isOnline(context)) return
            dernierEnvoiMs = maintenant
            val corps = JSONObject().apply {
                put("application", APPLICATION)
                put("version", BuildConfig.VERSION_NAME)
                put("deploye_le", BuildConfig.DATE_BUILD)
                put("machine", "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(100))
                put("site", SITE)
                put("systeme", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
                put("demarre_le", demarreLe)
            }
            val requete = Request.Builder()
                .url(URL_PRESENCE)
                .post(corps.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
            // enqueue = envoi asynchrone : le thread de l'interface n'attend jamais la réponse
            client.newCall(requete).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    // Réseau coupé, SAWALI injoignable… : ignoré (nouvel essai au prochain retour au premier plan)
                    dernierEnvoiMs = 0L
                }

                override fun onResponse(call: Call, response: Response) {
                    response.close() // le contenu de la réponse ne nous intéresse pas
                }
            })
        }
    }

    /** Date au format ISO 8601 UTC, ex. « 2026-10-11T08:00:00Z » (compatible Android 7, sans java.time). */
    private fun isoUtc(date: Date): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(date)
}
