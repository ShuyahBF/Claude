package com.ouoba.mobilepay.data.remote

import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.NewMerchantRequest
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.model.UserProfileRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Routes de l'API unique « Paiement Mobile » (FastAPI, partagée avec le site web).
 * Préfixe dédié « api/android/… » : routes publiques au format JSON de l'app (Models.kt),
 * qui lisent le même catalogue et le même annuaire de marchands que le site.
 */
interface ApiService {

    @GET("api/android/operators")
    suspend fun getOperators(): List<String>

    @GET("api/android/services")
    suspend fun getServices(@Query("operator") operator: String): List<Service>

    @GET("api/android/merchants/{operator}/{code}")
    suspend fun findMerchant(
        @Path("operator") operator: String,
        @Path("code") code: String
    ): Response<Merchant>

    @POST("api/android/merchants")
    suspend fun createMerchant(@Body request: NewMerchantRequest): Merchant

    // Réponse ignorée (Void) : on ne s'intéresse qu'au succès HTTP de la synchro du profil.
    @POST("api/android/users")
    suspend fun registerUser(@Body request: UserProfileRequest): Response<Void>
}
