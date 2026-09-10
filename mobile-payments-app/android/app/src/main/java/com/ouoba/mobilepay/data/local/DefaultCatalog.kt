package com.ouoba.mobilepay.data.local

import com.google.gson.Gson
import com.ouoba.mobilepay.data.local.entity.ServiceEntity
import com.ouoba.mobilepay.data.model.ServiceField

/**
 * Catalogue de secours embarqué dans l'app (miroir de `backend/src/seed/seed.js`).
 * Permet de composer un code USSD dès le tout premier lancement, même sans connexion
 * Internet : indispensable en zone rurale où le tout premier accès réseau n'est pas garanti.
 * Remplacé/complété silencieusement par le catalogue réel du backend dès qu'une synchro
 * réussit (voir PaymentRepository.refreshCatalogIfOnline) ; les codes USSD ci-dessous sont
 * donc à vérifier/mettre à jour côté backend, pas ici.
 */
object DefaultCatalog {

    private val gson = Gson()
    private fun fieldsJson(vararg f: ServiceField) = gson.toJson(f.toList())

    val services: List<ServiceEntity> = listOf(
        ServiceEntity(
            id = "local-orange-merchant",
            operator = "Orange", country = "BF", name = "Paiement marchand",
            category = "merchant_payment", ussdTemplate = "*144*10*{code}*{amount}#",
            fieldsJson = fieldsJson(
                ServiceField("code", "Code marchand", "numeric", isMerchantCode = true),
                ServiceField("amount", "Montant (FCFA)", "numeric")
            ),
            description = "Paiement Orange Money chez un marchand affilié"
        ),
        ServiceEntity(
            id = "local-orange-bill",
            operator = "Orange", country = "BF", name = "Paiement de facture",
            category = "bill_payment", ussdTemplate = "*144*4*{code}*{amount}#",
            fieldsJson = fieldsJson(
                ServiceField("code", "Code du fournisseur", "numeric", isMerchantCode = true),
                ServiceField("amount", "Montant (FCFA)", "numeric")
            ),
            description = "Règlement de facture (eau, électricité, etc.) via Orange Money"
        ),
        ServiceEntity(
            id = "local-orange-transfer",
            operator = "Orange", country = "BF", name = "Transfert d'argent",
            category = "money_transfer", ussdTemplate = "*144*1*{phone}*{amount}#",
            fieldsJson = fieldsJson(
                ServiceField("phone", "Numéro du bénéficiaire", "numeric"),
                ServiceField("amount", "Montant (FCFA)", "numeric")
            ),
            description = "Transfert d'argent vers un autre numéro Orange Money"
        ),
        ServiceEntity(
            id = "local-orange-airtime",
            operator = "Orange", country = "BF", name = "Achat de crédit de communication",
            category = "airtime_topup", ussdTemplate = "*144*4*1*{amount}#",
            fieldsJson = fieldsJson(ServiceField("amount", "Montant (FCFA)", "numeric")),
            description = "Rechargement de crédit de communication depuis le solde Orange Money"
        ),
        ServiceEntity(
            id = "local-moov-merchant",
            operator = "Moov Africa", country = "BF", name = "Paiement marchand",
            category = "merchant_payment", ussdTemplate = "*555*2*{code}*{amount}#",
            fieldsJson = fieldsJson(
                ServiceField("code", "Code marchand", "numeric", isMerchantCode = true),
                ServiceField("amount", "Montant (FCFA)", "numeric")
            ),
            description = "Paiement Moov Money chez un marchand affilié"
        ),
        ServiceEntity(
            id = "local-moov-transfer",
            operator = "Moov Africa", country = "BF", name = "Transfert d'argent",
            category = "money_transfer", ussdTemplate = "*555*1*{phone}*{amount}#",
            fieldsJson = fieldsJson(
                ServiceField("phone", "Numéro du bénéficiaire", "numeric"),
                ServiceField("amount", "Montant (FCFA)", "numeric")
            ),
            description = "Transfert d'argent Moov Money"
        ),
        ServiceEntity(
            id = "local-telecel-merchant",
            operator = "Telecel Faso", country = "BF", name = "Paiement marchand",
            category = "merchant_payment", ussdTemplate = "*133*3*{code}*{amount}#",
            fieldsJson = fieldsJson(
                ServiceField("code", "Code marchand", "numeric", isMerchantCode = true),
                ServiceField("amount", "Montant (FCFA)", "numeric")
            ),
            description = "Paiement Telecel Money chez un marchand affilié"
        )
    )
}
