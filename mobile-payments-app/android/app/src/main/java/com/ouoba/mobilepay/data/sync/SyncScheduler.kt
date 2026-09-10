package com.ouoba.mobilepay.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** Planifie la synchronisation en tâche de fond : dès que le réseau est présent, puis toutes les 6h. */
object SyncScheduler {

    private const val UNIQUE_WORK_NAME = "mobilepay-sync"
    private val networkConstraint = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /** À appeler une fois au démarrage de l'app (voir MobilePayApplication). */
    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(networkConstraint)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    /** Déclenche une tentative immédiate (ex: juste après l'onboarding) sans attendre le cycle périodique. */
    fun syncNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(networkConstraint)
            .build()
        WorkManager.getInstance(context).enqueue(request)
    }
}
