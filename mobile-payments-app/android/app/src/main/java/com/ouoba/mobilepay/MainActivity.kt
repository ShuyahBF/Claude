package com.ouoba.mobilepay

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.remote.PresenceSawali
import com.ouoba.mobilepay.data.repository.ProfileRepository
import com.ouoba.mobilepay.ui.PaymentViewModel
import com.ouoba.mobilepay.ui.Step
import com.ouoba.mobilepay.ui.UiState
import com.ouoba.mobilepay.ui.onboarding.OnboardingFlow
import com.ouoba.mobilepay.util.URL_CONFIDENTIALITE
import com.ouoba.mobilepay.util.openDialerWithUssd
import com.ouoba.mobilepay.util.ouvrirDansNavigateur

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Lot 16 — Android 15 (targetSdk 35) impose l'affichage « bord à bord » : l'app dessine
        // aussi sous la barre d'état (heure, batterie) et sous la barre de navigation.
        // enableEdgeToEdge() rend ces barres transparentes ; les marges qui évitent d'écrire
        // dessous sont gérées par les Scaffold (TopAppBar + « padding » transmis au contenu).
        // Style « clair » imposé : l'app est toujours en thème clair, donc icônes sombres
        // dans les barres système, même si le téléphone est en mode sombre.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        )
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    // Un seul mode depuis le lot 16 : ouvrir le composeur avec le code pré-rempli
                    RootApp(onOpenDialer = { code -> openDialerWithUssd(this, code) })
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Présence auprès de SAWALI (règle 4) : au lancement puis au plus toutes les 5 minutes
        // quand l'app revient au premier plan. Envoi en arrière-plan, jamais bloquant.
        PresenceSawali.signaler(applicationContext)
    }
}

/**
 * Point d'entrée de l'UI : affiche l'accueil (3 étapes) une seule fois, tant qu'aucun
 * profil n'est encore enregistré localement, puis bascule sur le parcours de paiement.
 * La vérification (lecture Room) est locale et quasi instantanée, jamais de dépendance
 * réseau à cet endroit.
 */
@Composable
fun RootApp(onOpenDialer: (String) -> Unit) {
    val context = LocalContext.current
    // null = vérification en cours, true = accueil à afficher, false = profil déjà présent
    var showOnboarding by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(Unit) {
        showOnboarding = !ProfileRepository(context).hasProfile()
    }

    when (showOnboarding) {
        null -> CenteredLoader()
        true -> OnboardingFlow(onFinished = { showOnboarding = false })
        false -> PaymentApp(onOpenDialer = onOpenDialer)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PaymentApp(
    viewModel: PaymentViewModel = viewModel(),
    onOpenDialer: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    // Fenêtre « À propos » (mention de non-affiliation + politique de confidentialité)
    var aProposVisible by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            // La TopAppBar de Material 3 ajoute d'elle-même la hauteur de la barre d'état (bord à bord)
            TopAppBar(
                title = { Text(titleFor(state.step)) },
                actions = { TextButton(onClick = { aProposVisible = true }) { Text("À propos") } }
            )
        }
    ) { padding ->
        // « padding » = hauteur de la barre du haut + barre de navigation du bas (insets système) ;
        // consumeWindowInsets évite de compter deux fois ces marges, imePadding remonte le contenu
        // au-dessus du clavier virtuel quand il s'ouvre.
        Box(
            modifier = Modifier
                .padding(padding)
                .consumeWindowInsets(padding)
                .imePadding()
                .fillMaxSize()
        ) {
            when (state.step) {
                Step.OPERATORS -> OperatorScreen(
                    operators = state.operators,
                    loading = state.loading,
                    onSelect = viewModel::selectOperator
                )
                Step.SERVICES -> ServiceScreen(
                    services = state.services,
                    loading = state.loading,
                    onSelect = viewModel::selectService,
                    onBack = viewModel::backToOperators
                )
                Step.FORM -> FormScreen(viewModel = viewModel)
                Step.CONFIRM -> ConfirmScreen(
                    ussdCode = state.ussdCode.orEmpty(),
                    serviceName = state.selectedService?.name.orEmpty(),
                    onOpenDialer = onOpenDialer,
                    onBack = viewModel::backToForm
                )
            }

            state.error?.let { message ->
                AlertDialog(
                    onDismissRequest = viewModel::clearError,
                    confirmButton = { TextButton(onClick = viewModel::clearError) { Text("OK") } },
                    title = { Text("Erreur") },
                    text = { Text(message) }
                )
            }

            if (aProposVisible) {
                AProposDialog(onDismiss = { aProposVisible = false })
            }
        }
    }
}

/** Mention de non-affiliation, imposée par les règles du Play Store (noms d'opérateurs cités). */
const val MENTION_NON_AFFILIATION =
    "Paiement Mobile n'est affilié ni à Orange, ni à Moov Africa, ni à Telecel Faso ; " +
        "les marques citées appartiennent à leurs propriétaires."

/**
 * Fenêtre « À propos » (lot 16) : rôle de l'app, mention de non-affiliation, version,
 * contact officiel et lien vers la politique de confidentialité (ouverte dans le navigateur).
 */
