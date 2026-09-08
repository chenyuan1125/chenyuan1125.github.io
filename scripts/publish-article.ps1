param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [string]$BaseUrl = "https://ethan-lily.cn",
  [int]$MaxWaitSeconds = 300
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$hugo = Join-Path $root "..\hugo\hugo.exe"
$public = Join-Path $root "public"
$date = Get-Date -Format "yyyy-MM-dd"

function Fail($message) {
  throw "[publish] $message"
}

Write-Host "[publish] validating $Slug"
node (Join-Path $PSScriptRoot "validate-article.mjs") $Slug $date
if ($LASTEXITCODE -ne 0) { Fail "article validation failed" }

if (!(Test-Path $hugo)) { Fail "Hugo executable not found: $hugo" }
if (!(Test-Path (Join-Path $public ".git"))) { Fail "public/.git not found" }

Write-Host "[publish] building site"
& $hugo --gc --cleanDestinationDir
if ($LASTEXITCODE -ne 0) { Fail "Hugo build failed" }

$generatedPage = Join-Path $public "p\$Slug\index.html"
if (!(Test-Path $generatedPage)) { Fail "generated page not found: $generatedPage" }

Push-Location $public
try {
  $status = git status --porcelain
  if ($status) {
    git add -A
    git commit -m "publish: $Slug $date"
    if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }
  } else {
    Write-Host "[publish] no public changes to commit"
  }

  $pushed = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    Write-Host "[publish] push attempt $attempt"
    git push origin master
    if ($LASTEXITCODE -eq 0) { $pushed = $true; break }
    git pull --rebase origin master
    if ($LASTEXITCODE -ne 0) { Fail "git pull --rebase failed while recovering push" }
    Start-Sleep -Seconds (10 * $attempt)
  }
  if (!$pushed) { Fail "git push failed after 3 attempts" }
} finally {
  Pop-Location
}

$articleUrl = "$BaseUrl/p/$Slug/"
$cacheBustedUrl = "$articleUrl`?preview=$([DateTime]::UtcNow.Ticks)"
$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
$online = $false

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $cacheBustedUrl -UseBasicParsing -TimeoutSec 20
    if ($response.StatusCode -eq 200 -and $response.Content -match [regex]::Escape($Slug)) {
      $online = $true
      break
    }
  } catch {
    Write-Host "[publish] waiting for deployment..."
  }
  Start-Sleep -Seconds 10
}

if (!$online) { Fail "online verification failed: $articleUrl" }
Write-Host "[publish] online verification passed: $articleUrl"
