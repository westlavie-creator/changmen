[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$changmenRoot = Join-Path $repoRoot 'changmen'
$electronDist = Join-Path $changmenRoot 'dist\electron'

function Stop-GameBetProcesses {
    foreach ($name in @('GameBet', 'electron')) {
        Get-Process $name -ErrorAction SilentlyContinue | ForEach-Object {
            $path = $_.Path
            if ($name -eq 'electron' -and $path -and $path -notmatch 'gamebet|dist[/\\]electron|dist_electron') { return }
            Write-Host "Stopping $name (PID $($_.Id))..."
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

function Remove-Tree($path) {
    if (-not (Test-Path -LiteralPath $path)) { return $true }
    try {
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
        Write-Host "deleted: $path"
        return $true
    } catch {
        Write-Warning "failed: $path — $($_.Exception.Message)"
        return $false
    }
}

function Remove-OldStaging($parent) {
    if (-not (Test-Path $parent)) { return }
    $keep = $null
    $pointer = Join-Path $parent 'LATEST_STAGING.txt'
    if (Test-Path $pointer) {
        $keep = (Get-Content $pointer -Raw).Trim()
    }
    Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'staging_*' -and $_.Name -ne $keep } |
        ForEach-Object { Remove-Tree $_.FullName }
}

Stop-GameBetProcesses

Write-Host "`n[1/2] Legacy repo-root Electron folders..."
Get-ChildItem -LiteralPath $repoRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'dist_electron*' } |
    ForEach-Object { Remove-Tree $_.FullName }

Remove-Tree (Join-Path $repoRoot 'dist_electron_verify')
Remove-Tree (Join-Path $repoRoot 'temp')
Remove-Tree (Join-Path $repoRoot '_asar_test')

Write-Host "`n[2/2] Old changmen/dist/electron staging (keep LATEST_STAGING)..."
Remove-OldStaging $electronDist

Write-Host "`nDone. If dist_electron* still exists, close GameBet/Cursor and re-run this script."
