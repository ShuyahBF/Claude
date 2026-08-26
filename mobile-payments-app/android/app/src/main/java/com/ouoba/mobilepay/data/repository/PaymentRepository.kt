package com.ouoba.mobilepay.data.repository

import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.NewMerchantRequest
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.remote.RetrofitClient

class PaymentRepository(private val api: com.ouoba.mobilepay.data.remote.ApiService = RetrofitClient.api) {

    suspend fun getOperators(): List<String> = api.getOperators()

    suspend fun getServices(operator: String): List<Service> = api.getServices(operator)

    /** Retourne null si le code marchand n'existe pas encore pour cet opérateur. */
    suspend fun findMerchant(operator: String, code: String): Merchant? {
        val response = api.findMerchant(operator, code)
        return if (response.isSuccessful) response.body() else null
    }

    suspend fun createMerchant(operator: String, code: String, label: String): Merchant =
        api.createMerchant(NewMerchantRequest(code = code, operator = operator, label = label))
}
