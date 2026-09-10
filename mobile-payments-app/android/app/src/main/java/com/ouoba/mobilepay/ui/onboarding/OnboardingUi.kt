package com.ouoba.mobilepay.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Parcours d'accueil en 3 étapes, affiché une seule fois (tant qu'aucun profil local
 * n'existe, voir RootApp dans MainActivity.kt). Aucune étape ne bloque sur le réseau :
 * la synchronisation (étape 2/3) est toujours best-effort avec un délai maximum.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingFlow(
    viewModel: OnboardingViewModel = viewModel(),
    onFinished: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(topBar = { TopAppBar(title = { Text(titleFor(state.step)) }) }) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize().padding(24.dp)) {
            when (state.step) {
                OnboardingStep.PROFILE -> ProfileStep(state, viewModel)
                OnboardingStep.SYNC -> SyncStep()
                OnboardingStep.WELCOME -> WelcomeStep(state, onFinished)
            }
        }
    }
}

private fun titleFor(step: OnboardingStep): String = when (step) {
    OnboardingStep.PROFILE -> "Bienvenue — étape 1/3"
    OnboardingStep.SYNC -> "Synchronisation — étape 2/3"
    OnboardingStep.WELCOME -> "C'est prêt — étape 3/3"
}

@Composable
private fun ProfileStep(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Quelques informations pour personnaliser l'application.",
            style = MaterialTheme.typography.bodyMedium
        )
        OutlinedTextField(
            value = state.nom,
            onValueChange = viewModel::updateNom,
            label = { Text("Nom") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = state.prenom,
            onValueChange = viewModel::updatePrenom,
            label = { Text("Prénom") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = state.telephone,
            onValueChange = viewModel::updateTelephone,
            label = { Text("Numéro de téléphone") },
            singleLine = true,
            isError = state.telephoneError != null,
            supportingText = { state.telephoneError?.let { Text(it) } },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth()
        )
        // Email volontairement facultatif : peu fiable en zone rurale, ne doit jamais bloquer l'accueil.
        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::updateEmail,
            label = { Text("Email (facultatif)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            onClick = viewModel::submitProfile,
            enabled = state.nom.isNotBlank() && state.prenom.isNotBlank() && state.telephone.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continuer") }
    }
}

@Composable
private fun SyncStep() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text("Synchronisation de votre profil en cours...", style = MaterialTheme.typography.bodyMedium)
        Text(
            "L'application reste utilisable même sans réseau : la synchronisation continuera " +
                "automatiquement dès qu'une connexion sera disponible.",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}

@Composable
private fun WelcomeStep(state: OnboardingUiState, onFinished: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Bienvenue, ${state.prenom} !", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            when (state.syncStatus) {
                SyncStatus.REUSSIE -> "Profil synchronisé ✓"
                SyncStatus.EN_ATTENTE_RESEAU -> "Profil enregistré sur l'appareil — synchronisation en attente de réseau ⏳"
                SyncStatus.EN_COURS -> "Profil enregistré sur l'appareil"
            },
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onFinished, modifier = Modifier.fillMaxWidth()) { Text("Commencer") }
    }
}
