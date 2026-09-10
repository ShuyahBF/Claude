package com.ouoba.mobilepay.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Catalogue des services USSD mis en cache localement (Room) pour un fonctionnement
 * hors-ligne : rempli au premier lancement avec [com.ouoba.mobilepay.data.local.DefaultCatalog],
 * puis rafraîchi silencieusement depuis le backend dès qu'une connexion est disponible.
 * `fieldsJson` stocke la liste de champs (ServiceField) sérialisée en JSON (Gson).
 */
@Entity(tableName = "services")
data class ServiceEntity(
    @PrimaryKey val id: String, // _id distant, ou identifiant stable du catalogue embarqué
    val operator: String,
    val country: String,
    val name: String,
    val category: String,
    val ussdTemplate: String,
    val fieldsJson: String,
    val description: String
)

/**
 * Marchand mémorisé localement (source de vérité pour l'app). `synced = false` tant que
 * l'enregistrement créé hors-ligne n'a pas encore été confirmé par le backend
 * (voir data/sync/SyncWorker.kt qui rattrape ces enregistrements en tâche de fond).
 */
@Entity(tableName = "merchants", primaryKeys = ["operator", "code"])
data class MerchantEntity(
    val operator: String,
    val code: String,
    val label: String,
    val remoteId: String? = null,
    val synced: Boolean = false
)

/**
 * Profil saisi par l'utilisateur à l'écran d'accueil (étape 1/3). Un seul enregistrement
 * (id fixe = 0) : l'app est mono-utilisateur sur l'appareil. L'email est facultatif
 * (peu fiable en zone rurale) ; le téléphone est obligatoire, c'est lui qui identifie
 * l'utilisateur côté backend.
 */
@Entity(tableName = "user_profile")
data class UserProfileEntity(
    @PrimaryKey val id: Int = 0,
    val nom: String,
    val prenom: String,
    val email: String?,
    val telephone: String,
    val synced: Boolean = false
)
