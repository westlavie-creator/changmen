<#
.SYNOPSIS
  Gamebet dev launcher + live status dashboard

.PARAMETER Mode
  dev      (default) backend + Vite
  parity   backend (ESPORT_BRIDGE=0 ENABLE_OB=0) + Vite
  backend  backend only
  vite     Vite only
  status   live dashboard (polls /api/snapshot, Ctrl+C to exit)

.PARAMETER BackendPort  Default 3456
.PARAMETER AppPort      Default 5174
.PARAMETER Proxy        e.g. http://127.0.0.1:7890
.PARAMETER NoBrowser    Do not open browser after start
.PARAMETER Interval     status mode refresh interval in seconds (default 3)

.EXAMPLE
  .\dev.ps1
  .\dev.ps1 -Mode parity
  .\dev.ps1 -Mode status
  .\dev.ps1 -Mode status -Interval 5
  .\dev.ps1 -Mode backend
  .\dev.ps1 -Proxy http://127.0.0.1:7890
#>
param(
  [ValidateSet("dev","parity","backend","vite","status")]
  [string]$Mode = "dev",
  [int]$BackendPort = 3456,
  [int]$AppPort     = 5174,
  [string]$Proxy    = "",
  [switch]$NoBrowser,
  [int]$Interval    = 3
)

$ErrorActionPreference = "Continue"

if ($PSVersionTable.PSVersion.Major -lt 5) {
  Write-Host "[ERROR] Requires PowerShell 5.1+" -ForegroundColor Red
  Read-Host "Press Enter to exit" | Out-Null
  exit 1
}

function Pause-IfNeeded {
  try { Read-Host "`n  Press Enter to close..." | Out-Null } catch { }
}

function Write-Ok([string]$t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Info([string]$t) { Write-Host "  [>>] $t" -ForegroundColor Yellow }
function Write-Err([string]$t)  { Write-Host "  [!!] $t" -ForegroundColor Red }

# ---------- free port ---------------------------------------------------------
function Stop-Port([int]$port) {
  $lines = netstat -ano | Select-String "[:.]${port}\s"
  foreach ($line in $lines) {
    $cols = ($line.Line -split '\s+') | Where-Object { $_ }
    $pid_ = $cols[-1]
    if ($pid_ -and $pid_ -ne "0") {
      try {
        $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
        if ($proc) {
          Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
          Write-Info "Port ${port}: killed PID $pid_ ($($proc.Name))"
        }
      } catch { }
    }
  }
}

# ---------- status board ------------------------------------------------------
function Get-Snapshot([int]$port) {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:${port}/api/snapshot" `
           -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    return $r.Content | ConvertFrom-Json
  } catch { return $null }
}

function Get-ProxyStatus([int]$port) {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:${port}/api/proxy/status" `
           -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    return $r.Content | ConvertFrom-Json
  } catch { return $null }
}

function Format-Conn($st) {
  $parts = @()
  if ($null -ne $st.mqtt) { $parts += if ($st.mqtt) { "MQTT[on]" } else { "MQTT[--]" } }
  if ($null -ne $st.ws)   { $parts += if ($st.ws)   { "WS[on]"   } else { "WS[--]"   } }
  if ($parts.Count -eq 0) { return "-" }
  return ($parts -join "  ")
}

