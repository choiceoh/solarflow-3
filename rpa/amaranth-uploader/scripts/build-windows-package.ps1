param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ($OutputPath -eq "") {
  $OutputPath = Join-Path $Root "dist\solarflow-amaranth-rpa-windows.zip"
}

$NodeModules = Join-Path $Root "node_modules\playwright"
$NodeExe = Join-Path $Root "runtime\node\node.exe"

if (!(Test-Path $NodeModules)) {
  throw "node_modules is missing. Run npm ci on the packaging PC, not on the user PC."
}

if (!(Test-Path $NodeExe)) {
  throw "runtime\node\node.exe is missing. Put portable Node.js for Windows in runtime\node before packaging."
}

$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("solarflow-amaranth-rpa-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Temp | Out-Null

try {
  $Include = @(
    "src",
    "windows",
    "node_modules",
    "runtime",
    "package.json",
    "package-lock.json",
    ".env.example",
    "README.md"
  )

  foreach ($Item in $Include) {
    $Source = Join-Path $Root $Item
    if (Test-Path $Source) {
      Copy-Item $Source (Join-Path $Temp $Item) -Recurse -Force
    }
  }

  $OutputDir = Split-Path $OutputPath -Parent
  if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
  }
  if (Test-Path $OutputPath) {
    Remove-Item $OutputPath -Force
  }

  Compress-Archive -Path (Join-Path $Temp "*") -DestinationPath $OutputPath -Force
  Write-Host "Created $OutputPath"
} finally {
  Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
}
