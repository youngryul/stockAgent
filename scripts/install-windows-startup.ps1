$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$startScript = Join-Path $scriptDir "start-analysis.vbs"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "StockAgentAnalysis.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$shortcut.Arguments = "`"$startScript`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Stock Agent Docker analysis"
$shortcut.Save()

Write-Host "Startup shortcut created:"
Write-Host $shortcutPath
Write-Host ""
Write-Host "Starting analysis container now..."
& (Join-Path $scriptDir "start-analysis.ps1")

Write-Host ""
Write-Host "Done. Also turn on:"
Write-Host "  Docker Desktop -> Settings -> General -> Start Docker Desktop when you log in"
Write-Host "  Set DATABASE_URL in the project .env to your Supabase URI"
Start-Sleep -Seconds 8
