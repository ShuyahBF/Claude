package com.ouoba.mobilepay.web

import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * VÉRIFICATION D'UNE NOUVELLE VERSION DANS SHUYAHSTORE (v1.57).
 *
 * Au lancement (et au plus toutes les 6 heures), l'application demande à ShuyahStore la version PUBLIÉE de son propre paquet
 * (« GET /api/apps/<paquet> », page publique : aucun compte, aucun secret) et la compare à la version installée.
 *  - Vie privée : on ne lit que la version publiée ; RIEN du téléphone ni de l'utilisateur n'est envoyé.
 *  - Une version « en attente de validation » n'est pas publiée : elle n'est donc pas annoncée.
 *  - Réseau absent ou serveur lent : aucune erreur affichée, on réessaiera plus tard (jamais bloquant).
 *  - « Plus tard » mémorise la version ignorée : le bandeau ne revient que pour une version encore plus récente.
 * Ce fichier est identique dans toutes les applications de ShuyahStore (seul le paquet, lu sur le téléphone, change).
 */
object MiseAJourStore {
    /** Adresse de l'API de ShuyahStore. */
    private const val API = "https://api.shuyahstore.store/api"
    private const val SITE = "https://shuyahstore.store"
    private const val PAQUET_STORE = "com.shuyah.store"
    private const val DELAI_ENTRE_VERIFICATIONS_MS = 6 * 60 * 60 * 1000L

    /** Une version plus récente que celle installée. */
    data class Nouvelle(val code: Long, val nom: String)

    private fun prefs(c: Context) = c.getSharedPreferences("mise_a_jour_store", Context.MODE_PRIVATE)

    // ---------------- Logique pure (testée) ----------------

    /** Lit la réponse de « GET /apps/<paquet> » : la plus grande version PUBLIÉE (code, nom), ou null si aucune. */
    fun lireVersionPubliee(json: String): Nouvelle? {
        val versions = JSONObject(json).optJSONArray("versions") ?: return null
        var meilleure: Nouvelle? = null
        for (i in 0 until versions.length()) {
            val v = versions.optJSONObject(i) ?: continue
            if (v.optString("statut", "publiee") != "publiee") continue        // les versions archivées ne comptent pas
            val code = v.optLong("version_code", 0L)
            if (code > (meilleure?.code ?: 0L)) meilleure = Nouvelle(code, v.optString("version_nom", code.toString()))
        }
        return meilleure
    }

    /** Vrai si la version publiée est PLUS RÉCENTE que l'installée ET n'a pas déjà été écartée par « Plus tard ». */
    fun aAnnoncer(publiee: Nouvelle?, codeInstalle: Long, codeIgnore: Long): Boolean =
        publiee != null && publiee.code > codeInstalle && publiee.code > codeIgnore

    // ---------------- Accès réseau et mémoire ----------------

    /** Code de version installé sur ce téléphone (versionCode). */
    @Suppress("DEPRECATION")
    fun codeInstalle(c: Context): Long = try {
        val i = c.packageManager.getPackageInfo(c.packageName, 0)
        if (android.os.Build.VERSION.SDK_INT >= 28) i.longVersionCode else i.versionCode.toLong()
    } catch (e: Exception) { 0L }

    /**
     * Interroge ShuyahStore (au plus toutes les 6 h, sauf [forcer]) et renvoie la nouvelle version à annoncer, ou null.
     * À appeler depuis un fil d'arrière-plan (jamais sur le fil de l'écran) : voir [verifierEnArrierePlan].
     */
    fun verifierBloquant(c: Context, forcer: Boolean = false): Nouvelle? = run {
        if (!com.ouoba.mobilepay.BuildConfig.MODE_DIRECT) return@run null          // version Play Store : aucune vérification ShuyahStore
        val p = prefs(c)
        val installe = codeInstalle(c)
        val maintenant = System.currentTimeMillis()
        // Dernière réponse gardée : évite d'interroger le serveur à chaque ouverture
        if (!forcer && maintenant - p.getLong("derniere_verif", 0L) < DELAI_ENTRE_VERIFICATIONS_MS) {
            val code = p.getLong("publiee_code", 0L)
            return@run Nouvelle(code, p.getString("publiee_nom", "") ?: "").takeIf { aAnnoncer(it, installe, p.getLong("ignoree", 0L)) }
        }
        try {
            val cx = URL("$API/apps/${c.packageName}").openConnection() as HttpURLConnection
            cx.connectTimeout = 8_000; cx.readTimeout = 8_000
            cx.setRequestProperty("Accept", "application/json")
            if (cx.responseCode != 200) { cx.disconnect(); return@run null }
            val corps = cx.inputStream.bufferedReader().use { it.readText() }
            cx.disconnect()
            val publiee = lireVersionPubliee(corps) ?: return@run null
            p.edit().putLong("derniere_verif", maintenant).putLong("publiee_code", publiee.code).putString("publiee_nom", publiee.nom).apply()
            publiee.takeIf { aAnnoncer(it, installe, p.getLong("ignoree", 0L)) }
        } catch (e: Exception) { null }                                          // hors connexion : silence, nouvel essai plus tard
    }

    /** Lance la vérification sur un fil à part et rend le résultat (ou null) sur le fil de l'écran. */
    fun verifierEnArrierePlan(c: Context, forcer: Boolean = false, resultat: (Nouvelle?) -> Unit) {
        val ecran = android.os.Handler(android.os.Looper.getMainLooper())
        Thread { val n = try { verifierBloquant(c, forcer) } catch (e: Exception) { null }; ecran.post { resultat(n) } }.start()
    }

    /** « Plus tard » : cette version (et les plus anciennes) ne sera plus annoncée. */
    fun ignorer(c: Context, code: Long) { prefs(c).edit().putLong("ignoree", code).apply() }

    /**
     * « Mettre à jour » : ouvre l'application ShuyahStore sur « Mes applications » (liste des mises à jour avec « Mettre à jour »)
     * ou, si elle n'est pas installée, la fiche de cette application sur le site de ShuyahStore.
     * Android demande toujours confirmation avant d'installer : rien ne s'installe en silence.
     */
    fun ouvrirStore(c: Context) {
        val store = try { c.packageManager.getLaunchIntentForPackage(PAQUET_STORE) } catch (e: Exception) { null }
        val intention = store?.putExtra("ouvrir", "mes-applications")?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ?: Intent(Intent.ACTION_VIEW, Uri.parse("$SITE/app/${c.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { c.startActivity(intention) } catch (e: Exception) { android.widget.Toast.makeText(c, "Impossible d'ouvrir ShuyahStore.", android.widget.Toast.LENGTH_LONG).show() }
    }
}
