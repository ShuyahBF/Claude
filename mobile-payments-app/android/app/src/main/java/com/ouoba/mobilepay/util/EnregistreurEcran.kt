package com.ouoba.mobilepay.util

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.content.FileProvider
import com.ouoba.mobilepay.R
import java.io.File
import java.util.Calendar

/**
 * ENREGISTREMENT D'ÉCRAN DE DÉBOGAGE (version « direct » seulement, demande du propriétaire du 17/11/2026) : une petite icône discrète de l'application lance
 * l'enregistrement VIDÉO de tout l'écran (page de connexion comprise). La vidéo reste sur le téléphone ; l'utilisateur la partage lui-même (WhatsApp, e-mail…)
 * pour qu'on comprenne un comportement. Rien n'est envoyé automatiquement.
 *
 * Garde-fous :
 *  - l'accord d'Android est redemandé À CHAQUE enregistrement (fenêtre du système) ; une notification reste affichée tant que l'enregistrement dure ;
 *  - la fenêtre de paiement (montant + code secret) est protégée (FLAG_SECURE) : elle apparaît NOIRE dans la vidéo ;
 *  - 10 minutes au plus ; vidéos effacées au bout de 7 jours ; jamais de son (pas de micro).
 */
object EnregistreurEcran {
    @Volatile var enCours: Boolean = false
        private set
    /** Appelé quand l'état change : (en cours ?, fichier terminé ou null). Posé par l'écran principal. */
    @Volatile var auChangement: ((Boolean, File?) -> Unit)? = null

    internal fun annoncer(actif: Boolean, fichier: File?) {
        enCours = actif
        Handler(Looper.getMainLooper()).post { auChangement?.invoke(actif, fichier) }
    }

    fun dossier(contexte: Context): File = File(contexte.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: contexte.filesDir, "enregistrements").apply { mkdirs() }

    /** Efface les vieilles vidéos (voir EnregistreurEcranLogique.aPurger). À appeler au lancement de l'application. */
    fun nettoyer(contexte: Context) {
        runCatching { EnregistreurEcranLogique.aPurger(dossier(contexte).listFiles()?.toList().orEmpty(), System.currentTimeMillis()).forEach { it.delete() } }
    }

    /** Intention de partage de la vidéo (feuille « Partager avec… » d'Android) ; l'application choisie reçoit un accès en lecture à CE fichier seulement. */
    fun intentionPartage(contexte: Context, fichier: File): Intent {
        val adresse = FileProvider.getUriForFile(contexte, "${contexte.packageName}.fichiers", fichier)
        val envoi = Intent(Intent.ACTION_SEND).apply {
            type = "video/mp4"; putExtra(Intent.EXTRA_STREAM, adresse)
            putExtra(Intent.EXTRA_SUBJECT, "Enregistrement d'écran auRor (${fichier.name})")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(envoi, "Envoyer l'enregistrement d'écran").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    fun partager(activite: Activity, fichier: File) { runCatching { activite.startActivity(intentionPartage(activite, fichier)) } }
}

/** Service au premier plan qui porte l'enregistrement (Android l'exige pour capturer l'écran) et affiche la notification « Enregistrement en cours ». */
class ServiceEnregistrementEcran : Service() {
    private var projection: MediaProjection? = null
    private var enregistreur: MediaRecorder? = null
    private var ecranVirtuel: VirtualDisplay? = null
    private var fichier: File? = null
    private var debutMs = 0L
    private var arrete = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DEMARRER -> demarrer(intent)
            ACTION_ARRETER -> arreter()
        }
        return START_NOT_STICKY
    }

