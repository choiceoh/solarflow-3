# ship.ps1 — push + PR + auto-merge 흐름을 한 명령으로.
#
# 사용법 (두 가지):
#   - 권장: .\scripts\ship.cmd [-Title "제목"]
#       (ExecutionPolicy 우회 래퍼 — PowerShell 기본 정책 Restricted 인 머신에서도 동작)
#   - 직접: powershell -ExecutionPolicy Bypass -File .\scripts\ship.ps1 [-Title "제목"]
#
# 동작:
#   1) 현재 브랜치 git push -u origin
#   2) gh pr create --fill (제목·본문 자동, -Title 로 덮어쓰기 가능)
#   3) gh pr merge --auto --merge — CI green 시 자동 머지
#   4) PR URL 출력
#
# 사전 요구:
#   - 현재 브랜치가 main 이 아님 (HEAD 검증)
#   - gh CLI 로그인 (gh auth status)
#   - 작업 단위로 이미 커밋된 상태
#
# auto-merge.yml 의 enable 잡도 같은 일을 하지만 PR open 후 잠깐 lag 이 있어서
# 명시 호출로 즉시 enqueue.

[CmdletBinding()]
param(
    [string]$Title
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 은 BOM 없는 UTF-8 을 ANSI (CP949) 로 읽어 source 문자열이
# 깨지므로 user-facing Write-Host 는 영문만 사용 (코멘트는 영향 없음).
# Output encoding 도 보강 — 자식 프로세스 stdout 처리 안전망.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$branch = (git symbolic-ref --short HEAD).Trim()
if (-not $branch -or $branch -eq 'main') {
    Write-Host "[X] HEAD is not on a feature branch (current: $branch)" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] git push -u origin $branch" -ForegroundColor Cyan
git push -u origin $branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/3] gh pr create" -ForegroundColor Cyan
$createArgs = @('pr', 'create', '--fill')
if ($Title) {
    $createArgs += @('--title', $Title)
}
$prUrl = & gh @createArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[3/3] gh pr merge --auto --merge" -ForegroundColor Cyan
& gh pr merge --auto --merge
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] auto-merge enable failed - PR is open, verify manually" -ForegroundColor Yellow
    Write-Host "    $prUrl"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[OK] $prUrl" -ForegroundColor Green
Write-Host "Auto-merge enabled. Will merge when CI passes; branch auto-deleted (delete_branch_on_merge=true)."
