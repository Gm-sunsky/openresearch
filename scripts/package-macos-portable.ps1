param(
  [ValidateSet("arm64", "x64", "all")]
  [string]$Architecture = "all"
)

$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packagePath = Join-Path $projectRoot "package.json"
$package = Get-Content -LiteralPath $packagePath -Raw -Encoding utf8 | ConvertFrom-Json
$version = [string]$package.version
$electronVersion = [string]((Get-Content -LiteralPath (Join-Path $projectRoot "node_modules\electron\package.json") -Raw -Encoding utf8 | ConvertFrom-Json).version)
$releaseRoot = Join-Path $projectRoot "release"
$versionReleaseRoot = Join-Path $releaseRoot ("V{0}" -f $version)
$workRoot = Join-Path $projectRoot "tmp\macos-portable"
$packagerPath = Join-Path $PSScriptRoot "package-macos-portable.py"
$architectures = if ($Architecture -eq "all") { @("arm64", "x64") } else { @($Architecture) }

$resolvedProject = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedWork = [System.IO.Path]::GetFullPath($workRoot)
if (-not $resolvedWork.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The macOS staging directory must stay inside the project workspace"
}

New-Item -ItemType Directory -Path $versionReleaseRoot -Force | Out-Null
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw ("{0} (exit code {1})" -f $FailureMessage, $LASTEXITCODE) }
}

foreach ($arch in $architectures) {
  $runtimeZip = Join-Path $workRoot ("electron-v{0}-darwin-{1}.zip" -f $electronVersion, $arch)
  $runtimeUrl = "https://github.com/electron/electron/releases/download/v{0}/electron-v{0}-darwin-{1}.zip" -f $electronVersion, $arch
  $artifactPath = Join-Path $versionReleaseRoot ("OpenResearch macOS {0} {1}.zip" -f $arch, $version)

  if (-not (Test-Path -LiteralPath $runtimeZip)) {
    Invoke-WebRequest -Uri $runtimeUrl -OutFile $runtimeZip
  }
  if (Test-Path -LiteralPath $artifactPath) { Remove-Item -LiteralPath $artifactPath -Force }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) { $python = Get-Command python3 -ErrorAction SilentlyContinue }
  if (-not $python) { throw "Python 3 is required to preserve macOS ZIP metadata" }
  Invoke-Checked $python.Source @($packagerPath, $runtimeZip, $artifactPath, $projectRoot, $version, $arch) "Failed to create the macOS portable ZIP"

  $hash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash
  Write-Output ([pscustomobject]@{
    Architecture = $arch
    Artifact = $artifactPath
    SizeBytes = (Get-Item -LiteralPath $artifactPath).Length
    SHA256 = $hash
  })
}
