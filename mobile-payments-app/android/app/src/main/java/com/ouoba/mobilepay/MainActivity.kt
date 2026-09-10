package com.ouoba.mobilepay

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.ui.PaymentViewModel
import com.ouoba.mobilepay.ui.Step
import com.ouoba.mobilepay.ui.UiState
import com.ouoba.mobilepay.util.callUssdDirectly
import com.ouoba.mobilepay.util.openDialerWithUssd

class MainActivity : ComponentActivity() {

    private var pendingUssdCode: String? = null

    private val requestCallPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val code = pendingUssdCode
        pendingUssdCode = null
        if (granted && code != null) {
            callUssdDirectly(this, code)
        } else if (code != null) {
            openDialerWithUssd(this, code)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    PaymentApp(
                        onOpenDialer = { code -> openDialerWithUssd(this, code) },
                        onCallDirectly = { code ->
                            pendingUssdCode = code
                            requestCallPermission.launch(android.Manifest.permission.CALL_PHONE)
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentApp(
    viewModel: PaymentViewModel = viewModel(),
    onOpenDialer: (String) -> Unit,
    onCallDirectly: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(titleFor(state.step)) })
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
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
                    onCallDirectly = onCallDirectly,
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
        }
    }
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

    Column(
        modifier = Modifier
            .fillMaxSize()
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
    onCallDirectly: (String) -> Unit,
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

        Button(onClick = { onOpenDialer(ussdCode) }, modifier = Modifier.fillMaxWidth()) {
            Text("Ouvrir dans le composeur")
        }
        OutlinedButton(onClick = { onCallDirectly(ussdCode) }, modifier = Modifier.fillMaxWidth()) {
            Text("Appeler directement")
        }
        Text(
            "\"Ouvrir dans le composeur\" pré-remplit le clavier d'appel : vous appuyez vous-même sur Appeler. " +
                "\"Appeler directement\" compose immédiatement le code (autorisation d'appel requise).",
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
