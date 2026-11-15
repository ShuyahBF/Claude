package com.ouoba.mobilepay.web

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import com.ouoba.mobilepay.util.Biometrie
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import com.ouoba.mobilepay.BuildConfig
import com.ouoba.mobilepay.data.remote.PresenceSawali
import org.json.JSONObject

/**
 * APPLICATION auRor (version hybride) : affiche le site auRor COMPLET (marchands, QR codes, géolocalisation, historique, codes USSD…) dans une fenêtre
 * intégrée, et lui donne accès au téléphone par le pont PontAuRor (composeur, paiement direct, SMS selon la version).
 *
 * Pour un développeur WinDev : c'est un champ « navigateur » plein écran. Le site reste TOUJOURS à jour (rien à réinstaller quand on le modifie) ; l'application
 * ajoute seulement ce qu'un site ne peut pas faire. Hors connexion, une page « Pas de connexion » avec un bouton « Réessayer » s'affiche.
 *
 * Règles :
 *  - seules les pages d'auRor se chargent dans la fenêtre ; tout autre lien (site d'un opérateur…) s'ouvre dans le navigateur du téléphone ;
 *  - les liens « tel: » ouvrent le composeur, « mailto: » la messagerie, etc. ;
 *  - caméra (scan de QR code) et position (marchands proches, géolocalisation des paiements) : autorisations demandées au moment de l'usage ;
 *  - bouton Retour = page précédente du site ; il ferme l'application à la première page.
 */
class WebActivity : FragmentActivity() {
    private lateinit var web: WebView
    private lateinit var progression: ProgressBar
    private var choixFichier: ValueCallback<Array<Uri>>? = null
    private var suiteAutorisations: ((Boolean) -> Unit)? = null

