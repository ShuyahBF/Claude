package com.ouoba.mobilepay.web

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import com.ouoba.mobilepay.util.Biometrie
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

/**
 * FENÊTRE DE SÉCURITÉ DU PAIEMENT DIRECT (lot 124) : chaque information a son propre bloc, sa forme et sa couleur, pour qu'on voie d'un coup d'œil ce qui est
 * une INDICATION (bandeau, cartes, avertissement) et ce qui est une VALEUR À SAISIR (cadres épais bleu puis orange) :
 *  - bandeau bleu nuit « Paiement sécurisé » + pastille orange de l'opérateur ;
 *  - carte bleu clair « MONTANT À PAYER » : le montant en GROS chiffres, puis en toutes lettres (repérer 20 000 au lieu de 200 000) ;
 *  - carte grise « Marchand » : son nom et son code ;
 *  - encadré ambre d'avertissement : relire le montant en lettres puis le retaper ;
 *  - champ 1 (cadre bleu) : le montant retapé, avec un retour immédiat : vert « ✔ identique » ou rouge « ✖ différent » ;
 *  - champ 2 (cadre orange) : le code secret, masqué ;
 *  - boutons « ✖ Annuler » (contour gris) et « ✔ Envoyer » (vert plein, grisé tant que la saisie n'est pas correcte).
 * Pour un développeur WinDev : c'est une fenêtre construite par code (sans fichier de description d'écran). Rien n'est enregistré : les champs sont vidés à la fermeture.
 */
class FenetrePaiement(private val activite: Activity) {
    /** Ce que la fenêtre affiche ; `texteLibre` sert seulement quand le site n'a envoyé qu'un texte (ancien format). */
    data class Info(val service: String = "", val operateur: String = "", val montant: String = "", val lettres: String = "", val marchand: String = "", val code: String = "", val texteLibre: String = "")

