@echo off
REM ship.cmd - ExecutionPolicy bypass wrapper for ship.ps1.
REM Works in default PowerShell (Restricted policy) environments.
REM Also sets console codepage to UTF-8 (65001) so script output renders Korean correctly.
REM Usage: .\scripts\ship.cmd [-Title "Title"]
REM Note: keep this file ASCII-only — cmd.exe parses batch as system ANSI (CP949 on KR
REM Windows), and UTF-8 bytes in comments here would mis-parse into bogus command tokens.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ship.ps1" %*
