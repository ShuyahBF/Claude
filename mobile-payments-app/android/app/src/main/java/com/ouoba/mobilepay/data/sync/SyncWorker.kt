package com.ouoba.mobilepay.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ouoba.mobilepay.data.local.AppDatabase
import com.ouoba.mobilepay.data.model.NewMerchantRequest
import com.ouoba.mobilepay.data.remote.RetrofitClient
import com.ouoba.mobilepay.data.repository.ProfileRepository

/**
 * Tâche de fond (WorkManager) : ne se déclenche que lorsqu'une connexion réseau est
 * disponible (contrainte posée par SyncScheduler) et rattrape tout ce qui a été créé
 * hors-ligne : profil utilisateur non synchronisé, marchands en attente. `POST /api/merchants`
 * fait un upsert côté backend, donc sans risque en cas de double exécution.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val db = AppDatabase.getInstance(applicationContext)
        val api = RetrofitClient.api

        runCatching { ProfileRepository(applicationContext).trySyncNow() }

        val pending = db.merchantDao().getUnsynced()
        var allOk = true
        for (merchant in pending) {
            val ok = runCatching {
                api.createMerchant(NewMerchantRequest(code = merchant.code, operator = merchant.operator, label = merchant.label))
            }.onSuccess { remote ->
                db.merchantDao().update(merchant.copy(remoteId = remote._id, synced = true))
            }.isSuccess
            if (!ok) allOk = false
        }

        return if (allOk) Result.success() else Result.retry()
    }
}
