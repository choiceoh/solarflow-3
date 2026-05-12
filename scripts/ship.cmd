@echo off
:: ship.cmd — ship.ps1 의 ExecutionPolicy 우회 래퍼.
:: 기본 PowerShell ExecutionPolicy (Restricted) 환경에서도 바로 실행 가능.
:: chcp 65001 = UTF-8 codepage (한글 출력 mojibake 방지)
:: 사용: .\scripts\ship.cmd [-Title "제목"]
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ship.ps1" %*
