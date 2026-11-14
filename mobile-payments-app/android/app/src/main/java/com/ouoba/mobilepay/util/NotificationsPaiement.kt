package com.ouoba.mobilepay.util

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * LECTURE DES NOTIFICATIONS DE PAIEMENT, MÊME APPLICATION FERMÉE (comme Concentration).
 *
 * Pour un développeur WinDev : un « écouteur de notifications » est un service que le téléphone réveille à chaque notification affichée, que l'application soit ouverte ou non.
 * Celui-ci ne retient QUE les notifications qui contiennent un montant en francs CFA (SMS d'opérateur, application d'opérateur). Leur texte est mis en attente dans un petit
 * fichier privé du téléphone ; à l'ouverture d'auRor, le site les récupère (une seule fois : le fichier est alors vidé), en fait des lignes de paiement, puis les oublie.
 * Rien n'est envoyé ailleurs. À activer UNE fois par l'utilisateur : Réglages → Notifications → Accès aux notifications → auRor direct.
 */
object NotificationsPaiement {
    private const val MAX = 300
    private val MONTANT = Regex("\\b(?:fcfa|f\\s?cfa|xof|cfa)\\b", RegexOption.IGNORE_CASE)
    private fun fichier(c: Context) = File(c.filesDir, "notifications_attente.json")

    /** Vrai si l'utilisateur a activé l'accès aux notifications pour cette application. */
    fun actif(c: Context): Boolean = Settings.Secure.getString(c.contentResolver, "enabled_notification_listeners").orEmpty()
        .split(':').any { ComponentName.unflattenFromString(it)?.packageName == c.packageName }

    /** Met en attente une notification SI elle contient un montant en FCFA. */
    @Synchronized
    fun ajouter(c: Context, titre: String, texte: String, quand: Long) {
        if (!MONTANT.containsMatchIn("$titre $texte")) return
        try {
            val f = fichier(c)
            val liste = if (f.exists()) JSONArray(f.readText()) else JSONArray()
            // Même notification reçue deux fois (mise à jour d'une notification) : gardée une seule fois
            for (i in 0 until liste.length()) { val o = liste.getJSONObject(i); if (o.optString("corps") == texte && o.optString("adresse") == titre && Math.abs(o.optLong("recu_le") - quand) < 60_000) return }
            liste.put(JSONObject().put("adresse", titre).put("recu_le", quand).put("corps", texte))
            val garde = JSONArray(); val debut = maxOf(0, liste.length() - MAX)
            for (i in debut until liste.length()) garde.put(liste.get(i))
            f.writeText(garde.toString())
        } catch (_: Exception) { /* jamais bloquant */ }
    }

    /** Rend les notifications en attente (tableau JSON) ET vide le fichier : le site les garde sous forme de lignes de paiement. */
    @Synchronized
    fun retirer(c: Context): String = try {
        val f = fichier(c)
        val t = if (f.exists()) f.readText() else "[]"
        f.delete()
        t
    } catch (_: Exception) { "[]" }
}

/** Le service d'écoute (déclaré dans le manifeste de la version « direct » seulement). */
class EcouteNotificationsPaiement : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            if (sbn.packageName == packageName) return
            val n = sbn.notification
            if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
            val x = n.extras ?: return
            val titre = x.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
            val texte = (x.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: x.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
            NotificationsPaiement.ajouter(this, titre, texte, n.`when`.takeIf { it > 0 } ?: sbn.postTime)
        } catch (_: Exception) { /* jamais bloquant */ }
    }
}
