$ErrorActionPreference = "Stop"

$repo = "C:\Users\udiiu\OneDrive\Documents\wigolink\v1"
$git = "C:\Program Files\Git\cmd\git.exe"

function Stop-WithMessage {
    param([string]$Message)

    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host ""
    Read-Host "Appuyez sur Entree pour fermer"
    exit 1
}

try {
    if (-not (Test-Path -LiteralPath $repo)) {
        Stop-WithMessage "Depot Wigolink introuvable : $repo"
    }

    if (-not (Test-Path -LiteralPath $git)) {
        Stop-WithMessage "Git est introuvable sur cet ordinateur."
    }

    Set-Location -LiteralPath $repo
    Write-Host "Wigolink - contribution GitHub" -ForegroundColor Cyan
    Write-Host "Verification du depot..."

    & $git rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Le dossier Wigolink n'est pas reconnu comme depot Git."
    }

    $branch = (& $git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
        Stop-WithMessage "Le depot doit etre sur la branche main. Branche actuelle : $branch"
    }

    # Un push vide ne doit jamais embarquer les fichiers de travail non suivis
    # (notamment le projet Android en cours). On bloque uniquement les fichiers
    # deja suivis qui ont ete modifies ou stages.
    $trackedChanges = (& $git status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Impossible de verifier l'etat du depot."
    }
    if ($trackedChanges) {
        Stop-WithMessage "Des fichiers sont modifies. Aucun fichier n'a ete touche. Demandez a Codex de synchroniser le depot, puis recommencez."
    }

    Write-Host "Synchronisation avec GitHub..."
    & $git fetch origin main
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Connexion a GitHub impossible. Verifiez Internet et votre connexion GitHub."
    }

    & $git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "La branche ne peut pas etre synchronisee automatiquement. Aucun fichier n'a ete modifie."
    }

    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    & $git commit --allow-empty -m "Keep development activity current ($date)"
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Le commit vide n'a pas pu etre cree."
    }

    & $git push origin main
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Le commit existe localement, mais GitHub a refuse le push. Demandez a Codex de le synchroniser."
    }

    $commit = (& $git rev-parse --short HEAD).Trim()
    Write-Host ""
    Write-Host "Succes : contribution envoyee sur GitHub ($commit)." -ForegroundColor Green
    Write-Host "Aucun fichier du projet n'a ete ajoute au commit."
    Write-Host ""
    Read-Host "Appuyez sur Entree pour fermer"
}
catch {
    Stop-WithMessage "Erreur inattendue : $($_.Exception.Message)"
}
