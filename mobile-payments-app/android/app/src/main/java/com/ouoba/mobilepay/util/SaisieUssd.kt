package com.ouoba.mobilepay.util

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * PAIEMENT EN DEUX TEMPS : le code (sans code secret) est composé, l'opérateur affiche sa fenêtre « code secret », et ce service tape le code secret et appuie sur « Envoyer ».
 *
 * Pourquoi : `sendUssdRequest` ne sait faire qu'UN échange ; chez Orange le code secret est demandé dans une seconde fenêtre. Ce service joue le rôle des doigts de l'utilisateur.
 *
 * Pour un développeur WinDev : un « service d'accessibilité » est un programme que le téléphone prévient à chaque changement d'écran ; il peut lire les champs de la fenêtre
 * affichée et y écrire. Il doit être activé UNE FOIS par l'utilisateur dans Réglages → Accessibilité (Android l'impose).
 *
 * Garde-fous :
 *  - le service n'agit que pendant un paiement armé par l'application (90 s au plus) et seulement dans les fenêtres du téléphone / de l'opérateur ;
 *  - le code secret est gardé en mémoire le temps de l'envoi, puis effacé ; il n'est jamais enregistré, ni journalisé, ni transmis ;
 *  - seul le texte de la réponse finale de l'opérateur est rendu à l'application (jamais le contenu des autres fenêtres).
 */
object SaisieUssd {
    private const val DELAI_MS = 90_000L
    private val principal = Handler(Looper.getMainLooper())

    private var pin: CharArray? = null
    private var contexte: Context? = null
    private fun journal(l: String) { contexte?.let { JournalUssd.ajouter(it, l, pin?.let { p -> String(p) }) } }
    private var surFin: ((UssdDirect.Reponse) -> Unit)? = null
    private var attenteReponse = false          // faux : on attend la fenêtre « code secret » ; vrai : le code est tapé, on attend la réponse finale

    /** Vrai si le service d'accessibilité d'auRor est activé dans les réglages du téléphone. */
    fun serviceActif(c: Context): Boolean {
        val attendu = ComponentName(c, ServiceSaisieUssd::class.java).flattenToString()
        val liste = Settings.Secure.getString(c.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        return liste.split(':').any { it.equals(attendu, ignoreCase = true) }
    }

    /** Arme le service pour UN paiement : `codeSecret` sera tapé dans la fenêtre de l'opérateur, `fin` reçoit la réponse (ou l'échec). */
    fun armer(c: Context, codeSecret: String, fin: (UssdDirect.Reponse) -> Unit) {
        terminer(null)
        contexte = c.applicationContext
        pin = codeSecret.toCharArray(); surFin = fin; attenteReponse = false
        principal.postDelayed({ terminer(UssdDirect.Reponse(null, "Pas de réponse de l'opérateur (délai dépassé). Vérifiez votre solde ou votre historique avant de réessayer.")) }, DELAI_MS)
    }

    internal fun arme() = surFin != null

    /** Efface le code secret, désarme le service et rend le résultat. */
    internal fun terminer(r: UssdDirect.Reponse?) {
        principal.removeCallbacksAndMessages(null)
        pin?.fill('0'); pin = null
        if (r != null) contexte?.let { JournalUssd.ajouter(it, if (r.texte != null) "Réponse finale de l'opérateur : ${r.texte}" else "Échec : ${r.erreur}") }
        val f = surFin; surFin = null; attenteReponse = false
        if (r != null) f?.invoke(r)
    }

    /** Réponses de l'opérateur qui signifient un échec (code secret faux, solde insuffisant…). */
    private val ECHEC = Regex("incorrect|invalide|erron|erreur|refus|insuffisant|échec|echec|impossible|indisponible", RegexOption.IGNORE_CASE)
    private val BOUTONS_ENVOI = setOf("envoyer", "send", "ok", "répondre", "repondre", "reply", "valider")
    private val BOUTONS_FERMETURE = setOf("ok", "annuler", "cancel", "fermer", "close", "terminer")

    /** Traite la fenêtre affichée par le téléphone (appelé par le service à chaque changement d'écran). */
    internal fun traiter(racine: AccessibilityNodeInfo) {
        if (!arme()) return
        val champ = trouverChamp(racine)
        if (!attenteReponse) {
            // 1) La fenêtre « code secret » est affichée : on tape le code puis on appuie sur « Envoyer »
            if (champ == null) { journal("Fenêtre vue (sans champ de saisie) : " + textes(racine).joinToString(" | ")); return }
            journal("Fenêtre « code secret » vue : " + textes(racine).filter { it != String(pin ?: CharArray(0)) }.joinToString(" | "))
            val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, String(pin ?: return)) }
            champ.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            val bouton = trouverBouton(racine, BOUTONS_ENVOI)?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
            journal("Code secret tapé (****) et bouton « Envoyer » " + (if (bouton) "cliqué" else "introuvable"))
            pin?.fill('0'); pin = null                      // le code secret n'est plus nécessaire : effacé tout de suite
            attenteReponse = true
        } else {
            // 2) Réponse finale : fenêtre sans champ de saisie. On lit son texte, puis on ferme la fenêtre
            if (champ != null) return                       // l'ancienne fenêtre est encore là
            val texte = textes(racine).filter { it.lowercase() !in BOUTONS_FERMETURE }.joinToString(" ").trim()
            if (texte.isBlank()) return
            trouverBouton(racine, BOUTONS_FERMETURE)?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            terminer(if (ECHEC.containsMatchIn(texte)) UssdDirect.Reponse(null, "L'opérateur a répondu : « $texte ». Aucun paiement n'a été confirmé.") else UssdDirect.Reponse(texte, null))
        }
    }

    private fun trouverChamp(n: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (n == null) return null
        if (n.className?.toString()?.endsWith("EditText") == true) return n
        for (i in 0 until n.childCount) trouverChamp(n.getChild(i))?.let { return it }
        return null
    }

    private fun trouverBouton(n: AccessibilityNodeInfo?, noms: Set<String>): AccessibilityNodeInfo? {
        if (n == null) return null
        if (n.isClickable && (n.text?.toString()?.trim()?.lowercase() in noms)) return n
        for (i in 0 until n.childCount) trouverBouton(n.getChild(i), noms)?.let { return it }
        return null
    }

    private fun textes(n: AccessibilityNodeInfo?, sortie: MutableList<String> = mutableListOf()): List<String> {
        if (n == null) return sortie
        n.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { sortie.add(it) }
        for (i in 0 until n.childCount) textes(n.getChild(i), sortie)
        return sortie
    }
}

/** Le service lui-même : déclaré dans le manifeste de la version « direct » uniquement. Ne réagit qu'aux fenêtres du téléphone et de l'opérateur. */
class ServiceSaisieUssd : AccessibilityService() {
    private val paquets = listOf("phone", "telecom", "dialer", "incallui", "stk", "ussd")

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        val paquet = e?.packageName?.toString()?.lowercase() ?: return
        if (!SaisieUssd.arme() || paquets.none { paquet.contains(it) }) return
        rootInActiveWindow?.let { SaisieUssd.traiter(it) }
    }

    override fun onInterrupt() {}
}
