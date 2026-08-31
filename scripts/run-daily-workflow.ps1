param(
  [Parameter(Mandatory = $true)][string]$Slug
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".automation"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "$(Get-Date -Format 'yyyy-MM-dd').log"

try {
  & (Join-Path $PSScriptRoot "publish-article.ps1") -Slug $Slug 2>&1 |
    Tee-Object -FilePath $logFile -Append
  if ($LASTEXITCODE -ne 0) { throw "publish workflow failed" }
  exit 0
} catch {
  $message = "[$(Get-Date -Format o)] $Slug FAILED: $($_.Exception.Message)"
  $message | Tee-Object -FilePath $logFile -Append
  $message | Add-Content -LiteralPath (Join-Path $root ".daily-error.log")
  exit 1
}
