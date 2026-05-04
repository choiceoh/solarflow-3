# dev-all.ps1 — Windows 개발 환경 3개 터미널 일괄 기동.
# 사용법: 프로젝트 루트에서 .\scripts\dev-all.ps1
#
# 각각 새 PowerShell 창에서 실행:
#   1. backend  (포트 8080) — backend/scripts/dev.ps1
#   2. engine   (포트 8081) — engine/scripts/dev.ps1
#   3. frontend (포트 5174) — npm run dev
#
# Ctrl+C 는 각 창에서 개별. 전체 종료는 창 닫기.
# 사전 요구: backend/.env, engine/.env, frontend/.env, frontend/node_modules.
# (harness/WINDOWS.md 의 사전 요구사항 절 참조)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')
Set-Location $repoRoot

function Test-File($path, $hint) {
    if (-not (Test-Path $path)) {
        Write-Host "missing: $path" -ForegroundColor Red
        Write-Host "  $hint" -ForegroundColor DarkGray
        return $false
    }
    return $true
}

$ok = $true
$ok = (Test-File 'backend/.env' 'see harness/WINDOWS.md (backend/.env section)') -and $ok
$ok = (Test-File 'engine/.env' 'see harness/WINDOWS.md (engine envs)') -and $ok
$ok = (Test-File 'frontend/.env' 'see harness/WINDOWS.md (frontend/.env section)') -and $ok
$ok = (Test-File 'frontend/node_modules' "run 'cd frontend; npm install' first") -and $ok

if (-not $ok) {
    Write-Host "fix the above before running dev-all.ps1" -ForegroundColor Red
    exit 1
}

$shell = (Get-Process -Id $PID).Path  # pwsh.exe or powershell.exe — match parent

Write-Host "starting 3 terminals (backend / engine / frontend)..." -ForegroundColor Cyan

Start-Process $shell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\backend'; .\scripts\dev.ps1"
Start-Process $shell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\engine'; .\scripts\dev.ps1"
Start-Process $shell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\frontend'; npm run dev -- --port 5174"

Write-Host "all three started. browser: http://localhost:5174" -ForegroundColor Green
