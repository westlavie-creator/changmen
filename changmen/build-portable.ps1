[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$root     = $PSScriptRoot
$backend  = Join-Path $root 'gamebet_backend'
$frontend = Join-Path $root 'gamebet_frontend\app'

Write-Host ''
Write-Host '========================================'
Write-Host '  GameBet Build (Portable)'
Write-Host '========================================'
Write-Host ''

# --- check npm ---
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] npm not found. Install Node.js first.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

# --- install deps if missing ---
if (-not (Test-Path (Join-Path $backend 'node_modules'))) {
    Write-Host '[prep] Installing backend dependencies...' -ForegroundColor Cyan
    Push-Location $backend
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[ERROR] Backend npm install failed' -ForegroundColor Red
        Read-Host 'Press Enter'; exit 1
    }
}

if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host '[prep] Installing frontend dependencies...' -ForegroundColor Cyan
    Push-Location $frontend
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[ERROR] Frontend npm install failed' -ForegroundColor Red
        Read-Host 'Press Enter'; exit 1
    }
}

# --- build frontend ---
Write-Host '[1/2] Building frontend (vite)...' -ForegroundColor Cyan
Push-Location $frontend
npm run build
Pop-Location
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] Frontend build failed' -ForegroundColor Red
    Read-Host 'Press Enter'; exit 1
}
Write-Host '      OK' -ForegroundColor Green
Write-Host ''

# --- build electron portable ---
Write-Host '[2/2] Packaging Electron (portable)...' -ForegroundColor Cyan
Push-Location $backend
powershell -NoProfile -ExecutionPolicy Bypass -File 'host\electron\build-portable.ps1'
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) {
    Write-Host '[ERROR] Electron build failed' -ForegroundColor Red
    Read-Host 'Press Enter'; exit 1
}

Write-Host ''
Write-Host '========================================'
Write-Host '  Done!' -ForegroundColor Green
Write-Host "  Output: $root\dist\electron\GameBet-portable.zip"
Write-Host '========================================'
Write-Host ''
Read-Host 'Press Enter to close'
