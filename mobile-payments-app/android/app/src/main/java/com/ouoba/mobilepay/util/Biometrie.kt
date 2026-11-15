package com.ouoba.mobilepay.util

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * IDENTIFICATION BIOMÉTRIQUE (empreinte, visage selon le téléphone) — lot sécurité.
 *
 * Deux usages :
 *  1. VERROU DE L'APPLICATION (« à la connexion ») : `verifier(...)` affiche l'invite du téléphone ; l'application ne s'ouvre qu'après réussite.
 *  2. CODE SECRET MÉMORISÉ (« quand le code PIN est exigé ») : le code est enregistré UNE FOIS, CHIFFRÉ par une clé du coffre sécurisé du téléphone (Android Keystore)
 *     qui ne sert que si l'utilisateur pose son doigt. Ensuite, à chaque fois qu'un code PIN est demandé, `retrouver(...)` demande le doigt puis rend le code :
 *     l'utilisateur ne tape plus rien. Le code n'est JAMAIS écrit en clair ; si les empreintes du téléphone changent, la clé est invalidée par Android
 *     et le code mémorisé est effacé (il faudra le ressaisir et le re-mémoriser).
 *
 * Pour un développeur WinDev : c'est l'équivalent d'une « authentification forte » du système, appelée par une procédure avec deux rappels (succès / échec).
 * Les codes sont rangés par « clé de rangement » (ex. le nom de l'opérateur), car chaque opérateur a son propre code secret.
 */
object Biometrie {
    private const val ALIAS = "auror_pin_biometrique"             // nom de la clé dans le coffre Android
    private const val FICHIER = "biometrie_pin"                     // préférences : une entrée « iv:données » par clé de rangement
    private const val FORCE = BiometricManager.Authenticators.BIOMETRIC_STRONG

    // ---------------------------------------------------------------- disponibilité
    /** Vrai si le téléphone a un capteur biométrique ET au moins une empreinte (ou un visage) enregistrée. */
    fun disponible(c: Context): Boolean = BiometricManager.from(c).canAuthenticate(FORCE) == BiometricManager.BIOMETRIC_SUCCESS

    /** Autorisations acceptées pour le verrou de l'application : biométrie, ou à défaut le schéma / code du téléphone. */
    private fun autorisationsVerrou(): Int =
        if (Build.VERSION.SDK_INT >= 30) FORCE or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        else BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL

    /** Vrai si le téléphone peut verrouiller l'application (biométrie ou verrouillage d'écran configuré). */
    fun verrouPossible(c: Context): Boolean = BiometricManager.from(c).canAuthenticate(autorisationsVerrou()) == BiometricManager.BIOMETRIC_SUCCESS

    // ---------------------------------------------------------------- 1. verrou de l'application
    /** Affiche l'invite du téléphone. `surOk` si l'utilisateur est reconnu ; `surEchec(message)` s'il annule ou échoue. */
    fun verifier(a: FragmentActivity, titre: String, sousTitre: String, surOk: () -> Unit, surEchec: (String) -> Unit) {
        val invite = BiometricPrompt(a, ContextCompat.getMainExecutor(a), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(resultat: BiometricPrompt.AuthenticationResult) = surOk()
            override fun onAuthenticationError(code: Int, message: CharSequence) = surEchec(message.toString())
        })
        invite.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(titre).setSubtitle(sousTitre).setAllowedAuthenticators(autorisationsVerrou()).build())
    }

    // ---------------------------------------------------------------- 2. code secret mémorisé
    /** Vrai si un code secret est déjà mémorisé sous cette clé de rangement. */
    fun codeMemorise(c: Context, cle: String): Boolean = c.getSharedPreferences(FICHIER, Context.MODE_PRIVATE).contains(cle)

    /** Efface le code mémorisé (changement de code, ou l'utilisateur ne veut plus de l'empreinte pour cet opérateur). */
    fun oublier(c: Context, cle: String) { c.getSharedPreferences(FICHIER, Context.MODE_PRIVATE).edit().remove(cle).apply() }

    /** Clé du coffre : créée au premier usage ; ne sert qu'après reconnaissance biométrique ; invalidée si les empreintes changent. */
    private fun cleDuCoffre(): SecretKey {
        val coffre = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (coffre.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true)
            .apply { if (Build.VERSION.SDK_INT >= 30) setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG) }   // doigt à CHAQUE usage
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(spec) }.generateKey()
    }

    /** Invite biométrique liée à un chiffreur : le chiffreur ne devient utilisable qu'après le doigt. */
    private fun inviteAvecChiffreur(a: FragmentActivity, chiffreur: Cipher, titre: String, sousTitre: String, surOk: (Cipher) -> Unit, surEchec: (String) -> Unit) {
        val invite = BiometricPrompt(a, ContextCompat.getMainExecutor(a), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(resultat: BiometricPrompt.AuthenticationResult) {
                val c = resultat.cryptoObject?.cipher
                if (c == null) surEchec("Identification impossible.") else surOk(c)
            }
            override fun onAuthenticationError(code: Int, message: CharSequence) = surEchec(message.toString())
        })
        invite.authenticate(
            BiometricPrompt.PromptInfo.Builder().setTitle(titre).setSubtitle(sousTitre).setNegativeButtonText("Taper le code").setAllowedAuthenticators(FORCE).build(),
            BiometricPrompt.CryptoObject(chiffreur))
    }

    /** ENRÔLEMENT : l'utilisateur pose son doigt, le code secret est chiffré puis rangé sous `cle`. `surOk` quand c'est enregistré. */
    fun memoriser(a: FragmentActivity, cle: String, pin: String, surOk: () -> Unit, surEchec: (String) -> Unit) {
        try {
            val chiffreur = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, cleDuCoffre()) }
            inviteAvecChiffreur(a, chiffreur, "Mémoriser mon code secret", "Posez votre doigt : le code sera associé à votre empreinte.", { c ->
                try {
                    val chiffre = c.doFinal(pin.toByteArray(Charsets.UTF_8))
                    a.getSharedPreferences(FICHIER, Context.MODE_PRIVATE).edit().putString(cle, empaqueter(c.iv, chiffre)).apply()
                    surOk()
                } catch (e: Exception) { surEchec("Enregistrement impossible : " + (e.message ?: "erreur")) }
            }, surEchec)
        } catch (e: Exception) { surEchec("Empreinte indisponible : " + (e.message ?: "erreur")) }
    }

    /** UTILISATION : l'utilisateur pose son doigt, le code secret mémorisé sous `cle` est rendu à `surPin`. */
    fun retrouver(a: FragmentActivity, cle: String, surPin: (String) -> Unit, surEchec: (String) -> Unit) {
        val rangee = a.getSharedPreferences(FICHIER, Context.MODE_PRIVATE).getString(cle, null)
        val (iv, chiffre) = deballer(rangee) ?: run { surEchec("Aucun code mémorisé."); return }
        try {
            val chiffreur = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, cleDuCoffre(), GCMParameterSpec(128, iv)) }
            inviteAvecChiffreur(a, chiffreur, "Confirmer avec mon empreinte", "Votre code secret sera envoyé après la reconnaissance.", { c ->
                try { surPin(String(c.doFinal(chiffre), Charsets.UTF_8)) } catch (e: Exception) { surEchec("Lecture impossible : " + (e.message ?: "erreur")) }
            }, surEchec)
        } catch (e: KeyPermanentlyInvalidatedException) {
            oublier(a, cle)                                                                   // empreintes modifiées : Android a invalidé la clé
            surEchec("Les empreintes du téléphone ont changé : tapez votre code, puis mémorisez-le à nouveau.")
        } catch (e: Exception) { surEchec("Empreinte indisponible : " + (e.message ?: "erreur")) }
    }

    // ---------------------------------------------------------------- rangement (testé sans téléphone)
    /** « iv:données » en hexadécimal. */
    internal fun empaqueter(iv: ByteArray, donnees: ByteArray): String = hex(iv) + ":" + hex(donnees)
    /** Inverse de `empaqueter` ; null si le texte est absent ou illisible. */
    internal fun deballer(texte: String?): Pair<ByteArray, ByteArray>? {
        val p = texte?.split(":") ?: return null
        if (p.size != 2 || p[0].isEmpty() || p[1].isEmpty() || p.any { it.length % 2 != 0 || !it.all { ch -> ch in "0123456789abcdef" } }) return null
        return unhex(p[0]) to unhex(p[1])
    }
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
    private fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
