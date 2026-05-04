# SolarFlow calc engine dev helper (Windows / PowerShell)
# Usage: cd engine; .\scripts\dev.ps1
# Loads engine/.env into the current process and runs the engine.
# By default uses debug profile (faster builds). Set RELEASE=1 for release.
# If cargo-watch is installed, uses it for auto-reload on file save.
# See harness/WINDOWS.md for details.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineRoot = Resolve-Path (Join-Path $scriptDir '..')
Set-Location $engineRoot

$envFile = Join-Path $engineRoot '.env'
if (-not (Test-Path $envFile)) {
    Write-Host "engine/.env not found. See harness/WINDOWS.md to create it." -ForegroundColor Red
    exit 1
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    Set-Item -Path "env:$key" -Value $val
}

$port = if ($env:PORT) { $env:PORT } else { '8081' }
$useRelease = $env:RELEASE -eq '1'
$cargoArgs = if ($useRelease) { @('run', '--release') } else { @('run') }
$profile = if ($useRelease) { 'release' } else { 'debug' }

$hasCargoWatch = $null -ne (Get-Command cargo-watch -ErrorAction SilentlyContinue)

if ($hasCargoWatch) {
    Write-Host "engine dev starting (port $port, $profile, auto-reload via cargo-watch) - Ctrl+C to stop" -ForegroundColor Cyan
    $watchArgs = @('-x', ($cargoArgs -join ' '))
    & cargo-watch @watchArgs
} else {
    Write-Host "engine dev starting (port $port, $profile) - Ctrl+C to stop" -ForegroundColor Cyan
    Write-Host "tip: 'cargo install cargo-watch' for auto-reload on save" -ForegroundColor DarkGray
    & cargo @cargoArgs
}
