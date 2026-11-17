package com.ouoba.mobilepay.web

import com.ouoba.mobilepay.util.Biometrie
import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.ouoba.mobilepay.util.JournalUssd
import com.ouoba.mobilepay.util.NotificationsPaiement
import com.ouoba.mobilepay.util.SaisieUssd
import android.content.pm.PackageManager
import android.webkit.JavascriptInterface
import com.ouoba.mobilepay.BuildConfig
import com.ouoba.mobilepay.util.UssdDirect
import com.ouoba.mobilepay.util.openDialerWithUssd
import org.json.JSONArray
import org.json.JSONObject

/**
 * PONT ENTRE LE SITE auRor ET LE TÉLÉPHONE (objet « window.AuRorAndroid » vu par le site).
 *
 * Pour un développeur WinDev : c'est la « DLL » que le site peut appeler. Chaque fonction annotée @JavascriptInterface est appelable par le site ;
 * les réponses asynchrones sont renvoyées au site en appelant window.auRorRetour[numéro](json) (voir lib/pontAndroid.js du site).
 *
 * Sécurité :
 *  - le pont n'est accessible qu'aux pages d'auRor : WebActivity refuse de charger toute autre adresse dans la fenêtre intégrée ;
 *  - le paiement direct passe TOUJOURS par une fenêtre de confirmation native (le site ne peut pas envoyer un code en silence) ;
 *  - le code secret (le mot PIN dans le code) est saisi dans une fenêtre native masquée : il ne passe jamais par le site et n'est jamais enregistré ;
 *  - paiement direct et lecture des SMS n'existent que dans la version « direct » (autorisations absentes de la version du Play Store).
 */
class PontAuRor(private val activite: WebActivity) {
    private companion object { const val CLE_CONNEXION = "connexion_site" }

    private val contexte: Context get() = activite

    /** Ce que cette version de l'application sait faire. */
    @JavascriptInterface
    fun capacites(): String = JSONObject().put("application", true).put("version", BuildConfig.VERSION_NAME)
        .put("ocr", true).put("voix", activite.voixDisponible()).put("direct", BuildConfig.MODE_DIRECT).put("dialogue", BuildConfig.MODE_DIRECT).put("notifications", BuildConfig.MODE_DIRECT).put("sms", BuildConfig.MODE_DIRECT && declare(Manifest.permission.READ_SMS)).toString()

    /** Vrai si l'application déclare cette autorisation (la version « direct sans SMS » n'a pas READ_SMS : la lecture des SMS n'est alors pas proposée). */
    private fun declare(permission: String): Boolean = try {
        contexte.packageManager.getPackageInfo(contexte.packageName, PackageManager.GET_PERMISSIONS).requestedPermissions?.contains(permission) == true
    } catch (e: Exception) { false }

    /** Ouvre le composeur avec le code pré-rempli (aucune autorisation) : l'utilisateur appuie lui-même sur « Appeler ». */
    @JavascriptInterface
    fun composer(code: String) {
        activite.runOnUiThread { openDialerWithUssd(contexte, code) }
    }

    /** Vrai si l'accès aux notifications est activé pour auRor direct (lecture des paiements application fermée). */
    @JavascriptInterface
    fun notificationsActives(): Boolean = NotificationsPaiement.actif(contexte)

    /** Ouvre le réglage système « Accès aux notifications » (à activer une seule fois). */
    @JavascriptInterface
    fun ouvrirReglagesNotifications() {
        activite.runOnUiThread { try { contexte.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} }
    }

    /** Notifications de paiement reçues pendant que l'application était fermée : tableau JSON [{adresse, recu_le, corps}] ; le fichier d'attente est VIDÉ par cette lecture. */
    @JavascriptInterface
    fun notificationsEnAttente(): String = NotificationsPaiement.retirer(contexte)

    /** Journal des envois USSD (code composé, réponses exactes, échecs ; le code secret est masqué). */
    @JavascriptInterface
    fun journalUssd(): String = JournalUssd.lire(contexte)

    /** Lecture optique du montant : photo (ou image choisie) lue SUR le téléphone ; rend { montants: [{valeur, texte, ligne}] } ou { erreur } au site (numéro `id`). */
    @JavascriptInterface
    fun lireMontant(id: String) { activite.runOnUiThread { activite.lireMontant(id) } }

