package com.ouoba.mobilepay.data.model

data class ServiceField(
    val key: String,
    val label: String,
    val type: String, // "numeric" | "text"
    val isMerchantCode: Boolean = false
)

data class Service(
    val _id: String,
    val operator: String,
    val country: String,
    val name: String,
    val category: String,
    val ussdTemplate: String,
    val fields: List<ServiceField> = emptyList(),
    val description: String = ""
)

data class Merchant(
    val _id: String? = null,
    val code: String,
    val operator: String,
    val label: String
)

data class NewMerchantRequest(
    val code: String,
    val operator: String,
    val label: String
)

data class ApiError(val error: String)
