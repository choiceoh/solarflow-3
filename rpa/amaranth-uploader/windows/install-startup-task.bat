@echo off
setlocal

set "TASK_NAME=SolarFlow Amaranth RPA"
set "WATCH_SCRIPT=%~dp0run-watch.bat"

schtasks /Create /TN "%TASK_NAME%" /TR "\"%WATCH_SCRIPT%\"" /SC ONLOGON /F

if "%ERRORLEVEL%"=="0" (
  echo SolarFlow Amaranth automation will start when Windows signs in.
) else (
  echo Failed to register startup task.
)

pause
