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
# Windows PowerShell 5.1 의 기본 콘솔 인코딩이 CP949 라 한글 출력이 깨진다.
# ship.cmd 에서 chcp 65001 도 하지만, 직접 .ps1 호출 경우도 커버.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$branch = (git symbolic-ref --short HEAD).Trim()
if (-not $branch -or $branch -eq 'main') {
    Write-Host "[X] HEAD 가 작업 브랜치가 아님 (현재: $branch)" -ForegroundColor Red
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
    Write-Host "[!] auto-merge 활성화 실패 — PR 은 만들어졌으니 수동 확인" -ForegroundColor Yellow
    Write-Host "    $prUrl"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[OK] $prUrl" -ForegroundColor Green
Write-Host "CI green 시 자동 머지 + 브랜치 자동 삭제 (delete_branch_on_merge=true)"
