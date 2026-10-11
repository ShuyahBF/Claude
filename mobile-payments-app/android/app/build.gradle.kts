// Lot 15 : import explicite — dans le bloc android { }, « java » désigne l'extension Java d'Android, pas le paquet java.time
import java.time.Instant

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
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
        versionCode = 3
        versionName = "1.2.0"

        // URL de base de l'API : par défaut l'API de PRODUCTION (lot 13, API unique FastAPI partagée
        // avec le site web). Surcharge possible : -PapiBaseUrl=http://10.0.2.2:8000/ (émulateur + API locale).
        // L'adresse doit se terminer par « / ».
        buildConfigField("String", "API_BASE_URL", "\"${project.findProperty("apiBaseUrl") ?: "https://paiement-mobile-api-jo11.onrender.com/"}\"")
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
            }
        }
        debug {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
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
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")

    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")

    // Base locale (Room) : source de vérité pour l'UI, condition du mode hors-ligne.
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // Tâche de fond qui rattrape la synchro (profil, marchands) dès que le réseau revient.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