@Composable
fun AProposDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("À propos") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Raccourcis Paiement Mobile — version ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleSmall)
                Text(
                    "L'application prépare le code USSD et ouvre le composeur de votre téléphone. " +
                        "Elle ne réalise aucune transaction et ne demande jamais votre code secret : " +
                        "le paiement est traité par le réseau de votre opérateur.",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(MENTION_NON_AFFILIATION, style = MaterialTheme.typography.bodySmall)
                Text(
                    "Contact : contact@sawalismartsystems.com · +226 25 65 81 65",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { ouvrirDansNavigateur(context, URL_CONFIDENTIALITE) }) {
                Text("Politique de confidentialité")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } }
    )
}

private fun titleFor(step: Step): String = when (step) {
    Step.OPERATORS -> "Choisir un opérateur"
    Step.SERVICES -> "Choisir un service"
    Step.FORM -> "Détails du paiement"
    Step.CONFIRM -> "Confirmation"
}

@Composable
fun OperatorScreen(operators: List<String>, loading: Boolean, onSelect: (String) -> Unit) {
    if (loading) {
        CenteredLoader()
        return
    }
    val context = LocalContext.current
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(operators) { operator ->
            ListItem(
                headlineContent = { Text(operator) },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(operator) }
                    .padding(horizontal = 8.dp)
            )
        }
        // Bas de l'accueil (lot 16) : mention de non-affiliation + lien vers la confidentialité
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    MENTION_NON_AFFILIATION,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                TextButton(onClick = { ouvrirDansNavigateur(context, URL_CONFIDENTIALITE) }) {
                    Text("Politique de confidentialité")
                }
            }
        }
    }
}

@Composable
fun ServiceScreen(
    services: List<Service>,
    loading: Boolean,
    onSelect: (Service) -> Unit,
    onBack: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        TextButton(onClick = onBack) { Text("< Changer d'opérateur") }
        if (loading) {
            CenteredLoader()
        } else {
            LazyColumn {
                items(services) { service ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text(service.name, style = MaterialTheme.typography.titleMedium)
                        if (service.description.isNotBlank()) {
                            Text(service.description, style = MaterialTheme.typography.bodySmall)
                        }
                        Button(onClick = { onSelect(service) }, modifier = Modifier.padding(top = 4.dp)) {
                            Text("Utiliser ce service")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FormScreen(viewModel: PaymentViewModel) {
    val state by viewModel.uiState.collectAsState()
    val service = state.selectedService ?: return

    // verticalScroll : le formulaire défile si le clavier ou un petit écran manque de place
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TextButton(onClick = viewModel::backToServices) { Text("< Changer de service") }
        Text(service.name, style = MaterialTheme.typography.titleLarge)

        service.fields.forEach { field ->
            OutlinedTextField(
                value = state.fieldValues[field.key].orEmpty(),
                onValueChange = { viewModel.updateField(field.key, it) },
                label = { Text(field.label) },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = if (field.type == "numeric") KeyboardType.Number else KeyboardType.Text
                ),
                modifier = Modifier.fillMaxWidth()
            )

            if (field.isMerchantCode) {
                MerchantResolutionBlock(state = state, viewModel = viewModel, fieldKey = field.key)
            }
        }

        Button(
            onClick = viewModel::confirmAndBuildCode,
            enabled = viewModel.canConfirm(),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continuer") }

        if (state.loading) CenteredLoader()
    }
}

@Composable
private fun MerchantResolutionBlock(state: UiState, viewModel: PaymentViewModel, fieldKey: String) {
    val code = state.fieldValues[fieldKey].orEmpty()

    Column {
        Button(
            onClick = viewModel::lookupMerchant,
            enabled = code.isNotBlank() && !state.loading
        ) { Text("Vérifier le code marchand") }

        when {
            state.merchantFound != null -> Text(
                "Marchand : ${state.merchantFound.label}",
                color = MaterialTheme.colorScheme.primary
            )
            state.merchantNotFound -> Column {
                Text(
                    "Ce code marchand n'existe pas encore. Donnez-lui un nom :",
                    color = MaterialTheme.colorScheme.error
                )
                OutlinedTextField(
                    value = state.newMerchantLabel,
                    onValueChange = viewModel::updateNewMerchantLabel,
                    label = { Text("Nom du marchand (lettres et chiffres)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = viewModel::createMerchant,
                    enabled = state.newMerchantLabel.isNotBlank()
                ) { Text("Enregistrer ce marchand") }
            }
        }
    }
}

@Composable
fun ConfirmScreen(
    ussdCode: String,
    serviceName: String,
    onOpenDialer: (String) -> Unit,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        TextButton(onClick = onBack) { Text("< Modifier") }
        Text(serviceName, style = MaterialTheme.typography.titleLarge)
        Text("Code à composer :", style = MaterialTheme.typography.bodyMedium)
        Text(ussdCode, style = MaterialTheme.typography.headlineSmall)

        // Lot 16 : un seul bouton — ouvre le composeur avec le code pré-rempli (aucune permission)
        Button(onClick = { onOpenDialer(ussdCode) }, modifier = Modifier.fillMaxWidth()) {
            Text("Composer le code")
        }
        Text(
            "Le clavier de votre téléphone s'ouvre avec le code déjà saisi : vérifiez-le puis appuyez " +
                "vous-même sur Appeler. Votre code secret Mobile Money se saisit ensuite sur le menu " +
                "de l'opérateur ; l'application ne le voit jamais.",
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun CenteredLoader() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}
