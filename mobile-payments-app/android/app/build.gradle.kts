// Lot 15 : import explicite — dans le bloc android { }, « java » désigne l'extension Java d'Android, pas le paquet java.time
import java.time.Instant

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.ouoba.mobilepay"
    // Lot 16 : Android 15 (API 35), niveau exigé par le Play Store pour les nouvelles applications
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ouoba.mobilepay"
        minSdk = 24
        targetSdk = 35
        // versionCode : nombre entier qui DOIT augmenter à chaque envoi sur le Play Store ;
        // versionName : numéro affiché à l'utilisateur (et envoyé à SAWALI dans le signal de présence)
        // Téléphones ARM seulement : la lecture de texte (ML Kit) embarque des bibliothèques natives par architecture ; ignorer x86 (émulateurs) allège l'application
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        versionCode = 24
        versionName = "2.13.0"

        // Adresse du site auRor affiché dans l'application (version hybride, lot 18) : TOUT auRor (marchands, QR codes, géolocalisation, historique…).
        // Surcharge possible pour un essai : -PsiteUrl=https://autre-adresse/
        buildConfigField("String", "SITE_URL", "\"${project.findProperty("siteUrl") ?: "https://auror.space/"}\"")
        // Date et heure de compilation (UTC, ISO 8601) : « deploye_le » du signal de présence SAWALI
        buildConfigField("String", "DATE_BUILD", "\"${Instant.now()}\"")
    }

    // ------------------------------------------------------------------------------------------
    // Signature de la version de publication (lot 16).
    // AUCUNE clé ni mot de passe dans le dépôt : les 4 valeurs sont lues dans des variables
    // d'environnement (ou propriétés Gradle -P…), fournies par le workflow GitHub à partir des
    // secrets ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD.
    //   ANDROID_KEYSTORE_FILE     : chemin du fichier .jks décodé par le workflow (fichier temporaire)
    //   ANDROID_KEYSTORE_PASSWORD : mot de passe du fichier de clés
    //   ANDROID_KEY_ALIAS         : nom de la clé dans le fichier (ex. paiementmobile)
    //   ANDROID_KEY_PASSWORD      : mot de passe de la clé
    // Si l'une d'elles manque, l'App Bundle de release est produit NON signé (rien ne casse).
    // ------------------------------------------------------------------------------------------
    // Lit une valeur : propriété Gradle d'abord, sinon variable d'environnement ; null si vide.
    fun valeurSignature(nom: String): String? =
        ((project.findProperty(nom) as String?) ?: System.getenv(nom))?.takeIf { it.isNotBlank() }

    val cheminCle = valeurSignature("ANDROID_KEYSTORE_FILE")
    val motDePasseFichier = valeurSignature("ANDROID_KEYSTORE_PASSWORD")
    val aliasCle = valeurSignature("ANDROID_KEY_ALIAS")
    val motDePasseCle = valeurSignature("ANDROID_KEY_PASSWORD")
    // Signature possible seulement si les 4 valeurs existent ET que le fichier est bien présent
    val signatureDisponible = cheminCle != null && file(cheminCle).exists() &&
        motDePasseFichier != null && aliasCle != null && motDePasseCle != null

    signingConfigs {
        if (signatureDisponible) {
            create("release") {
                storeFile = file(cheminCle!!)
                storePassword = motDePasseFichier
                keyAlias = aliasCle
                keyPassword = motDePasseCle
            }
        }
    }

    // DEUX VERSIONS de la même application (même code, pont différent) :
    //  - « standard » : version du PLAY STORE. Composeur pré-rempli, QR code, position ; AUCUNE autorisation sensible (ni Appels, ni SMS) ;
    //  - « direct »   : APK installé à la main, jamais publié sur le Play Store. Ajoute le paiement direct (envoi du code USSD) et la lecture des SMS
    //                   (src/direct/AndroidManifest.xml). Identifiant et nom distincts : elle s'installe À CÔTÉ de la version standard.
    flavorDimensions += "version"
    productFlavors {
        create("standard") {
            dimension = "version"
            buildConfigField("boolean", "MODE_DIRECT", "false")
        }
        create("direct") {
            dimension = "version"
            applicationIdSuffix = ".direct"
            versionNameSuffix = "-direct"
            buildConfigField("boolean", "MODE_DIRECT", "true")
        }
    }

    buildTypes {
        release {
            // R8 : réduit et obscurcit le code ; les règles de proguard-rules.pro protègent
            // ce qui est lu par réflexion (Gson, Retrofit, Room).
            isMinifyEnabled = true
            // Supprime aussi les ressources inutilisées (fichier plus léger)
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signature appliquée uniquement si les secrets ont été fournis
            if (signatureDisponible) {
                signingConfig = signingConfigs.getByName("release")
            } else if ((project.findProperty("signerAvecCleLocale") as String?) == "true") {
                // Livraison à la main (APK « direct » installé sans Play Store) : -PsignerAvecCleLocale=true signe le build « release » (non débogable) avec la clé
                // de l'environnement, pour qu'il s'installe directement et que le fichier ne porte pas « debug » dans son nom. Aucune clé n'est dans le dépôt.
                signingConfig = signingConfigs.getByName("debug")
            }
        }
        debug {
            isMinifyEnabled = false
        }
    }

    // Essai d'installation : -PsansSms=true retire l'autorisation de lire les SMS de la version « direct » (Google Play Protect bloque parfois les APK qui
    // cumulent SMS, Appels et position). Paiement direct, caméra et position restent ; la lecture des SMS n'est alors pas proposée.
    if ((project.findProperty("sansSms") as String?) == "true") {
        sourceSets.maybeCreate("directDebug").manifest.srcFile("src/sanssms/AndroidManifest.xml")
        sourceSets.maybeCreate("directRelease").manifest.srcFile("src/sanssms/AndroidManifest.xml")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    // ComponentActivity + demandes d'autorisations (registerForActivityResult)
    implementation("androidx.activity:activity-ktx:1.9.1")
    // Signal de présence à SAWALI (règle 4) et réseau
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Empreinte digitale (verrou de l'application et code secret mémorisé)
    implementation("androidx.biometric:biometric:1.1.0")
    // Lecture optique du montant (texte lu SUR le téléphone, image jamais envoyée)
    implementation("com.google.mlkit:text-recognition:16.0.1")
    testImplementation("junit:junit:4.13.2")
}
