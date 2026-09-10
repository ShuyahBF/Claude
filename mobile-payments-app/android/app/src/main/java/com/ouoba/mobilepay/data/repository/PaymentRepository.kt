package com.ouoba.mobilepay.data.repository

import android.content.Context
import com.ouoba.mobilepay.data.local.AppDatabase
import com.ouoba.mobilepay.data.local.DefaultCatalog
import com.ouoba.mobilepay.data.local.entity.MerchantEntity
import com.ouoba.mobilepay.data.local.toDomain
import com.ouoba.mobilepay.data.local.toEntity
import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.NewMerchantRequest
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.remote.ApiService
import com.ouoba.mobilepay.data.remote.RetrofitClient
import com.ouoba.mobilepay.util.isOnline

/**
 * Dépôt "hors-ligne d'abord" : l'UI lit toujours la base locale (Room), jamais le réseau
 * directement. Le réseau ne sert qu'à rafraîchir le cache local quand une connexion existe ;
 * son absence ne bloque jamais l'utilisateur (essentiel en zone rurale / faible couverture).
 */
class PaymentRepository(
    private val context: Context,
    private val api: ApiService = RetrofitClient.api
) {
    private val db = AppDatabase.getInstance(context)

    /** À appeler une fois au démarrage : garantit un catalogue utilisable même sans réseau. */
    suspend fun ensureCatalogSeeded() {
        if (db.serviceDao().count() == 0) {
            db.serviceDao().insertAll(DefaultCatalog.services)
        }
    }

    /** Rafraîchit le catalogue depuis le backend si une connexion existe ; échec silencieux sinon. */
    suspend fun refreshCatalogIfOnline() {
        if (!isOnline(context)) return
        runCatching {
            val operators = api.getOperators()
            val allServices = operators.flatMap { api.getServices(it) }
            if (allServices.isNotEmpty()) {
                db.serviceDao().insertAll(allServices.map { it.toEntity() })
            }
        }
    }

    suspend fun getOperators(): List<String> = db.serviceDao().getOperators()

    suspend fun getServices(operator: String): List<Service> =
        db.serviceDao().getServicesForOperator(operator).map { it.toDomain() }

    /** Recherche locale d'abord ; ne va sur le réseau que si absent localement et en ligne. */
    suspend fun findMerchant(operator: String, code: String): Merchant? {
        db.merchantDao().find(operator, code)?.let { return it.toDomain() }
        if (!isOnline(context)) return null

        val response = runCatching { api.findMerchant(operator, code) }.getOrNull()
        val merchant = response?.takeIf { it.isSuccessful }?.body() ?: return null
        db.merchantDao().upsert(
            MerchantEntity(operator = operator, code = code, label = merchant.label, remoteId = merchant._id, synced = true)
        )
        return merchant
    }

    /**
     * Enregistre le marchand localement immédiatement (l'utilisateur peut continuer tout de
     * suite), puis tente une synchro réseau best-effort. En cas d'échec/hors-ligne, l'enregistrement
     * reste marqué `synced = false` et sera repoussé plus tard par SyncWorker.
     */
    suspend fun createMerchant(operator: String, code: String, label: String): Merchant {
        db.merchantDao().upsert(MerchantEntity(operator = operator, code = code, label = label, synced = false))

        if (isOnline(context)) {
            runCatching { api.createMerchant(NewMerchantRequest(code = code, operator = operator, label = label)) }
                .onSuccess { remote ->
                    db.merchantDao().upsert(
                        MerchantEntity(operator = operator, code = code, label = label, remoteId = remote._id, synced = true)
                    )
                }
        }
        return Merchant(code = code, operator = operator, label = label)
    }
}