    // Demande d'autorisations : la suite est appelée avec « tout accordé ? » (accordé, refusé ou déjà accordé)
    private val demandeAutorisations = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { resultat ->
        val suite = suiteAutorisations; suiteAutorisations = null
        suite?.invoke(resultat.values.all { it })
    }
    // Choix d'un fichier demandé par une page (photo d'ordonnance, justificatif…)
    private val selecteurFichier = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        choixFichier?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data)); choixFichier = null
    }

    // ---- LECTURE OPTIQUE DU MONTANT : appareil photo ou galerie, puis lecture du texte sur le téléphone ; l'image est effacée aussitôt
    private var retourMontant: String? = null
    private var photoMontant: java.io.File? = null
    private val selecteurMontant = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val id = retourMontant; retourMontant = null
        val fichier = photoMontant; photoMontant = null
        if (id == null) return@registerForActivityResult
        val image: Uri? = if (r.resultCode != RESULT_OK) null else (r.data?.data ?: fichier?.takeIf { it.length() > 0 }?.let { androidx.core.content.FileProvider.getUriForFile(this, "$packageName.fichiers", it) })
        if (image == null) { fichier?.delete(); retour(id, JSONObject().put("erreur", "Aucune image choisie.")); return@registerForActivityResult }
        com.ouoba.mobilepay.util.LectureMontant.reconnaitre(this, image) { json -> fichier?.delete(); retour(id, json) }
    }

    /** Demande l'autorisation de la caméra puis ouvre le choix « photographier / choisir une image » ; le résultat (montants lus) revient au site sous `id`. */
    fun lireMontant(id: String) {
        demanderAutorisations(arrayOf(Manifest.permission.CAMERA)) { ok ->
            try {
                val dossier = java.io.File(cacheDir, "montants").apply { mkdirs() }
                val fichier = java.io.File(dossier, "montant-" + System.currentTimeMillis() + ".jpg")
                val camera = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).putExtra(android.provider.MediaStore.EXTRA_OUTPUT,
                    androidx.core.content.FileProvider.getUriForFile(this, "$packageName.fichiers", fichier)).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                val galerie = Intent(Intent.ACTION_GET_CONTENT).setType("image/*")
                val choix = Intent.createChooser(galerie, "Lire le montant : photographier ou choisir une image")
                if (ok) choix.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))        // sans autorisation de la caméra : galerie seulement
                retourMontant = id; photoMontant = fichier
                selecteurMontant.launch(choix)
            } catch (e: Exception) { retour(id, JSONObject().put("erreur", "Lecture impossible : " + (e.message ?: "erreur"))) }
        }
    }

    /** Adresse du site (surcharge possible à la compilation : -PsiteUrl=…). */
    private val adresseSite: Uri = Uri.parse(BuildConfig.SITE_URL)

    /** Vrai pour une page d'auRor (le site et ses sous-domaines, par exemple api.auror.space) : seules celles-ci restent dans la fenêtre. */
    private fun estAuror(u: Uri): Boolean {
        val h = u.host ?: return false
        val base = adresseSite.host ?: return false
        return u.scheme == "https" && (h == base || h.endsWith(".$base") || h == "www.$base")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        progression = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; visibility = android.view.View.GONE }
        // Android 15 affiche les applications SOUS la barre d'état (heure, signal) et la barre de navigation : le site doit donc être décalé de la hauteur de ces barres
        // (sinon l'en-tête du site et ses boutons passent dessous). Bande du haut = bleu de l'en-tête du site ; le clavier remonte aussi le contenu.
        val bandeHaut = View(this).apply { setBackgroundColor(Color.parseColor("#0B2A80")) }
        val zoneSite = FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(progression, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 8))
        }
        val racine = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F3F7FC"))
            addView(bandeHaut, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0))
            addView(zoneSite, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        setContentView(racine)
        WindowCompat.getInsetsController(window, racine).isAppearanceLightStatusBars = false     // icônes claires sur la bande bleue
        ViewCompat.setOnApplyWindowInsetsListener(racine) { vue, insets ->
            val barres = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            bandeHaut.layoutParams = bandeHaut.layoutParams.apply { height = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top }
            vue.setPadding(barres.left, 0, barres.right, barres.bottom)
            WindowInsetsCompat.CONSUMED
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            cacheMode = WebSettings.LOAD_DEFAULT
            // Le site sait ainsi qu'il est dans l'application (et dans quelle version)
            userAgentString = userAgentString + " AuRorAndroid/" + BuildConfig.VERSION_NAME + (if (BuildConfig.MODE_DIRECT) " direct" else "")
        }
        // Session du site : le cookie de connexion (site et API sur deux adresses d'auRor) doit être conservé
        CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(web, true) }
        web.addJavascriptInterface(PontAuRor(this), "AuRorAndroid")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (estAuror(u) || u.scheme == "file" || u.scheme == "about") return false
                ouvrirAilleurs(u); return true
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { progression.visibility = android.view.View.VISIBLE }
            override fun onPageFinished(view: WebView, url: String?) { progression.visibility = android.view.View.GONE }
            // Pas de connexion : page locale avec un bouton « Réessayer » (seulement pour la page principale, pas pour une image)
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.loadUrl("file:///android_asset/hors_ligne.html")
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, nouveau: Int) { progression.progress = nouveau }
            // Caméra (scan de QR code) : l'autorisation du téléphone est demandée au moment où la page en a besoin
            override fun onPermissionRequest(demande: PermissionRequest) {
                runOnUiThread {
                    val camera = demande.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    val micro = demande.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (!estAuror(demande.origin) || (!camera && !micro)) { demande.deny(); return@runOnUiThread }
                    // Autorisations du téléphone nécessaires (caméra pour le scan, micro pour la dictée) puis réponse à la page
                    val permissions = mutableListOf<String>(); val ressources = mutableListOf<String>()
                    if (camera) { permissions += Manifest.permission.CAMERA; ressources += PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                    if (micro) { permissions += Manifest.permission.RECORD_AUDIO; ressources += PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                    demanderAutorisations(permissions.toTypedArray()) { ok ->
                        if (ok) demande.grant(ressources.toTypedArray()) else demande.deny()
                    }
                }
            }
            // Position (marchands proches, géolocalisation des paiements)
            override fun onGeolocationPermissionsShowPrompt(origine: String, rappel: GeolocationPermissions.Callback) {
                demanderAutorisations(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) { ok -> rappel.invoke(origine, ok, false) }
            }
            // Choix d'un fichier ou d'une photo
            override fun onShowFileChooser(vue: WebView, rappel: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                choixFichier?.onReceiveValue(null); choixFichier = rappel
                return try { selecteurFichier.launch(params.createIntent()); true } catch (e: ActivityNotFoundException) { choixFichier = null; false }
            }
        }

        // Bouton Retour : page précédente du site
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(adresseSite.toString())
    }

    // ---- VERROU BIOMÉTRIQUE (« à la connexion ») : le site est masqué tant que le téléphone n'a pas reconnu l'utilisateur.
    // Redemandé quand l'application revient au premier plan après plus d'une minute d'absence. Sans capteur ni verrouillage d'écran : pas de verrou.
    private var derniereOuverture = 0L
    private var verrouEnCours = false
    private fun verrouiller() {
        if (verrouEnCours || !Biometrie.verrouPossible(this)) { web.visibility = View.VISIBLE; return }
        if (derniereOuverture != 0L && System.currentTimeMillis() - derniereOuverture < 60_000) { web.visibility = View.VISIBLE; return }
        verrouEnCours = true; web.visibility = View.INVISIBLE
        Biometrie.verifier(this, "Ouvrir auRor", "Posez votre doigt pour continuer",
            surOk = { verrouEnCours = false; derniereOuverture = System.currentTimeMillis(); web.visibility = View.VISIBLE },
            surEchec = { message -> verrouEnCours = false; Toast.makeText(this, "auRor est verrouillé : $message", Toast.LENGTH_LONG).show(); finish() })
    }
    override fun onStop() { super.onStop(); if (!verrouEnCours) derniereOuverture = System.currentTimeMillis() }
    override fun onStart() { super.onStart(); verrouiller() }

    override fun onResume() { super.onResume(); PresenceSawali.signaler(this) }   // règle 4 : présence auprès de SAWALI
    override fun onSaveInstanceState(sortie: Bundle) { super.onSaveInstanceState(sortie); web.saveState(sortie) }
    override fun onDestroy() { web.destroy(); super.onDestroy() }

    /** Recharge le site (bouton « Réessayer » de la page « Pas de connexion »). */
    fun recharger() { web.loadUrl(adresseSite.toString()) }

    /** Envoie une réponse au site : window.auRorRetour[id](json). Texte échappé par JSONObject.quote, jamais concaténé tel quel. */
    fun retour(id: String, json: JSONObject) {
        val script = "window.auRorRetour && window.auRorRetour[${JSONObject.quote(id)}] && window.auRorRetour[${JSONObject.quote(id)}](${JSONObject.quote(json.toString())});"
        runOnUiThread { web.evaluateJavascript(script, null) }
    }

    /** Demande des autorisations au téléphone puis appelle la suite (vrai si tout est accordé). Déjà accordées : la suite est appelée tout de suite. */
    fun demanderAutorisations(permissions: Array<String>, suite: (Boolean) -> Unit) {
        val manquantes = permissions.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (manquantes.isEmpty()) { suite(true); return }
        suiteAutorisations = suite
        demandeAutorisations.launch(manquantes.toTypedArray())
    }

    /** Lien hors d'auRor : composeur (tel:), messagerie (mailto:), navigateur (https:)… */
    private fun ouvrirAilleurs(u: Uri) {
        try {
            startActivity(Intent(if (u.scheme == "tel") Intent.ACTION_DIAL else Intent.ACTION_VIEW, u))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "Aucune application pour ouvrir : $u", Toast.LENGTH_LONG).show()
        }
    }
}
