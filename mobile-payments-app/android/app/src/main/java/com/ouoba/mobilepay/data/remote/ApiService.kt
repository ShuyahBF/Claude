package com.ouoba.mobilepay.data.remote

import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.NewMerchantRequest
import com.ouoba.mobilepay.data.model.Service
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {

    @GET("api/operators")
    suspend fun getOperators(): List<String>

    @GET("api/services")
    suspend fun getServices(@Query("operator") operator: String): List<Service>

    @GET("api/merchants/{operator}/{code}")
    suspend fun findMerchant(
        @Path("operator") operator: String,
        @Path("code") code: String
    ): Response<Merchant>

    @POST("api/merchants")
    suspend fun createMerchant(@Body request: NewMerchantRequest): Merchant
}
