package com.ouoba.mobilepay.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * Vérifie, à l'instant T, s'il existe une connexion réseau active capable d'atteindre
 * Internet. Ne demande aucune permission dangereuse (ACCESS_NETWORK_STATE est une
 * permission "normale", accordée automatiquement à l'installation).
 */
fun isOnline(context: Context): Boolean {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return false
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}
