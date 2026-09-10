package com.ouoba.mobilepay.ui.onboarding

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ouoba.mobilepay.data.repository.ProfileRepository
import com.ouoba.mobilepay.data.sync.SyncScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Écran courant du parcours d'accueil (3 étapes, jamais bloquant sur le réseau). */
enum class OnboardingStep { PROFILE, SYNC, WELCOME }

/** État de la tentative de synchro affiché à l'étape 3/3. */
enum class SyncStatus { EN_COURS, REUSSIE, EN_ATTENTE_RESEAU }

data class OnboardingUiState(
    val step: OnboardingStep = OnboardingStep.PROFILE,
    val nom: String = "",
    val prenom: String = "",
    val email: String = "",
    val telephone: String = "",
    val telephoneError: String? = null,
    val syncStatus: SyncStatus = SyncStatus.EN_COURS
)

class OnboardingViewModel(application: Application) : AndroidViewModel(application) {

    private val profileRepository = ProfileRepository(application)
    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState

    fun updateNom(v: String) = _uiState.update { it.copy(nom = v) }
    fun updatePrenom(v: String) = _uiState.update { it.copy(prenom = v) }
    fun updateEmail(v: String) = _uiState.update { it.copy(email = v) }
    fun updateTelephone(v: String) = _uiState.update { it.copy(telephone = v, telephoneError = null) }

    /** Le numéro identifie l'utilisateur (multi-appareils) : seul champ validé avec nom/prénom. */
    fun canSubmitProfile(): Boolean {
        val state = _uiState.value
        return state.nom.isNotBlank() && state.prenom.isNotBlank() && isValidPhone(state.telephone)
    }

    private fun isValidPhone(raw: String): Boolean {
        val digits = raw.filter { it.isDigit() }
        return digits.length in 8..12 // numéros burkinabè (8 chiffres), tolérant un indicatif international
    }

    /**
     * Étape 1 -> 2 : enregistre le profil localement (jamais bloquant) puis tente une
     * synchro best-effort avec un délai maximum, pour ne jamais laisser l'utilisateur
     * bloqué sans réseau (cas des zones rurales). Si la synchro n'aboutit pas à temps,
     * elle est reprogrammée en tâche de fond et l'onboarding se termine quand même.
     */
    fun submitProfile() {
        if (!canSubmitProfile()) {
            _uiState.update { it.copy(telephoneError = "Numéro de téléphone invalide") }
            return
        }
        val state = _uiState.value
        _uiState.update { it.copy(step = OnboardingStep.SYNC, syncStatus = SyncStatus.EN_COURS) }

        viewModelScope.launch {
            val synced = withTimeoutOrNull(4000) {
                profileRepository.saveProfileAndTrySync(
                    nom = state.nom.trim(),
                    prenom = state.prenom.trim(),
                    email = state.email.trim().ifBlank { null },
                    telephone = state.telephone.trim()
                )
            } ?: false

            if (!synced) SyncScheduler.syncNow(getApplication())

            _uiState.update {
                it.copy(
                    syncStatus = if (synced) SyncStatus.REUSSIE else SyncStatus.EN_ATTENTE_RESEAU,
                    step = OnboardingStep.WELCOME
                )
            }
        }
    }
}
