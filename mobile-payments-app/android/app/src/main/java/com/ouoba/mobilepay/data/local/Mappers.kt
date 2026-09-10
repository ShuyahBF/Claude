package com.ouoba.mobilepay.data.local

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.ouoba.mobilepay.data.local.entity.MerchantEntity
import com.ouoba.mobilepay.data.local.entity.ServiceEntity
import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.model.ServiceField

/** Conversions entre les entités Room (stockage local) et les modèles utilisés par l'UI. */

private val gson = Gson()
private val fieldsListType = object : TypeToken<List<ServiceField>>() {}.type

fun ServiceEntity.toDomain(): Service = Service(
    _id = id,
    operator = operator,
    country = country,
    name = name,
    category = category,
    ussdTemplate = ussdTemplate,
    fields = gson.fromJson(fieldsJson, fieldsListType) ?: emptyList(),
    description = description
)

fun Service.toEntity(): ServiceEntity = ServiceEntity(
    id = _id,
    operator = operator,
    country = country,
    name = name,
    category = category,
    ussdTemplate = ussdTemplate,
    fieldsJson = gson.toJson(fields),
    description = description
)

fun MerchantEntity.toDomain(): Merchant = Merchant(
    _id = remoteId,
    code = code,
    operator = operator,
    label = label
)