function Show-StatusBoard([int]$port) {
  $snap  = Get-Snapshot $port
  $proxy = Get-ProxyStatus $port
  $now   = Get-Date -Format "HH:mm:ss"

  Clear-Host
  Write-Host ""
  Write-Host "  ============================================================" -ForegroundColor Cyan

  if (-not $snap) {
    Write-Host "  Gamebet Status  $now   Backend: OFFLINE" -ForegroundColor Red
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host "  [!] Backend not responding: http://localhost:${port}/" -ForegroundColor Red
    Write-Host "  ============================================================" -ForegroundColor DarkGray
    Write-Host "  Ctrl+C to exit" -ForegroundColor DarkGray
    return
  }

  $totalMatches = $snap.status.matchCount
  $backendState = if ($snap.status.running) { "OK" } else { "STOPPED" }
  Write-Host ("  Gamebet Status  {0}   Matches: {1,-4}   Backend: {2}" -f $now, $totalMatches, $backendState) -ForegroundColor Cyan
  Write-Host "  ============================================================" -ForegroundColor Cyan
  Write-Host ("  {0,-8}  {1,-12}  {2,-8}  {3}" -f "Platform","Status","Matches","Connection") -ForegroundColor DarkGray
  Write-Host "  ------------------------------------------------------------" -ForegroundColor DarkGray

  $platformOrder = @("OB","IM","RAY","TF","IA","SABA","XBet","PB","IMT","HG","Stake")

  foreach ($id in $platformOrder) {
    $p = $snap.platforms.$id
    if (-not $p) { continue }

    $st = if ($p.PSObject.Properties.Name -contains "status") { $p.status } else { $p }

    if ($st.running) {
      if ($st.PSObject.Properties.Name -contains "error" -and $st.error) {
        $statusTxt = "[ERR]"
        $statusCol = "Red"
      } elseif ($st.PSObject.Properties.Name -contains "syncing" -and $st.syncing) {
        $statusTxt = "[SYNC]"
        $statusCol = "Yellow"
      } else {
        $statusTxt = "[RUN]"
        $statusCol = "Green"
      }
      $mc = if ($st.PSObject.Properties.Name -contains "matchCount") { $st.matchCount } else { 0 }
      $matchTxt = "${mc} matches"
      $connTxt  = Format-Conn $st
    } else {
      $note = if ($st.PSObject.Properties.Name -contains "note" -and $st.note) { $st.note } else { "not running" }
      $statusTxt = "[--]"
      $statusCol = "DarkGray"
      $matchTxt  = "-"
      $connTxt   = "-"
    }

    Write-Host ("  {0,-8}  " -f $id) -NoNewline -ForegroundColor White
    Write-Host ("{0,-12}  " -f $statusTxt) -NoNewline -ForegroundColor $statusCol
    Write-Host ("{0,-8}  "  -f $matchTxt)  -NoNewline -ForegroundColor White
    $connCol = if ($connTxt -match "\[on\]") { "Cyan" } else { "DarkGray" }
    Write-Host $connTxt -ForegroundColor $connCol
  }

  Write-Host "  ------------------------------------------------------------" -ForegroundColor DarkGray

  # errors
  foreach ($id in $platformOrder) {
    $p = $snap.platforms.$id
    if (-not $p) { continue }
    $st = if ($p.PSObject.Properties.Name -contains "status") { $p.status } else { $p }
    if ($st.PSObject.Properties.Name -contains "error" -and $st.error) {
      Write-Host ("  [!] {0}: {1}" -f $id, $st.error) -ForegroundColor Red
    }
  }

  # proxy
  $proxyLine = if ($proxy -and $proxy.enabled) { "[on]  esport WS proxy active" } `
               elseif ($proxy)                 { "[--]  esport proxy disabled"  } `
               else                            { "[?]   cannot reach proxy api"  }
  $proxyCol  = if ($proxy -and $proxy.enabled) { "Cyan" } else { "DarkGray" }
  Write-Host ("  Proxy   {0}" -f $proxyLine) -ForegroundColor $proxyCol
  Write-Host ("  Backend http://localhost:${port}/") -ForegroundColor DarkGray
  Write-Host ("  App     http://localhost:${AppPort}/app/") -ForegroundColor DarkGray
  Write-Host "  ============================================================" -ForegroundColor DarkGray
  Write-Host ("  Ctrl+C to exit  |  refresh every {0}s" -f $Interval) -ForegroundColor DarkGray
}

# ---------- status mode -------------------------------------------------------
if ($Mode -eq "status") {
  Write-Host "  Connecting to http://localhost:${BackendPort}/api/snapshot ..." -ForegroundColor Yellow
  try {
    while ($true) {
      Show-StatusBoard $BackendPort
      Start-Sleep -Seconds $Interval
    }
  } finally {
    Write-Host "`n  Exited." -ForegroundColor DarkGray
  }
  exit 0
}

