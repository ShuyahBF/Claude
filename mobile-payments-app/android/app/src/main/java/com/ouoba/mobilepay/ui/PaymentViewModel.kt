package com.ouoba.mobilepay.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ouoba.mobilepay.data.model.Merchant
import com.ouoba.mobilepay.data.model.Service
import com.ouoba.mobilepay.data.repository.PaymentRepository
import com.ouoba.mobilepay.util.buildUssdCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Étape courante du parcours de paiement. */
enum class Step { OPERATORS, SERVICES, FORM, CONFIRM }

data class UiState(
    val step: Step = Step.OPERATORS,
    val loading: Boolean = false,
    val error: String? = null,

    val operators: List<String> = emptyList(),
    val selectedOperator: String? = null,

    val services: List<Service> = emptyList(),
    val selectedService: Service? = null,

    // Valeurs saisies par l'utilisateur pour chaque champ du service (clé -> valeur brute).
    val fieldValues: Map<String, String> = emptyMap(),

    // Champ "code marchand" en cours de résolution.
    val merchantFieldKey: String? = null,
    val merchantLookupDone: Boolean = false,
    val merchantFound: Merchant? = null,
    val merchantNotFound: Boolean = false,
    val newMerchantLabel: String = "",

    val ussdCode: String? = null
)

class PaymentViewModel(
    private val repository: PaymentRepository = PaymentRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState

    init {
        loadOperators()
    }

    fun loadOperators() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            runCatching { repository.getOperators() }
                .onSuccess { ops -> _uiState.update { it.copy(loading = false, operators = ops) } }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(loading = false, error = "Impossible de charger les opérateurs : ${e.message}")
                    }
                }
        }
    }

    fun selectOperator(operator: String) {
        _uiState.update { it.copy(selectedOperator = operator, loading = true, error = null) }
        viewModelScope.launch {
            runCatching { repository.getServices(operator) }
                .onSuccess { services ->
                    _uiState.update { it.copy(loading = false, services = services, step = Step.SERVICES) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(loading = false, error = "Impossible de charger les services : ${e.message}")
                    }
                }
        }
    }

    fun selectService(service: Service) {
        _uiState.update {
            it.copy(
                selectedService = service,
                fieldValues = emptyMap(),
                merchantFieldKey = service.fields.firstOrNull { f -> f.isMerchantCode }?.key,
                merchantLookupDone = false,
                merchantFound = null,
                merchantNotFound = false,
                newMerchantLabel = "",
                step = Step.FORM
            )
        }
    }

    fun updateField(key: String, value: String) {
        _uiState.update { state ->
            val updated = state.fieldValues + (key to value)
            // Toute nouvelle saisie du code marchand invalide la précédente recherche.
            val resetLookup = key == state.merchantFieldKey
            state.copy(
                fieldValues = updated,
                merchantLookupDone = if (resetLookup) false else state.merchantLookupDone,
                merchantFound = if (resetLookup) null else state.merchantFound,
                merchantNotFound = if (resetLookup) false else state.merchantNotFound
            )
        }
    }

    fun lookupMerchant() {
        val state = _uiState.value
        val operator = state.selectedOperator ?: return
        val key = state.merchantFieldKey ?: return
        val code = state.fieldValues[key]?.trim().orEmpty()
        if (code.isEmpty()) return

        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            runCatching { repository.findMerchant(operator, code) }
                .onSuccess { merchant ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            merchantLookupDone = true,
                            merchantFound = merchant,
                            merchantNotFound = merchant == null
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(loading = false, error = "Recherche impossible : ${e.message}") }
                }
        }
    }

    fun updateNewMerchantLabel(label: String) {
        _uiState.update { it.copy(newMerchantLabel = label) }
    }

    fun createMerchant() {
        val state = _uiState.value
        val operator = state.selectedOperator ?: return
        val key = state.merchantFieldKey ?: return
        val code = state.fieldValues[key]?.trim().orEmpty()
        val label = state.newMerchantLabel.trim()
        if (code.isEmpty() || label.isEmpty()) return

        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            runCatching { repository.createMerchant(operator, code, label) }
                .onSuccess { merchant ->
                    _uiState.update {
                        it.copy(loading = false, merchantFound = merchant, merchantNotFound = false)
                    }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(loading = false, error = "Création impossible : ${e.message}") }
                }
        }
    }

    /** Vrai quand tous les champs requis sont remplis et que le marchand (le cas échéant) est résolu. */
    fun canConfirm(): Boolean {
        val state = _uiState.value
        val service = state.selectedService ?: return false
        val allFieldsFilled = service.fields.all { field ->
            !state.fieldValues[field.key].isNullOrBlank()
        }
        val merchantResolved = state.merchantFieldKey == null || state.merchantFound != null
        return allFieldsFilled && merchantResolved
    }

    fun confirmAndBuildCode() {
        val state = _uiState.value
        val service = state.selectedService ?: return
        val code = buildUssdCode(service.ussdTemplate, state.fieldValues)
        _uiState.update { it.copy(ussdCode = code, step = Step.CONFIRM) }
    }

    fun backToOperators() {
        _uiState.update { UiState(operators = it.operators) }
    }

    fun backToServices() {
        _uiState.update {
            it.copy(step = Step.SERVICES, selectedService = null, ussdCode = null)
        }
    }

    fun backToForm() {
        _uiState.update { it.copy(step = Step.FORM, ussdCode = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
