# =============================================================================
# Règles R8 / ProGuard de la version de publication (isMinifyEnabled = true).
# R8 renomme et supprime le code jugé inutile ; ce qui est lu « par réflexion »
# (Gson, Retrofit, Room) doit donc être protégé explicitement ici.
# =============================================================================

# --- Attributs indispensables -----------------------------------------------
# Signature        : types génériques (List<Service>, TypeToken<List<ServiceField>>) lus par Gson/Retrofit
# *Annotation*     : annotations Retrofit (@GET, @POST, @Body…) et Room
# InnerClasses / EnclosingMethod : classes anonymes (object : TypeToken<…>() {})
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault, *Annotation*
-keepattributes Exceptions

# --- Modèles de données (Gson) ----------------------------------------------
# Les noms des champs Kotlin = noms des clés JSON de l'API : ils ne doivent pas être renommés.
-keep class com.ouoba.mobilepay.data.model.** { *; }
-keepclassmembers class com.ouoba.mobilepay.data.model.** { <init>(...); }
# Champs annotés @SerializedName (au cas où un modèle en utiliserait)
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# --- Gson : TypeToken (liste de champs stockée en JSON dans Room, voir Mappers.kt) ---
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-dontwarn sun.misc.**

# --- Retrofit : interface de l'API et fonctions « suspend » ------------------
-keep interface com.ouoba.mobilepay.data.remote.ApiService { *; }
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
# Mode « complet » de R8 : conserver les types génériques des réponses et des coroutines
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Room : entités et base (le code généré par KSP y accède directement) ----
-keep class com.ouoba.mobilepay.data.local.entity.** { *; }
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-dontwarn androidx.room.paging.**

# --- WorkManager : la tâche de synchronisation est créée par réflexion -------
-keep class com.ouoba.mobilepay.data.sync.SyncWorker { <init>(...); }
