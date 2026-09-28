# -----------------------------------------------------------------------
# explorer_aizenta.ps1
# -----------------------------------------------------------------------
# § demande utilisateur (24/09) : "Fais moi un fichier de commande pour
# gérer tout ça. J'ai demandé de me faciliter la tâche avec le moins de
# manipulations" — enchaîne AUTOMATIQUEMENT toutes les tables clés
# identifiées (voir la liste de fichiers .fic fournie), en UN SEUL
# lancement, et regroupe TOUS les résultats dans UN SEUL fichier texte à
# transmettre.
#
# Tous les paramètres de connexion sont passés directement en ligne de
# commande (--server, --port, etc., déjà supportés par Program.cs) —
# AUCUN besoin de toucher appsettings.json, ce qui évite la confusion
# rencontrée plus tôt entre le fichier SOURCE et sa copie dans bin\...
#
# Utilise "dotnet run --project ." (jamais l'exécutable compilé
# directement) : reconstruit TOUJOURS depuis les fichiers source avant
# d'exécuter — élimine tout risque de lancer une vieille copie compilée
# périmée (autre confusion rencontrée plus tôt).
#
# Usage : lancez simplement, DEPUIS CE DOSSIER (HFSQL_SchemaExplorer),
# dans PowerShell :
#   .\explorer_aizenta.ps1
#
# Pour changer un paramètre ponctuellement (rare) :
#   .\explorer_aizenta.ps1 -MotDePasseFichiers "AutreMotDePasse"
# -----------------------------------------------------------------------

param(
    [string]$Serveur = "192.168.100.3",
    [int]$Port = 4900,
    [string]$Base = "myAizenta-SCF",
    [string]$Provider = "PCSoft.HFSQL",
    [string]$Utilisateur = "admin",
    [string]$MotDePasse = "JesusIsMyLord2013",
    [string]$MotDePasseFichiers = "Jesusismylord",
    [string]$FichierSortie = "aizenta_resultats.txt",
    [string[]]$Tables = @("RèglementCaisse", "TypePaiementCaisse", "Règlement", "PièceCaisse_ClientConcerné")
)

# § sortie en UTF-8 de bout en bout (accents des noms de colonnes préservés)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8


if (Test-Path $FichierSortie) {
    Remove-Item $FichierSortie
}

foreach ($table in $Tables) {
    Write-Host "--- Table : $table ---" -ForegroundColor Cyan
    $sortie = dotnet run --project . -- `
        --server $Serveur --port $Port --database $Base --driver $Provider `
        --user $Utilisateur --password $MotDePasse --file-password $MotDePasseFichiers `
        --table $table --sample 3 2>&1 | Out-String
    Write-Host $sortie
    Add-Content -Path $FichierSortie -Value "`n`n===== TABLE : $table =====`n$sortie" -Encoding UTF8
}

Write-Host ""
Write-Host "Terminé. Tous les résultats sont dans : $FichierSortie" -ForegroundColor Green
Write-Host "Envoyez ce fichier pour analyse." -ForegroundColor Green
