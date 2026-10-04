param()

$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$releaseRoot = Join-Path $projectRoot "release"
$stagingRoot = Join-Path $projectRoot "tmp\windows-package-output"
$appRoot = Join-Path $stagingRoot "win-unpacked"
$appExecutable = Join-Path $appRoot "OpenResearch.exe"
$iconPath = Join-Path $projectRoot "assets\brand\app-icon.ico"
$builder = Join-Path $projectRoot "node_modules\.bin\electron-builder.cmd"
$appBuilder = Join-Path $projectRoot "node_modules\app-builder-bin\win\x64\app-builder.exe"
$sevenZipDirectory = Join-Path $projectRoot "node_modules\7zip-bin\win\x64"
$workspaceCache = Join-Path $projectRoot "tmp\electron-builder-cache"
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw -Encoding utf8 | ConvertFrom-Json
$version = [string]$package.version
$versionReleaseRoot = Join-Path $releaseRoot ("V{0}" -f $version)
$portableArchive = Join-Path $versionReleaseRoot ("OpenResearch Portable {0}.zip" -f $version)

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw ("{0} (exit code {1})" -f $FailureMessage, $LASTEXITCODE) }
}

function Invoke-CheckedWithRetry([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
  $lastExitCode = 1
  for ($attempt = 1; $attempt -le 8; $attempt += 1) {
    & $FilePath @Arguments
    $lastExitCode = $LASTEXITCODE
    if ($lastExitCode -eq 0) { return }
    Start-Sleep -Milliseconds (500 * $attempt)
  }
  throw ("{0} (exit code {1}, after retries)" -f $FailureMessage, $lastExitCode)
}

function Compress-ArchiveWithRetry([string]$SourcePath, [string]$DestinationPath) {
  $lastError = $null
  for ($attempt = 1; $attempt -le 8; $attempt += 1) {
    try {
      Compress-Archive -Path $SourcePath -DestinationPath $DestinationPath -CompressionLevel Optimal -Force
      return
    } catch {
      $lastError = $_
      if (Test-Path -LiteralPath $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Force -ErrorAction SilentlyContinue
      }
      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
  throw $lastError
}

function Find-Rcedit {
  $roots = @($workspaceCache)
  if ($env:LOCALAPPDATA) { $roots += Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign" }
  $candidates = foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Filter "rcedit-x64.exe" -File -Recurse -ErrorAction SilentlyContinue
    }
  }
  return $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $versionReleaseRoot, $workspaceCache | Out-Null
$rcedit = Find-Rcedit
if (-not $rcedit) {
  $previousCache = $env:ELECTRON_BUILDER_CACHE
  $previousPath = $env:Path
  try {
    $env:ELECTRON_BUILDER_CACHE = $workspaceCache
    $env:Path = "$sevenZipDirectory;$previousPath"
    & $appBuilder download-artifact --name winCodeSign
  } finally {
    $env:ELECTRON_BUILDER_CACHE = $previousCache
    $env:Path = $previousPath
  }
  $rcedit = Find-Rcedit
}
if (-not $rcedit) { throw "Unable to locate rcedit after preparing the electron-builder icon tools" }

Invoke-Checked $builder @("--publish", "never", "--win", "dir", "--config.directories.output=$stagingRoot") "Failed to assemble the Windows application directory"
# rcedit cannot reliably commit resources when the executable path contains Unicode.
Copy-Item -LiteralPath $iconPath -Destination (Join-Path $appRoot "package-icon.ico") -Force
Push-Location $appRoot
try {
  Invoke-CheckedWithRetry $rcedit.FullName @("OpenResearch.exe", "--set-icon", "package-icon.ico") "Failed to embed the application icon"
} finally {
  Remove-Item -LiteralPath "package-icon.ico" -Force -ErrorAction SilentlyContinue
  Pop-Location
}
Invoke-Checked $builder @("--publish", "never", "--win", "nsis", "--prepackaged", $appRoot, "--config.directories.output=$versionReleaseRoot") "Failed to build the Windows installer"
Compress-ArchiveWithRetry (Join-Path $appRoot "*") $portableArchive

Write-Output ([pscustomobject]@{
  Application = $appExecutable
  Installer = Join-Path $versionReleaseRoot ("OpenResearch Setup {0}.exe" -f $version)
  Portable = $portableArchive
  Icon = $iconPath
})
