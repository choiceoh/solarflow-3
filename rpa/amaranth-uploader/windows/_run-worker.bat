@echo off
setlocal

set "APP_DIR=%~dp0.."
set "NODE_EXE=%APP_DIR%\runtime\node\node.exe"

if not exist "%NODE_EXE%" (
  for %%N in (node.exe) do set "NODE_EXE=%%~$PATH:N"
)

if "%NODE_EXE%"=="" (
  echo SolarFlow Amaranth automation cannot find Node runtime.
  echo Please reinstall the automation package.
  pause
  exit /b 1
)

pushd "%APP_DIR%"
"%NODE_EXE%" "%APP_DIR%\src\worker.js" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Automation stopped with error code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
