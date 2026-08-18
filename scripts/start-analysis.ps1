$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

function Find-DockerExe {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
        "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
        "$env:ProgramFiles\Docker\Docker\resources\docker.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) {
            return $path
        }
    }
    $cmd = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }
    return $null
}

$docker = Find-DockerExe
if (-not $docker) {
    [System.Windows.Forms.MessageBox]::Show(
        "Docker Desktop executable was not found. Install/start Docker Desktop first.",
        "Stock Agent"
    ) | Out-Null
    exit 1
}

$dockerDir = Split-Path -Parent $docker
$env:Path = "$dockerDir;$env:Path"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    & $docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    [System.Windows.Forms.MessageBox]::Show(
        "Docker Desktop is not running yet. Start Docker Desktop, wait until it is ready, then run this again.",
        "Stock Agent"
    ) | Out-Null
    exit 1
}

Write-Host "Using Docker: $docker"
Write-Host "Building and starting the analysis container..."
& $docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "docker compose up failed. Check Docker Desktop and the project .env DATABASE_URL.",
        "Stock Agent"
    ) | Out-Null
    exit $LASTEXITCODE
}

Write-Host "Analysis container is running in the background."
Start-Sleep -Seconds 4