    /** Saisie vocale du montant : rend { transcriptions: [...] } (jusqu'à 5, la plus probable d'abord) ou { erreur } au site (numéro `id`). */
    @JavascriptInterface
    fun dicterMontant(id: String) { activite.runOnUiThread { activite.dicterMontant(id) } }

    /** Ouvre la page des réglages d'auRor dans le téléphone (Autorisations : micro, caméra, position…) pour accorder un accès refusé. */
    @JavascriptInterface
    fun ouvrirReglagesApplication() {
        activite.runOnUiThread {
            try { contexte.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + contexte.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }
    }

    /** Page « Pas de connexion » : bouton « Réessayer ». */
    @JavascriptInterface
    fun reessayer() { activite.runOnUiThread { activite.recharger() } }

    /**
     * Paiement direct : fenêtre de confirmation (résumé), saisie masquée du code secret si le code contient le mot PIN, puis envoi du code USSD.
     * Rend au site {texte} (réponse de l'opérateur) ou {erreur}.
     */
    // ---- Coffre de données : secret mémorisé et protégé par l'empreinte OU le code du téléphone
    /** Vrai si le téléphone a un verrouillage d'écran permettant de protéger le secret du coffre. */
    @JavascriptInterface
    fun coffreDisponible(): Boolean = Biometrie.coffrePossible(contexte)

    /** Vrai si le secret du coffre est déjà mémorisé sur ce téléphone. */
    @JavascriptInterface
    fun coffreMemorise(): Boolean = Biometrie.coffreMemorise(contexte)

    /** Mémorise le secret après reconnaissance du téléphone. Réponse : { ok } ou { erreur }. */
    @JavascriptInterface
    fun coffreMemoriser(id: String, secret: String) {
        activite.runOnUiThread { Biometrie.coffreMemoriser(activite, secret, { activite.retour(id, JSONObject().put("ok", true)) }, { activite.retour(id, JSONObject().put("erreur", it)) }) }
    }

    /** Rend le secret mémorisé après reconnaissance du téléphone. Réponse : { secret } ou { erreur }. */
    @JavascriptInterface
    fun coffreRetrouver(id: String) {
        activite.runOnUiThread { Biometrie.coffreRetrouver(activite, { activite.retour(id, JSONObject().put("secret", it)) }, { activite.retour(id, JSONObject().put("erreur", it)) }) }
    }

    /** Oublie le secret mémorisé. */
    @JavascriptInterface
    fun coffreOublier() { Biometrie.coffreOublier(contexte) }

    // ---- Connexion au SITE par l'empreinte : secret propre au téléphone rangé sous la clé « connexion_site » (jamais le mot de passe)
    /** Vrai si une empreinte de connexion est déjà enregistrée sur ce téléphone. */
    @JavascriptInterface
    fun empreinteConnexionMemorisee(): Boolean = Biometrie.codeMemorise(contexte, CLE_CONNEXION)

    /** Range {id, secret} (JSON) après reconnaissance du doigt. Réponse : { ok } ou { erreur }. */
    @JavascriptInterface
    fun empreinteConnexionMemoriser(id: String, json: String) {
        activite.runOnUiThread { Biometrie.memoriser(activite, CLE_CONNEXION, json, { activite.retour(id, JSONObject().put("ok", true)) }, { activite.retour(id, JSONObject().put("erreur", it)) }) }
    }

    /** Demande le doigt puis rend {id, secret} au site (ou { erreur }). */
    @JavascriptInterface
    fun empreinteConnexionRetrouver(id: String) {
        activite.runOnUiThread {
            Biometrie.retrouver(activite, CLE_CONNEXION, { texte ->
                val rep = try { JSONObject(texte) } catch (_: Exception) { JSONObject().put("erreur", "Empreinte illisible : tapez votre mot de passe.") }
                activite.retour(id, rep)
            }, { activite.retour(id, JSONObject().put("erreur", it)) })
        }
    }

    /** Oublie l'empreinte de connexion de ce téléphone. */
    @JavascriptInterface
    fun empreinteConnexionOublier() { Biometrie.oublier(contexte, CLE_CONNEXION) }

    @JavascriptInterface
    fun payerDirect(id: String, operateur: String, code: String, resume: String) = fenetrePaiement(id, operateur, code, resume, null)

    /**
     * Paiement direct avec FENÊTRE DE SÉCURITÉ (lot 120) : en plus du résumé et du code secret, l'utilisateur RETAPE le montant à payer ; si le montant retapé
     * ne correspond pas à celui du paiement préparé, rien n'est envoyé. Le site ne peut donc jamais déclencher un paiement sans que l'utilisateur ait vu et retapé le montant.
     */
    @JavascriptInterface
    fun payerDirectMontant(id: String, operateur: String, code: String, resume: String, montant: String) = fenetrePaiement(id, operateur, code, resume, montant)

    /**
     * Paiement direct EN DEUX TEMPS (Orange et autres opérateurs qui demandent le code secret dans une seconde fenêtre) : `code` est SANS code secret.
     * Même fenêtre de sécurité (montant retapé + code secret), puis le code est composé et le service d'accessibilité tape le code secret dans la fenêtre de l'opérateur.
     * Rend {texte} (réponse finale de l'opérateur) ou {erreur}.
     */
    @JavascriptInterface
    fun payerDirectDialogue(id: String, operateur: String, code: String, resume: String, montant: String) {
        activite.runOnUiThread {
            if (!UssdDirect.disponible()) { activite.retour(id, JSONObject().put("erreur", "Le paiement direct n'est pas disponible dans cette version de l'application.")); return@runOnUiThread }
            var termine = false
            var chaineMasquee = ""               // même chaîne avec le code secret remplacé par **** : c'est CELLE-CI que le bouton « copier » du débogage met dans le presse-papiers
            var chaine = ""                      // chaîne exactement envoyée (code secret en clair) : rendue au site pour l'affichage de débogage, jamais enregistrée
            fun finir(r: JSONObject) { if (!termine) { termine = true; if (chaine.isNotBlank()) { r.put("chaine", chaine); r.put("chaine_masquee", chaineMasquee) }; activite.retour(id, r) } }
            FenetrePaiement(activite).afficher(FenetrePaiement.lire(resume).let { if (it.operateur.isBlank()) it.copy(operateur = operateur) else it }, montant, true,
                surValider = { pin ->
                    // Le service d'accessibilité doit être activé une fois : sinon on ouvre les réglages et on explique
                    if (!SaisieUssd.serviceActif(contexte)) {
                        try { contexte.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
                        finir(JSONObject().put("erreur", "Activation nécessaire (une seule fois) : dans Réglages → Accessibilité → Applications installées, activez « auRor direct », puis revenez ici et appuyez sur Réessayer. " +
                            "Si Android grise l'option : Réglages → Applications → auRor direct → ⋮ → « Autoriser les paramètres restreints »."))
                        return@afficher
                    }
                    activite.demanderAutorisations(arrayOf(Manifest.permission.CALL_PHONE)) { _ ->
                        if (!UssdDirect.autorise(contexte)) { finir(JSONObject().put("erreur", "Autorisation « Appels » refusée : utilisez « Composer sur ce téléphone ».")); return@demanderAutorisations }
                        chaine = "${code.trim()}  puis, dans la fenêtre de l'opérateur, saisie du code secret : $pin"
                        chaineMasquee = "${code.trim()}  puis, dans la fenêtre de l'opérateur, saisie du code secret : ****"
                        // Armer le service (il tapera le code secret), puis composer le code SANS code secret
                        JournalUssd.ajouter(contexte, "Paiement en deux temps : code composé = ${code.trim()} (le code secret sera tapé dans la fenêtre de l'opérateur)")
                        SaisieUssd.armer(contexte, pin) { r ->
                            // Retour dans auRor une fois la réponse lue
                            try { contexte.startActivity(Intent(contexte, WebActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
                            finir(if (r.texte != null) JSONObject().put("texte", r.texte) else JSONObject().put("erreur", r.erreur ?: "Échec de l'envoi."))
                        }
                        try {
                            contexte.startActivity(Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(code.trim()))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        } catch (e: Exception) { SaisieUssd.terminer(UssdDirect.Reponse(null, "Impossible de composer le code : " + (e.message ?: e.javaClass.simpleName))) }
                    }
                },
                surAnnuler = { finir(JSONObject().put("erreur", "Paiement annulé : rien n'a été envoyé.")) })
        }
    }

    private fun fenetrePaiement(id: String, operateur: String, code: String, resume: String, montant: String?) {
        activite.runOnUiThread {
            if (!UssdDirect.disponible()) { activite.retour(id, JSONObject().put("erreur", "Le paiement direct n'est pas disponible dans cette version de l'application.")); return@runOnUiThread }
            val demandePin = Regex("PIN").containsMatchIn(code)
            var termine = false
            var chaineMasquee = ""               // même chaîne avec le code secret remplacé par **** : c'est CELLE-CI que le bouton « copier » du débogage met dans le presse-papiers
            var chaine = ""                      // chaîne exactement envoyée (code secret en clair) : rendue au site pour l'affichage de débogage, jamais enregistrée
            fun finir(r: JSONObject) { if (!termine) { termine = true; if (chaine.isNotBlank()) { r.put("chaine", chaine); r.put("chaine_masquee", chaineMasquee) }; activite.retour(id, r) } }
            // Fenêtre de sécurité (lot 124) : blocs distincts, montant en chiffres et en lettres, montant retapé, code secret masqué
            FenetrePaiement(activite).afficher(FenetrePaiement.lire(resume).let { if (it.operateur.isBlank()) it.copy(operateur = operateur) else it }, montant, demandePin,
                surValider = { pin ->
                    val aEnvoyer = if (demandePin) code.replace("PIN", pin) else code
                    chaine = aEnvoyer
                    chaineMasquee = if (demandePin) code.replace("PIN", "****") else code
                    activite.demanderAutorisations(arrayOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE)) { _ ->
                        if (!UssdDirect.autorise(contexte)) { finir(JSONObject().put("erreur", "Autorisation « Appels » refusée : utilisez « Composer sur ce téléphone ».")); return@demanderAutorisations }
                        JournalUssd.ajouter(contexte, "Envoi direct : code = $aEnvoyer", pin)
                        UssdDirect.envoyer(contexte, operateur, aEnvoyer) { r ->
                            JournalUssd.ajouter(contexte, if (r.texte != null) "Réponse de l'opérateur : ${r.texte}" else "Échec : ${r.erreur}")
                            finir(if (r.texte != null) JSONObject().put("texte", r.texte) else JSONObject().put("erreur", r.erreur ?: "Échec de l'envoi."))
                        }
                    }
                },
                surAnnuler = { finir(JSONObject().put("erreur", "Paiement annulé : rien n'a été envoyé.")) })
        }
    }

    /**
     * Lecture des SMS de paiement reçus ces derniers jours (version « direct » seulement). Rend au site {sms:[{adresse, recu_le, corps}]} ou {erreur}.
     * Seuls les SMS qui contiennent un montant en FCFA sont rendus ; rien n'est enregistré ni envoyé.
     */
    @JavascriptInterface
    fun lireSmsPaiements(id: String, jours: Int) {
        activite.runOnUiThread {
            if (!BuildConfig.MODE_DIRECT) { activite.retour(id, JSONObject().put("erreur", "La lecture des SMS n'est pas disponible dans cette version de l'application.")); return@runOnUiThread }
            activite.demanderAutorisations(arrayOf(Manifest.permission.READ_SMS)) { _ ->
                if (contexte.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                    activite.retour(id, JSONObject().put("erreur", "Autorisation « SMS » refusée. Si Android la grise : Réglages → Applications → auRor direct → ⋮ → « Autoriser les paramètres restreints »."))
                    return@demanderAutorisations
                }
                Thread {
                    val resultat = try { JSONObject().put("sms", SmsPaiements.lire(contexte, jours.coerceIn(1, 3650))) }
                    catch (e: Exception) { JSONObject().put("erreur", "Lecture des SMS impossible : " + (e.message ?: e.javaClass.simpleName)) }
                    activite.runOnUiThread { activite.retour(id, resultat) }
                }.start()
            }
        }
    }
}

/** Lecture de la boîte de réception (version « direct » seulement). */
object SmsPaiements {
    private val MONTANT = Regex("\\b(?:fcfa|f\\s?cfa|xof|cfa)\\b", RegexOption.IGNORE_CASE)

    /** SMS reçus depuis `jours` jours qui contiennent un montant en francs CFA, du plus récent au plus ancien (1000 au plus). */
    fun lire(c: Context, jours: Int): JSONArray {
        val depuis = System.currentTimeMillis() - jours * 86_400_000L
        val sortie = JSONArray()
        c.contentResolver.query(android.net.Uri.parse("content://sms/inbox"), arrayOf("address", "date", "body"), "date >= ?", arrayOf(depuis.toString()), "date DESC")?.use { q ->
            while (q.moveToNext() && sortie.length() < 1000) {
                val corps = q.getString(2).orEmpty()
                if (MONTANT.containsMatchIn(corps)) sortie.put(JSONObject().put("adresse", q.getString(0).orEmpty()).put("recu_le", q.getLong(1)).put("corps", corps))
            }
        }
        return sortie
    }
}
