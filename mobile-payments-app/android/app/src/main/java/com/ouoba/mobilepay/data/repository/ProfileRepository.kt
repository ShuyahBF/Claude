package com.ouoba.mobilepay.data.repository

import android.content.Context
import com.ouoba.mobilepay.data.local.AppDatabase
import com.ouoba.mobilepay.data.local.entity.UserProfileEntity
import com.ouoba.mobilepay.data.model.UserProfileRequest
import com.ouoba.mobilepay.data.remote.RetrofitClient
import com.ouoba.mobilepay.util.isOnline

/**
 * Gère le profil utilisateur saisi à l'accueil (nom, prénom, email optionnel, téléphone).
 * Toujours enregistré localement en premier (jamais bloquant), synchronisé vers le backend
 * en best-effort ensuite — voir data/sync/SyncWorker.kt pour les réessais en tâche de fond.
 */
class ProfileRepository(private val context: Context) {
    private val dao = AppDatabase.getInstance(context).userProfileDao()

    suspend fun hasProfile(): Boolean = dao.get() != null

    /** Enregistre le profil localement puis tente une synchro immédiate si le réseau est présent. */
    suspend fun saveProfileAndTrySync(
        nom: String,
        prenom: String,
        email: String?,
        telephone: String
    ): Boolean {
        dao.upsert(UserProfileEntity(nom = nom, prenom = prenom, email = email, telephone = telephone, synced = false))
        return trySyncNow()
    }

    /** Retourne true si la synchro a réellement abouti (utile pour l'indicateur de l'étape 2/3). */
    suspend fun trySyncNow(): Boolean {
        val profile = dao.get() ?: return false
        if (profile.synced) return true
        if (!isOnline(context)) return false

        val ok = runCatching {
            RetrofitClient.api.registerUser(
                UserProfileRequest(
                    nom = profile.nom,
                    prenom = profile.prenom,
                    email = profile.email,
                    telephone = profile.telephone
                )
            )
        }.map { it.isSuccessful }.getOrDefault(false)

        if (ok) dao.setSynced(true)
        return ok
    }
}
