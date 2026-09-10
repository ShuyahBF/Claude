package com.ouoba.mobilepay

import android.app.Application
import com.ouoba.mobilepay.data.sync.SyncScheduler

class MobilePayApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Rattrape en tâche de fond tout ce qui a été créé hors-ligne (profil, marchands)
        // dès qu'une connexion réseau redevient disponible.
        SyncScheduler.schedulePeriodic(this)
    }
}