# ---------- check npm ---------------------------------------------------------
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Err "npm not found. Please install Node.js."
  Pause-IfNeeded
  exit 1
}

# ---------- mode label --------------------------------------------------------
$modeLabel = switch ($Mode) {
  "dev"     { "Full dev  (ESPORT_BRIDGE=1)" }
  "parity"  { "Parity    (ESPORT_BRIDGE=0  ENABLE_OB=0)" }
  "backend" { "Backend only" }
  "vite"    { "Vite only" }
}

$ROOT         = $PSScriptRoot
$BACKEND_DIR  = Join-Path $ROOT "gamebet_backend"
$FRONTEND_DIR = Join-Path $ROOT "gamebet_frontend"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "    Gamebet Dev  [$modeLabel]" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  Backend : http://localhost:${BackendPort}/" -ForegroundColor White
Write-Host "  App     : http://localhost:${AppPort}/app/" -ForegroundColor White
if ($Proxy) { Write-Host "  Proxy   : $Proxy" -ForegroundColor White }
Write-Host ""

# ---------- free ports --------------------------------------------------------
if ($Mode -ne "vite")    { Write-Info "Freeing port ${BackendPort}..."; Stop-Port $BackendPort }
if ($Mode -ne "backend") { Write-Info "Freeing port ${AppPort}...";    Stop-Port $AppPort }
Start-Sleep -Milliseconds 600

# ---------- env vars ----------------------------------------------------------
$esportBridge  = if ($Mode -eq "parity") { "0" } else { "1" }
$enableOb      = if ($Mode -eq "parity") { "0" } else { "1" }
$backendEnvStr = "set PORT=${BackendPort}&& set A8_AUTH=0&& set ESPORT_BRIDGE=${esportBridge}&& set ENABLE_OB=${enableOb}&& set SKIP_APP_BUILD=1"
if ($Proxy) { $backendEnvStr += "&& set HTTPS_PROXY=${Proxy}&& set HTTP_PROXY=${Proxy}" }
$viteEnvStr    = "set VITE_API_PROXY=http://127.0.0.1:${BackendPort}"

# ---------- start windows -----------------------------------------------------
if ($Mode -in @("dev","parity","backend")) {
  $cmd = "cd /d `"$BACKEND_DIR`" && $backendEnvStr && npm run web"
  Start-Process "cmd.exe" -ArgumentList "/k", $cmd
  Write-Ok "Backend window started"
}

if ($Mode -in @("dev","parity","vite")) {
  $cmd = "cd /d `"$FRONTEND_DIR`" && $viteEnvStr && npm run app:dev"
  Start-Process "cmd.exe" -ArgumentList "/k", $cmd
  Write-Ok "Vite window started"
}

# ---------- wait for backend, open browser ------------------------------------
if (-not $NoBrowser -and $Mode -in @("dev","parity","vite")) {
  Write-Info "Waiting for backend (up to 15s)..."
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:${BackendPort}/" `
             -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
      if ($r.StatusCode -lt 500) { $ready = $true; break }
    } catch { }
  }
  if ($ready) {
    Write-Ok "Backend ready -- opening browser"
    Start-Process "http://localhost:${AppPort}/app/"
  } else {
    Write-Info "Backend not ready yet. Open manually: http://localhost:${AppPort}/app/"
  }
}

# ---------- initial status snapshot -------------------------------------------
if ($Mode -in @("dev","parity","backend")) {
  Write-Info "Fetching initial status..."
  Start-Sleep -Seconds 2
  Show-StatusBoard $BackendPort
} else {
  Write-Host ""
  Write-Host "  +------------------------------------------+" -ForegroundColor DarkCyan
  Write-Host "  |  App     http://localhost:${AppPort}/app/      |" -ForegroundColor DarkCyan
  Write-Host "  |  Backend http://localhost:${BackendPort}/           |" -ForegroundColor DarkCyan
  Write-Host "  +------------------------------------------+" -ForegroundColor DarkCyan
}

Write-Host ""
Write-Host "  Tip: .\dev.ps1 -Mode status   live system dashboard" -ForegroundColor DarkGray
Write-Host ""

Pause-IfNeeded