    private fun canal(): String {
        val gestionnaire = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && gestionnaire.getNotificationChannel(CANAL) == null)
            gestionnaire.createNotificationChannel(NotificationChannel(CANAL, "Enregistrement d'écran", NotificationManager.IMPORTANCE_LOW))
        return CANAL
    }

    private fun notification(texte: String, actionArreter: Boolean, partage: PendingIntent? = null): Notification {
        val constructeur = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, canal()) else @Suppress("DEPRECATION") Notification.Builder(this)
        constructeur.setSmallIcon(R.mipmap.ic_launcher).setContentTitle("auRor — enregistrement d'écran").setContentText(texte).setOngoing(actionArreter)
        if (partage != null) constructeur.setContentIntent(partage).setAutoCancel(true)
        if (actionArreter) {
            val arret = PendingIntent.getService(this, 1, Intent(this, ServiceEnregistrementEcran::class.java).setAction(ACTION_ARRETER), PendingIntent.FLAG_IMMUTABLE)
            constructeur.addAction(Notification.Action.Builder(null, "Arrêter et envoyer", arret).build())
        }
        return constructeur.build()
    }

    private fun demarrer(intent: Intent) {
        val note = notification("Tout ce qui s'affiche à l'écran est enregistré. Touchez pour arrêter.", true)
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(ID, note)
        try {
            val code = intent.getIntExtra(EXTRA_CODE, 0)
            @Suppress("DEPRECATION") val donnees: Intent = intent.getParcelableExtra(EXTRA_DONNEES) ?: throw IllegalStateException("accord manquant")
            val p = getSystemService(MediaProjectionManager::class.java).getMediaProjection(code, donnees)
            projection = p
            // Android 14 : le rappel d'arrêt doit être posé AVANT de créer l'écran virtuel
            p.registerCallback(object : MediaProjection.Callback() { override fun onStop() { arreter() } }, Handler(Looper.getMainLooper()))
            val dm = resources.displayMetrics
            val (l, h) = EnregistreurEcranLogique.tailleVideo(dm.widthPixels, dm.heightPixels)
            val c = Calendar.getInstance()
            val f = File(EnregistreurEcran.dossier(this), EnregistreurEcranLogique.nomFichier("auror", c[Calendar.YEAR], c[Calendar.MONTH] + 1, c[Calendar.DAY_OF_MONTH], c[Calendar.HOUR_OF_DAY], c[Calendar.MINUTE], c[Calendar.SECOND]))
            fichier = f
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
            r.setVideoSource(MediaRecorder.VideoSource.SURFACE)      // jamais de son : pas de source audio
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            r.setVideoSize(l, h); r.setVideoFrameRate(24); r.setVideoEncodingBitRate(1_500_000)
            r.setMaxDuration(EnregistreurEcranLogique.DUREE_MAX_MS)
            r.setOutputFile(f.absolutePath)
            r.setOnInfoListener { _, quoi, _ -> if (quoi == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) arreter() }
            r.prepare()
            enregistreur = r
            ecranVirtuel = p.createVirtualDisplay("auror-enregistrement", l, h, dm.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, null)
            r.start()
            debutMs = System.currentTimeMillis()
            EnregistreurEcran.annoncer(true, null)
        } catch (e: Exception) {
            nettoyerRessources(supprimer = true)
            EnregistreurEcran.annoncer(false, null)
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
        }
    }

    private fun nettoyerRessources(supprimer: Boolean) {
        runCatching { ecranVirtuel?.release() }; ecranVirtuel = null
        runCatching { enregistreur?.release() }; enregistreur = null
        runCatching { projection?.stop() }; projection = null
        if (supprimer) fichier?.delete()
    }

    private fun arreter() {
        if (arrete) return
        arrete = true
        val f = fichier
        var valide = false
        try { enregistreur?.stop(); valide = f != null && f.exists() && System.currentTimeMillis() - debutMs >= EnregistreurEcranLogique.DUREE_MIN_MS } catch (e: RuntimeException) { valide = false }
        nettoyerRessources(supprimer = !valide)
        stopForeground(STOP_FOREGROUND_REMOVE)
        if (valide && f != null) {
            // Si l'application n'est plus à l'écran, une notification propose d'envoyer la vidéo ; sinon l'écran principal ouvre directement le partage
            val partage = PendingIntent.getActivity(this, 2, EnregistreurEcran.intentionPartage(this, f), PendingIntent.FLAG_IMMUTABLE)
            getSystemService(NotificationManager::class.java).notify(ID + 1, notification("Enregistrement terminé : touchez pour l'envoyer.", false, partage))
        }
        EnregistreurEcran.annoncer(false, if (valide) f else null)
        stopSelf()
    }

    override fun onDestroy() { if (!arrete) { runCatching { enregistreur?.stop() }; nettoyerRessources(supprimer = true); EnregistreurEcran.annoncer(false, null) }; super.onDestroy() }

    companion object {
        const val ACTION_DEMARRER = "com.ouoba.mobilepay.ENREGISTRER_ECRAN"
        const val ACTION_ARRETER = "com.ouoba.mobilepay.ARRETER_ENREGISTREMENT"
        const val EXTRA_CODE = "code"
        const val EXTRA_DONNEES = "donnees"
        private const val CANAL = "enregistrement_ecran"
        private const val ID = 4207
    }
}
