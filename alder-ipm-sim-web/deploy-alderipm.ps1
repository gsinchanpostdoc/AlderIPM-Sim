<#
  deploy-alderipm.ps1
  One-shot deployer for AlderIPM-Sim. Finds your local clone, copies whichever
  block files are sitting in your downloads folder into the correct sub-paths,
  commits, and pushes to GitHub Pages (main).

  USAGE (from anywhere - the script cd's itself):
      .\deploy-alderipm.ps1
      .\deploy-alderipm.ps1 -Source "C:\Downloads" -Message "Blocks 1-4 + model fixes"
      .\deploy-alderipm.ps1 -Repo "C:\code\AlderIPM-Sim"      # skip the auto-search

  It only copies files that actually exist in -Source, so the SAME script works
  for every future block: just drop the changed files in your downloads folder
  and run it again (optionally with a fresh -Message).
#>

param(
  [string]$Repo    = "",
  [string]$Source  = "C:\Downloads",
  [string]$Message = "AlderIPM-Sim: Blocks 1-4 + model-fidelity fixes"
)

$ErrorActionPreference = "Stop"

# ---- 1. Locate the repo clone -------------------------------------------------
if (-not $Repo) {
  Write-Host "Searching C:\ for your AlderIPM-Sim clone (this can take a minute)..." -ForegroundColor Cyan
  $Repo = Get-ChildItem -Path C:\ -Filter "AlderIPM-Sim" -Directory -Recurse -Depth 5 -ErrorAction SilentlyContinue |
          Where-Object { Test-Path (Join-Path $_.FullName ".git") } |
          Select-Object -First 1 -ExpandProperty FullName
  if (-not $Repo) {
    Write-Host "No local clone found. Cloning fresh to C:\AlderIPM-Sim ..." -ForegroundColor Yellow
    git clone https://github.com/gsinchanpostdoc/AlderIPM-Sim.git C:\AlderIPM-Sim
    $Repo = "C:\AlderIPM-Sim"
  }
}
Set-Location $Repo
Write-Host "Repo:   $Repo" -ForegroundColor Green
Write-Host "Source: $Source" -ForegroundColor Green

# ---- 2. Sanity checks ---------------------------------------------------------
if (-not (Test-Path ".git")) { throw "Not a git repository: $Repo" }
$web = Join-Path $Repo "alder-ipm-sim-web"
if (-not (Test-Path $web)) { throw "Missing 'alder-ipm-sim-web\' inside $Repo" }
git remote -v | Select-Object -First 1 | ForEach-Object { Write-Host "Remote: $_" -ForegroundColor DarkGray }
New-Item -ItemType Directory -Force -Path (Join-Path $web "js"), (Join-Path $web "css") | Out-Null

# ---- 3. File -> destination map (only files present in -Source are copied) -----
$map = [ordered]@{
  "index.html"          = "$web\index.html"
  "theme-v2.css"        = "$web\css\theme-v2.css"
  "model.js"            = "$web\js\model.js"
  "control.js"          = "$web\js\control.js"
  "parameters.js"       = "$web\js\parameters.js"
  "app.js"              = "$web\js\app.js"
  "health.js"           = "$web\js\health.js"
  "scenarios-inline.js" = "$web\js\scenarios-inline.js"
  "cockpit.js"          = "$web\js\cockpit.js"
  "science.js"          = "$web\js\science.js"
}

$copied = 0
foreach ($name in $map.Keys) {
  $src = Join-Path $Source $name
  if (Test-Path $src) {
    Copy-Item $src $map[$name] -Force
    Write-Host ("  + " + $name) -ForegroundColor Gray
    $copied++
  }
}
if ($copied -eq 0) { throw "No matching files found in $Source. Nothing to deploy." }
Write-Host "$copied file(s) staged." -ForegroundColor Green

# ---- 4. Commit & push ---------------------------------------------------------
$changes = git status --porcelain -- alder-ipm-sim-web
if (-not $changes) {
  Write-Host "Working tree already matches - nothing to commit." -ForegroundColor Yellow
  return
}
git add -A alder-ipm-sim-web
git commit -m $Message
git push origin main
Write-Host "`nPushed to origin/main." -ForegroundColor Cyan
Write-Host "Now: open the repo Actions tab, wait for 'pages build and deployment' to go green," -ForegroundColor Cyan
Write-Host "then hard-reload the site with cache disabled (Ctrl+F5)." -ForegroundColor Cyan
