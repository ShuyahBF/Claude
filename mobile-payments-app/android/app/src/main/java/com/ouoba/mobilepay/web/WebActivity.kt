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
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import com.ouoba.mobilepay.util.Biometrie
import com.ouoba.mobilepay.util.EnregistreurEcran
import com.ouoba.mobilepay.util.ServiceEnregistrementEcran
import android.animation.ObjectAnimator
import android.app.AlertDialog
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.view.Gravity
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

    // ---- ENREGISTREMENT D'ÉCRAN DE DÉBOGAGE (version « direct » seulement) : accord d'Android, puis démarrage du service d'enregistrement
    private val demandeEnregistrement = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val donnees = r.data
        if (r.resultCode == RESULT_OK && donnees != null) {
            val depart = Intent(this, ServiceEnregistrementEcran::class.java).setAction(ServiceEnregistrementEcran.ACTION_DEMARRER)
                .putExtra(ServiceEnregistrementEcran.EXTRA_CODE, r.resultCode).putExtra(ServiceEnregistrementEcran.EXTRA_DONNEES, donnees)
            startForegroundService(depart)
        } else Toast.makeText(this, "Enregistrement d'écran non autorisé", Toast.LENGTH_SHORT).show()
    }
    private var iconeEnregistrement: TextView? = null
    private var clignotement: ObjectAnimator? = null

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

    // ---- COPIE DE SÉCURITÉ CHIFFRÉE (2.38.0) : le site fait ENREGISTRER un fichier (déjà chiffré) ou CHOISIR un fichier de copie, par le sélecteur de fichiers d'Android
    // (Documents, carte SD…). Aucune autorisation de stockage n'est nécessaire. Le résultat revient au site sous `id`.
    private var retourFichier: String? = null
    private var octetsFichier: ByteArray? = null
    private val creationFichier = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val id = retourFichier; retourFichier = null
        val octets = octetsFichier; octetsFichier = null
        if (id == null) return@registerForActivityResult
        if (uri == null || octets == null) { retour(id, JSONObject().put("erreur", "Enregistrement annulé : aucune copie n'a été faite.")); return@registerForActivityResult }
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(octets) } ?: throw java.io.IOException("emplacement illisible")
            retour(id, JSONObject().put("ok", true).put("nom", uri.lastPathSegment?.substringAfterLast('/') ?: ""))
        } catch (e: Exception) { retour(id, JSONObject().put("erreur", "Enregistrement du fichier impossible : " + (e.message ?: "erreur"))) }
    }
    private val choixFichierCopie = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val id = retourFichier; retourFichier = null
        if (id == null) return@registerForActivityResult
        if (uri == null) { retour(id, JSONObject().put("erreur", "Aucun fichier choisi.")); return@registerForActivityResult }
        try {
            val octets = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: throw java.io.IOException("fichier illisible")
            if (octets.size > 60 * 1024 * 1024) throw java.io.IOException("fichier trop gros pour une copie d'auRor")
            retour(id, JSONObject().put("nom", uri.lastPathSegment?.substringAfterLast('/') ?: "").put("contenu", android.util.Base64.encodeToString(octets, android.util.Base64.NO_WRAP)))
        } catch (e: Exception) { retour(id, JSONObject().put("erreur", "Lecture du fichier impossible : " + (e.message ?: "erreur"))) }
    }

    /** Fait enregistrer `base64` (contenu déjà chiffré) dans un fichier choisi par l'utilisateur ; le nom proposé est `nom`. */
    fun enregistrerFichier(id: String, nom: String, base64: String) {
        try { octetsFichier = android.util.Base64.decode(base64, android.util.Base64.DEFAULT); retourFichier = id; creationFichier.launch(nom) }
        catch (e: Exception) { retour(id, JSONObject().put("erreur", "Enregistrement impossible : " + (e.message ?: "erreur"))) }
    }
    /** Fait choisir un fichier de copie : rend { nom, contenu (base64) } ou { erreur } au site. */
    fun choisirFichier(id: String) {
        try { retourFichier = id; choixFichierCopie.launch(arrayOf("*/*")) } catch (e: Exception) { retour(id, JSONObject().put("erreur", "Choix du fichier impossible : " + (e.message ?: "erreur"))) }
    }

    // ---- SAISIE VOCALE DU MONTANT : la reconnaissance vocale du téléphone (français) rend jusqu'à 5 transcriptions ; le site en tire le montant
    private var retourVoix: String? = null
    private val selecteurVoix = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val id = retourVoix ?: return@registerForActivityResult; retourVoix = null
        val textes = if (r.resultCode == RESULT_OK) r.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS).orEmpty() else emptyList()
        retour(id, if (textes.isEmpty()) JSONObject().put("erreur", "Rien n'a été entendu. Réessayez en parlant près du micro, ou tapez le montant.")
                    else JSONObject().put("transcriptions", org.json.JSONArray(textes)))
    }

    /** Vrai si le téléphone a un service de reconnaissance vocale. */
    fun voixDisponible(): Boolean = Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).resolveActivity(packageManager) != null

    /** Ouvre la fenêtre d'écoute du téléphone ; les transcriptions reviennent au site sous `id`. */
    fun dicterMontant(id: String) {
        try {
            retourVoix = id
            selecteurVoix.launch(Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
                .putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                .putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Dites le montant"))
        } catch (e: Exception) { retourVoix = null; retour(id, JSONObject().put("erreur", "La reconnaissance vocale n'est pas disponible sur ce téléphone.")) }
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
            addView(BandeauMiseAJourVue.creer(this@WebActivity), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))   // nouvelle version dans ShuyahStore (2.36.0, version « direct » seulement)
            addView(zoneSite, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        setContentView(racine)
        if (BuildConfig.MODE_DIRECT) installerIconeEnregistrement(zoneSite)
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
            override fun onPageFinished(view: WebView, url: String?) {
                progression.visibility = android.view.View.GONE; CookieManager.getInstance().flush()
                surveillerDemarrageSite(url)
            }
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

        // Lot 2.30 : à CHAQUE nouvelle version de l'application, la mémoire (cache) du site est vidée une fois : un ancien fichier gardé en mémoire ne peut plus bloquer le démarrage
        val prefsCache = getSharedPreferences("demarrage_site", Context.MODE_PRIVATE)
        if (prefsCache.getInt("version_cache", 0) != BuildConfig.VERSION_CODE) { web.clearCache(true); prefsCache.edit().putInt("version_cache", BuildConfig.VERSION_CODE).apply() }
        // Lot 222 : lancée par le retour de la connexion Google (« auror://google?… » alors que l'application était fermée) : on ouvre directement la page d'échange du code
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(urlRetourGoogle(intent) ?: adresseSite.toString())
    }

    /**
     * Connexion par Google (lot 222) : le navigateur du téléphone rappelle « auror://google?code=… » (ou « ?erreur=… », « ?lie=1 »).
     * On transforme ce rappel en page du site « /connexion-google?… », qui échange le code contre la session. Rend null si l'intention n'est pas ce rappel.
     */
    private fun urlRetourGoogle(i: Intent?): String? {
        val d = i?.data ?: return null
        if (d.scheme != "auror" || d.host != "google") return null
        val requete = d.encodedQuery ?: ""
        return adresseSite.buildUpon().path("/connexion-google").encodedQuery(requete).build().toString()
    }

    /** L'application est déjà ouverte (launchMode singleTask) : le rappel de Google arrive ici. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        urlRetourGoogle(intent)?.let { web.loadUrl(it) }
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
    // Le cookie de session du site est écrit sur le disque dès que l'application quitte l'écran : sans cela, Android peut l'oublier et la page de connexion réapparaît
    override fun onPause() { CookieManager.getInstance().flush(); super.onPause() }
    override fun onStop() { CookieManager.getInstance().flush(); super.onStop(); if (!verrouEnCours) derniereOuverture = System.currentTimeMillis() }
    override fun onStart() { super.onStart(); verrouiller() }

    override fun onResume() { super.onResume(); PresenceSawali.signaler(this) }   // règle 4 : présence auprès de SAWALI
    override fun onSaveInstanceState(sortie: Bundle) { super.onSaveInstanceState(sortie); web.saveState(sortie) }
    override fun onDestroy() { EnregistreurEcran.auChangement = null; clignotement?.cancel(); web.destroy(); super.onDestroy() }

    /**
     * Icône DISCRÈTE de l'enregistrement d'écran (débogage, version « direct » seulement) : un petit rond translucide en bas à gauche, au-dessus du site, donc
     * présent aussi sur la page de connexion. Toucher = commencer ; pendant l'enregistrement il devient rouge et clignote ; toucher = arrêter et envoyer la vidéo.
     */
    private fun installerIconeEnregistrement(zone: FrameLayout) {
        EnregistreurEcran.nettoyer(this)                                    // vieilles vidéos (plus de 7 jours) effacées
        val d = resources.displayMetrics.density
        val icone = TextView(this).apply {
            text = "●"; textSize = 22f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
            contentDescription = "Enregistrer l'écran pour le débogage"
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#E60B1F3A")) }
            alpha = 0.92f
            setOnClickListener { basculerEnregistrement() }
        }
        zone.addView(icone, FrameLayout.LayoutParams((46 * d).toInt(), (46 * d).toInt(), Gravity.BOTTOM or Gravity.START).apply { leftMargin = (10 * d).toInt(); bottomMargin = (96 * d).toInt() })
        iconeEnregistrement = icone
        EnregistreurEcran.auChangement = { actif, fichier ->
            // Aspect : rouge et clignotant pendant l'enregistrement ; discret sinon. À la fin, la feuille de partage s'ouvre toute seule.
            clignotement?.cancel()
            if (actif) {
                icone.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#DC2626")) }
                clignotement = ObjectAnimator.ofFloat(icone, "alpha", 1f, 0.45f).apply { duration = 900; repeatCount = ObjectAnimator.INFINITE; repeatMode = ObjectAnimator.REVERSE; start() }
                icone.contentDescription = "Arrêter l'enregistrement d'écran et envoyer la vidéo"
            } else {
                icone.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#E60B1F3A")) }
                icone.alpha = 0.92f; icone.contentDescription = "Enregistrer l'écran pour le débogage"
                if (fichier != null) EnregistreurEcran.partager(this, fichier)
            }
        }
    }

    private fun basculerEnregistrement() {
        if (EnregistreurEcran.enCours) {
            startService(Intent(this, ServiceEnregistrementEcran::class.java).setAction(ServiceEnregistrementEcran.ACTION_ARRETER)); return
        }
        // Lot 2.29 : l'explication n'est montrée qu'UNE SEULE FOIS (première utilisation) ; ensuite le rond lance DIRECTEMENT l'enregistrement
        // (il ne reste que la fenêtre de consentement d'Android, que le système impose à chaque enregistrement).
        val prefs = getSharedPreferences("enregistrement_ecran", Context.MODE_PRIVATE)
        if (prefs.getBoolean("explication_vue", false)) { lancerEnregistrement(); return }
        AlertDialog.Builder(this).setTitle("Enregistrer l'écran")
            .setMessage("Tout ce qui s'affiche à l'écran sera filmé (15 minutes au plus, sans le son), même sur la page de connexion. La fenêtre de paiement (montant et code secret) apparaît noire dans la vidéo.\n\n" +
                "Ne tapez pas de mot de passe ni de code secret en clair pendant l'enregistrement.\n\nLa vidéo reste sur ce téléphone : vous choisissez à qui l'envoyer à la fin ; elle est effacée au bout de 7 jours.\n\n" +
                "Cette explication ne sera plus affichée : ensuite, toucher le rond lance directement l'enregistrement.")
            .setPositiveButton("Commencer") { _, _ -> prefs.edit().putBoolean("explication_vue", true).apply(); lancerEnregistrement() }
            .setNegativeButton("Annuler", null).show()
    }

    /** Demande l'accord d'Android (fenêtre du système) puis démarre le service d'enregistrement. */
    private fun lancerEnregistrement() {
        val lancer = { demandeEnregistrement.launch(getSystemService(Context.MEDIA_PROJECTION_SERVICE).let { (it as MediaProjectionManager).createScreenCaptureIntent() }) }
        // Android 13 et plus : la notification « enregistrement en cours » doit être autorisée (on continue quoi qu'il arrive)
        if (android.os.Build.VERSION.SDK_INT >= 33) demanderAutorisations(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { lancer() } else lancer()
    }

    private var secoursCacheFait = false

    /**
     * SECOURS « ÉCRAN BLANC » (lot 2.30) : 12 secondes après la fin du chargement d'une page d'auRor, si le site n'a rien affiché (zone « root » vide), l'application vide
     * UNE fois la mémoire du site et recharge. (Le site a aussi sa propre carte de secours avec « Réessayer ».) Observé le 18/11/2026 : écran blanc tenace jusqu'au « vider le cache ».
     */
    private fun surveillerDemarrageSite(url: String?) {
        if (secoursCacheFait || url == null || !estAuror(Uri.parse(url))) return
        web.postDelayed({
            if (secoursCacheFait || isFinishing || isDestroyed) return@postDelayed
            web.evaluateJavascript("(function(){var r=document.getElementById('root');return !!(r&&r.childElementCount>0)})()") { resultat ->
                if (resultat == "false" && !secoursCacheFait) { secoursCacheFait = true; web.clearCache(true); web.loadUrl(adresseSite.toString()) }
            }
        }, 12_000)
    }

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
