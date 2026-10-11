// Versions des outils de compilation (lot 16 « Play Store » : passage à Android 15 / API 35).
// Couples vérifiés compatibles entre eux :
//   - Android Gradle Plugin 8.7.3 : gère compileSdk/targetSdk 35 ; exige Gradle 8.9 au minimum
//     (installé par le workflow .github/workflows/mobile-payments-apk.yml) et Java 17 ;
//   - Kotlin 1.9.24 ↔ compilateur Compose 1.5.14 (composeOptions dans app/build.gradle.kts) ;
//   - KSP 1.9.24-1.0.20 : doit porter EXACTEMENT la même version de Kotlin (1.9.24).
// Ne changer Kotlin qu'en changeant aussi KSP et le compilateur Compose.
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // KSP génère le code Room (base locale utilisée pour le mode hors-ligne).
    id("com.google.devtools.ksp") version "1.9.24-1.0.20" apply false
}
