plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // KSP génère le code Room (base locale utilisée pour le mode hors-ligne).
    id("com.google.devtools.ksp") version "1.9.24-1.0.20" apply false
}
