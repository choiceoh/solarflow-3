@echo off
setlocal

set "TASK_NAME=SolarFlow Amaranth RPA"

schtasks /Delete /TN "%TASK_NAME%" /F

if "%ERRORLEVEL%"=="0" (
  echo SolarFlow Amaranth automation startup task was removed.
) else (
  echo Startup task was not found or could not be removed.
)

pause
