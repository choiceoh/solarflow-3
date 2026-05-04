# SolarFlow backend dev helper (Windows / PowerShell)
# Usage: cd backend; .\scripts\dev.ps1
# Loads backend/.env into the current process and runs the backend.
# If air is installed, uses it for auto-reload on file save.
# Otherwise falls back to `go run .` — Ctrl+C to stop, Up + Enter to re-run.
# See harness/WINDOWS.md for details.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Resolve-Path (Join-Path $scriptDir '..')
Set-Location $backendRoot

$envFile = Join-Path $backendRoot '.env'
if (-not (Test-Path $envFile)) {
    Write-Host "backend/.env not found. See harness/WINDOWS.md to create it." -ForegroundColor Red
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

if (-not $env:SOLARFLOW_FILE_ROOT) {
    $env:SOLARFLOW_FILE_ROOT = 'C:\SolarFlow\files'
}
New-Item -ItemType Directory -Force -Path $env:SOLARFLOW_FILE_ROOT | Out-Null

$hasAir = $null -ne (Get-Command air -ErrorAction SilentlyContinue)

if ($hasAir) {
    Write-Host "backend dev starting (port 8080, auto-reload via air) - Ctrl+C to stop" -ForegroundColor Cyan
    air
} else {
    Write-Host "backend dev starting (port 8080) - Ctrl+C to stop" -ForegroundColor Cyan
    Write-Host "tip: 'go install github.com/air-verse/air@latest' for auto-reload on save" -ForegroundColor DarkGray
    go run .
}