    companion object {
        private val NUIT = Color.parseColor("#0B2A80"); private val BLEU = Color.parseColor("#0E6BA8"); private val BLEU_CLAIR = Color.parseColor("#EAF2FF")
        private val BLEU_TRAIT = Color.parseColor("#93C5FD"); private val ORANGE = Color.parseColor("#F59E0B"); private val AMBRE_FOND = Color.parseColor("#FFF7E6")
        private val AMBRE_TRAIT = Color.parseColor("#FCD34D"); private val AMBRE_TEXTE = Color.parseColor("#92400E"); private val VERT = Color.parseColor("#15803D")
        private val ROUGE = Color.parseColor("#B91C1C"); private val GRIS_FOND = Color.parseColor("#F8FAFC"); private val GRIS_TRAIT = Color.parseColor("#CBD5E1")
        private val GRIS_TEXTE = Color.parseColor("#475569")

        /** Lit les informations envoyées par le site (JSON) ; un simple texte est gardé tel quel. */
        fun lire(resume: String): Info = try {
            val j = JSONObject(resume)
            Info(j.optString("service"), j.optString("operateur"), j.optString("montant"), j.optString("lettres"), j.optString("marchand"), j.optString("code"))
        } catch (e: Exception) { Info(texteLibre = resume) }
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activite.resources.displayMetrics).toInt()
    private fun forme(fond: Int, rayon: Int, trait: Int = 0, epaisseur: Int = 0) = GradientDrawable().apply {
        setColor(fond); cornerRadius = dp(rayon).toFloat(); if (epaisseur > 0) setStroke(dp(epaisseur), trait)
    }
    private fun texte(t: String, taille: Float, couleur: Int, gras: Boolean = false, italique: Boolean = false) = TextView(activite).apply {
        text = t; setTextSize(TypedValue.COMPLEX_UNIT_SP, taille); setTextColor(couleur)
        setTypeface(if (gras) Typeface.DEFAULT_BOLD else Typeface.DEFAULT, if (italique) Typeface.ITALIC else Typeface.NORMAL)
    }
    private fun bloc(fond: Int, trait: Int) = LinearLayout(activite).apply {
        orientation = LinearLayout.VERTICAL; background = forme(fond, 14, trait, 1); setPadding(dp(14), dp(12), dp(14), dp(12))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) }
    }
    private fun champ(couleurCadre: Int, indication: String, motDePasse: Boolean) = EditText(activite).apply {
        hint = indication; gravity = Gravity.CENTER; setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f); setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
        inputType = if (motDePasse) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD else InputType.TYPE_CLASS_NUMBER
        filters = arrayOf(InputFilter.LengthFilter(if (motDePasse) 8 else 12))
        background = forme(Color.WHITE, 12, couleurCadre, 3); setPadding(dp(12), dp(10), dp(12), dp(10))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) }
    }

    /**
     * Affiche la fenêtre. `montantAttendu` (chiffres) : si non vide, le montant retapé doit lui être identique ; `demandePin` : demande aussi le code secret.
     * `surValider(pin)` est appelé seulement quand la saisie est correcte ; `surAnnuler()` sinon. Les champs sont vidés avant la fermeture.
     */
    fun afficher(info: Info, montantAttendu: String?, demandePin: Boolean, surValider: (String) -> Unit, surAnnuler: () -> Unit) {
        val dialogue = Dialog(activite)
        dialogue.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val racine = LinearLayout(activite).apply { orientation = LinearLayout.VERTICAL; background = forme(Color.WHITE, 20) }

        // Bandeau du haut : « Paiement sécurisé » + opérateur
        val bandeau = LinearLayout(activite).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply { setColor(NUIT); cornerRadii = floatArrayOf(dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), 0f, 0f, 0f, 0f) }
        }
        bandeau.addView(texte("🔒 Paiement sécurisé", 18f, Color.WHITE, gras = true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (info.operateur.isNotBlank()) bandeau.addView(texte(info.operateur, 13f, NUIT, gras = true).apply { background = forme(ORANGE, 20); setPadding(dp(12), dp(4), dp(12), dp(4)) })
        racine.addView(bandeau)

        val corps = LinearLayout(activite).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(6), dp(16), dp(16)) }

        // Carte du montant : en gros chiffres puis en lettres
        if (info.montant.isNotBlank()) {
            val carte = bloc(BLEU_CLAIR, BLEU_TRAIT)
            carte.addView(texte("MONTANT À PAYER", 11f, BLEU, gras = true).apply { letterSpacing = 0.12f })
            carte.addView(texte(info.montant, 30f, NUIT, gras = true))
            if (info.lettres.isNotBlank()) carte.addView(texte("( ${info.lettres} )", 15f, GRIS_TEXTE, italique = true))
            corps.addView(carte)
        }
        // Carte du marchand
        if (info.marchand.isNotBlank()) {
            val carte = bloc(GRIS_FOND, GRIS_TRAIT)
            carte.addView(texte("🏪 MARCHAND", 11f, GRIS_TEXTE, gras = true).apply { letterSpacing = 0.12f })
            carte.addView(texte(info.marchand, 18f, Color.parseColor("#0F172A"), gras = true))
            if (info.code.isNotBlank()) carte.addView(texte("code " + info.code, 13f, GRIS_TEXTE).apply { typeface = Typeface.MONOSPACE })
            if (info.service.isNotBlank()) carte.addView(texte(info.service, 12f, GRIS_TEXTE))
            corps.addView(carte)
        }
        if (info.texteLibre.isNotBlank()) corps.addView(bloc(GRIS_FOND, GRIS_TRAIT).apply { addView(texte(info.texteLibre, 15f, Color.parseColor("#0F172A"))) })

        // Avertissement ambre : l'étape à faire
        val attendu = montantAttendu?.filter { it.isDigit() }.orEmpty()
        if (attendu.isNotEmpty()) corps.addView(bloc(AMBRE_FOND, AMBRE_TRAIT).apply {
            addView(texte("⚠ Lisez le montant en lettres, puis retapez-le pour confirmer : une faute (20 000 au lieu de 200 000) coûte cher.", 14f, AMBRE_TEXTE, gras = true))
        })

        // Champ 1 : le montant retapé (cadre bleu) avec retour immédiat
        var actualiserRef: (() -> Unit)? = null
        var champMontant: EditText? = null; var retour: TextView? = null
        if (attendu.isNotEmpty()) {
            corps.addView(texte("✍ Retapez le montant (FCFA)", 14f, NUIT, gras = true).apply { setPadding(0, dp(14), 0, 0) })
            champMontant = champ(BLEU, "Montant", false).also { corps.addView(it) }
            retour = texte(" ", 13f, GRIS_TEXTE, gras = true).apply { gravity = Gravity.CENTER; setPadding(0, dp(4), 0, 0) }.also { corps.addView(it) }
        }
        // Champ 2 : le code secret (cadre orange)
        var champPin: EditText? = null
        // EMPREINTE : si le téléphone a un capteur et que le code secret de cet opérateur est mémorisé, on ne le tape plus : le doigt suffit
        val fragment = activite as? FragmentActivity
        val cleCode = info.operateur.trim().lowercase()                                   // un code secret par opérateur
        val empreinteOk = demandePin && fragment != null && cleCode.isNotEmpty() && Biometrie.disponible(activite)
        var memorise = empreinteOk && Biometrie.codeMemorise(activite, cleCode)
        var caseMemoriser: CheckBox? = null; var blocPin: LinearLayout? = null; var blocEmpreinte: TextView? = null
        if (demandePin) {
            blocPin = LinearLayout(activite).apply { orientation = LinearLayout.VERTICAL }
            blocPin.addView(texte("🔑 Code secret Mobile Money", 14f, AMBRE_TEXTE, gras = true).apply { setPadding(0, dp(12), 0, 0) })
            champPin = champ(ORANGE, "••••", true).also { blocPin.addView(it) }
            if (empreinteOk) caseMemoriser = CheckBox(activite).apply { text = "🖐️ Mémoriser mon code avec mon empreinte"; isChecked = true; setTextColor(VERT) }.also { blocPin.addView(it) }
            blocPin.visibility = if (memorise) View.GONE else View.VISIBLE
            corps.addView(blocPin)
            // Message affiché quand le code est mémorisé (« Utiliser un autre code » = l'oublier pour le retaper)
            blocEmpreinte = texte("🖐️ Votre code secret est mémorisé : après « Envoyer », posez votre doigt.  ✏️ Utiliser un autre code", 14f, VERT, gras = true).apply {
                setPadding(0, dp(12), 0, 0); visibility = if (memorise) View.VISIBLE else View.GONE
            }
            blocEmpreinte.setOnClickListener {
                Biometrie.oublier(activite, cleCode); memorise = false
                blocPin.visibility = View.VISIBLE; blocEmpreinte.visibility = View.GONE; actualiserRef?.invoke()
            }
            corps.addView(blocEmpreinte)
        }
        corps.addView(texte("Un paiement envoyé ne peut pas être annulé par l'application.", 12f, ROUGE).apply { gravity = Gravity.CENTER; setPadding(0, dp(12), 0, dp(4)) })

        // Boutons
        val boutons = LinearLayout(activite).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(8), 0, 0) }
        val annuler = texte("✖ Annuler", 16f, Color.parseColor("#334155"), gras = true).apply {
            gravity = Gravity.CENTER; background = forme(Color.WHITE, 14, Color.parseColor("#94A3B8"), 2); setPadding(dp(8), dp(14), dp(8), dp(14))
        }
        val envoyer = texte("✔ Envoyer", 16f, Color.WHITE, gras = true).apply { gravity = Gravity.CENTER; background = forme(VERT, 14); setPadding(dp(8), dp(14), dp(8), dp(14)) }
        boutons.addView(annuler, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(8) })
        boutons.addView(envoyer, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.4f))
        corps.addView(boutons)
        racine.addView(corps)

        // Retour immédiat et activation du bouton « Envoyer »
        fun montantOk() = attendu.isEmpty() || champMontant?.text?.toString()?.filter { it.isDigit() } == attendu
        fun pinOk() = !demandePin || memorise || (champPin?.text?.length ?: 0) >= 4
        fun actualiser() {
            val tape = champMontant?.text?.toString()?.filter { it.isDigit() }.orEmpty()
            if (attendu.isNotEmpty()) {
                val etat = when { tape.isEmpty() -> 0; tape == attendu -> 1; else -> 2 }
                retour?.text = when (etat) { 1 -> "✔ Montant identique"; 2 -> "✖ Différent du montant à payer"; else -> " " }
                retour?.setTextColor(when (etat) { 1 -> VERT; 2 -> ROUGE; else -> GRIS_TEXTE })
                champMontant?.background = forme(Color.WHITE, 12, when (etat) { 1 -> VERT; 2 -> ROUGE; else -> BLEU }, 3)
            }
            val pret = montantOk() && pinOk()
            envoyer.alpha = if (pret) 1f else 0.4f; envoyer.isEnabled = pret
        }
        val veille = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) = actualiser()
        }
        champMontant?.addTextChangedListener(veille); champPin?.addTextChangedListener(veille)
        actualiserRef = ::actualiser
        actualiser()

        var termine = false
        fun fermer(valider: Boolean, pinMemorise: String? = null) {
            if (termine) return
            termine = true
            val pin = pinMemorise ?: champPin?.text?.toString().orEmpty()
            champMontant?.setText(""); champPin?.setText("")                              // rien ne reste dans les champs
            dialogue.dismiss()
            if (valider) surValider(pin) else surAnnuler()
        }
        envoyer.setOnClickListener {
            if (!(montantOk() && pinOk())) return@setOnClickListener
            when {
                // Code mémorisé : le doigt remplace la saisie ; si l'invite est annulée, la saisie du code reste possible
                demandePin && memorise && fragment != null -> Biometrie.retrouver(fragment, cleCode, { pin -> fermer(true, pin) }, { message ->
                    Toast.makeText(activite, message, Toast.LENGTH_LONG).show()
                    memorise = false; blocPin?.visibility = View.VISIBLE; blocEmpreinte?.visibility = View.GONE; actualiser()
                })
                // Premier usage avec capteur : le code tapé est associé à l'empreinte (enrôlement) puis le paiement continue
                demandePin && empreinteOk && caseMemoriser?.isChecked == true && fragment != null ->
                    Biometrie.memoriser(fragment, cleCode, champPin?.text?.toString().orEmpty(), { Toast.makeText(activite, "🖐️ Code mémorisé avec votre empreinte.", Toast.LENGTH_SHORT).show(); fermer(true) }, { fermer(true) })
                // Pas de code secret à envoyer : le paiement est quand même VALIDÉ par l'empreinte (si le téléphone en a une), après le montant retapé
                !demandePin && fragment != null && Biometrie.disponible(activite) ->
                    Biometrie.verifier(fragment, "Valider le paiement", (if (info.montant.isNotBlank()) info.montant + " " else "") + "Posez votre doigt pour envoyer le paiement",
                        { fermer(true) }, { message -> Toast.makeText(activite, message, Toast.LENGTH_LONG).show() })
                else -> fermer(true)
            }
        }
        annuler.setOnClickListener { fermer(false) }
        dialogue.setOnCancelListener { fermer(false) }

        dialogue.setContentView(ScrollView(activite).apply { addView(racine); isFillViewport = false })
        dialogue.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout((activite.resources.displayMetrics.widthPixels * 0.94f).toInt(), WindowManager.LayoutParams.WRAP_CONTENT)
            setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        }
        dialogue.show()
        champMontant?.requestFocus()
    }
}
