package com.ouoba.mobilepay.web

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * BANDEAU « NOUVELLE VERSION DISPONIBLE » (2.36.0), posé au-dessus du site : fond bleu clair, texte clair, bouton « Mettre à jour » (ouvre ShuyahStore)
 * et « Plus tard » (la version est mémorisée : le bandeau ne revient que pour une version encore plus récente). Invisible tant qu'il n'y a rien à annoncer.
 * Aucune donnée de santé ni de patient n'est concernée : seule la version publiée est lue dans ShuyahStore.
 */
object BandeauMiseAJourVue {
    fun creer(c: Context): LinearLayout {
        val dp = c.resources.displayMetrics.density
        val titre = TextView(c).apply { setTextColor(Color.parseColor("#0A1E3D")); textSize = 14f; setTypeface(typeface, android.graphics.Typeface.BOLD) }
        val maj = Button(c).apply { text = "Mettre à jour"; isAllCaps = false; textSize = 13f; minHeight = 0; minimumHeight = 0 }
        val plusTard = Button(c).apply { text = "Plus tard"; isAllCaps = false; textSize = 13f; minHeight = 0; minimumHeight = 0 }
        val barre = LinearLayout(c).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; visibility = View.GONE
            setPadding((10 * dp).toInt(), (6 * dp).toInt(), (10 * dp).toInt(), (6 * dp).toInt())
            background = GradientDrawable().apply { setColor(Color.parseColor("#E8F3FB")); setStroke((1 * dp).toInt(), Color.parseColor("#0E6BA8")) }
            addView(titre, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(maj); addView(plusTard)
        }
        // Vérification au lancement (au plus toutes les 6 h) : le bandeau n'apparaît que s'il y a une version plus récente
        MiseAJourStore.verifierEnArrierePlan(c) { n ->
            if (n != null) {
                titre.text = "Nouvelle version ${n.nom} disponible"
                barre.visibility = View.VISIBLE
                maj.setOnClickListener { MiseAJourStore.ouvrirStore(c) }
                plusTard.setOnClickListener { MiseAJourStore.ignorer(c, n.code); barre.visibility = View.GONE }
            }
        }
        return barre
    }
}
