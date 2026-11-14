package com.ouoba.mobilepay.util

import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.Service
import java.util.Locale

/**
 * RÉSUMÉ D'UN PAIEMENT avant son envoi direct (lot 17) : logique PURE, sans Android, testée par ResumePaiementTest.
 *
 * Pour un développeur WinDev : ce sont les fonctions qui préparent le texte de la fenêtre de confirmation « Payer 2 500 FCFA à X ? »
 * et qui protègent le code secret (le champ de clé « pin » n'apparaît jamais à l'écran, ni dans le résumé, ni dans le code affiché).
 */
object ResumePaiement {
    /** Clé du champ « code secret » dans un gabarit (ex. *144*10*{code}*{amount}*{pin}#) : saisie masquée, jamais affichée ni enregistrée. */
    const val CLE_PIN = "pin"

    /** Le service demande-t-il le code secret dans son gabarit ? */
    fun demandePin(service: Service) = service.fields.any { it.key == CLE_PIN } || service.ussdTemplate.contains("{$CLE_PIN}")

    /**
     * Services proposés. Dans la version du Play Store (modeDirect = faux), un service qui contient le code secret est masqué : l'application ne doit
     * jamais le demander (engagement pris avec le Play Store) ; l'utilisateur le saisit chez l'opérateur après l'ouverture du composeur.
     */
    fun servicesUtilisables(services: List<Service>, modeDirect: Boolean): List<Service> =
        if (modeDirect) services else services.filterNot { demandePin(it) }

    /** Montant en FCFA avec séparateur de milliers : « 2500 » → « 2 500 FCFA » ; texte non numérique laissé tel quel. */
    fun montant(brut: String): String {
        val n = brut.trim().toLongOrNull() ?: return brut.trim()
        return String.format(Locale.FRANCE, "%,d", n).replace(' ', ' ').replace(' ', ' ') + " FCFA"
    }

    /**
     * Lignes « libellé : valeur » de la confirmation, dans l'ordre des champs du service, SANS le code secret.
     * Le montant est mis en forme ; le code marchand est suivi de l'intitulé du marchand quand il est connu.
     */
    fun lignes(service: Service, valeurs: Map<String, String>, marchand: Merchant?): List<Pair<String, String>> {
        val lignes = mutableListOf<Pair<String, String>>("Service" to service.name, "Opérateur" to service.operator)
        for (champ in service.fields) {
            if (champ.key == CLE_PIN) continue
            val valeur = valeurs[champ.key].orEmpty().trim()
            val affiche = when {
                champ.key == "amount" -> montant(valeur)
                champ.isMerchantCode && marchand != null -> "$valeur (${marchand.label})"
                else -> valeur
            }
            lignes += champ.label to affiche
        }
        return lignes
    }

    /** Question de la fenêtre de confirmation : « Payer 2 500 FCFA — Paiement marchand (Orange) ? » (sans montant si le service n'en a pas). */
    fun question(service: Service, valeurs: Map<String, String>): String {
        val montant = valeurs["amount"]?.takeIf { it.isNotBlank() }?.let { montant(it) }
        return (if (montant != null) "Envoyer $montant" else "Envoyer la demande") + " — ${service.name} (${service.operator}) ?"
    }

    /** Code à AFFICHER : le code secret est remplacé par des points (jamais montré en clair). */
    fun codeAffiche(code: String, pin: String): String = if (pin.isBlank()) code else code.replace(pin.trim(), "•".repeat(pin.trim().length))
}
