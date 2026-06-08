[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot\..\..

$repoRoot = (Resolve-Path "..\..").Path
$outRoot  = Join-Path $repoRoot "dist_electron"
$buildStamp = (Get-Date).ToString('yyyyMMdd_HHmmss')
if (-not $buildStamp) { Write-Error 'buildStamp empty'; exit 1 }
$staging  = Join-Path $repoRoot ("dist_electron_staging_{0}" -f $buildStamp)
$unpacked = Join-Path $staging "win-unpacked"
$zipPath  = Join-Path $outRoot "GameBet-portable.zip"
$latestPointer = Join-Path $outRoot "LATEST_STAGING.txt"
# Fresh staging dir each build; avoids app.asar lock under dist_electron_staging

function Stop-GameBetProcesses {
    $names = @("GameBet", "electron")
    foreach ($name in $names) {
        Get-Process $name -ErrorAction SilentlyContinue | ForEach-Object {
            $path = $_.Path
            if ($name -eq "electron" -and $path -and $path -notmatch "gamebet|dist_electron") { return }
            Write-Host "Stopping $name (PID $($_.Id))..."
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

function Clear-DirWithRetry {
    param([string]$Path, [int]$Retries = 5)
    if (-not (Test-Path $Path)) { return $true }
    for ($i = 1; $i -le $Retries; $i++) {
        try {
            Remove-Item $Path -Recurse -Force -ErrorAction Stop
            return $true
        } catch {
            if ($i -lt $Retries) {
                Write-Host "Cannot remove $Path (attempt $i/$Retries), retrying..."
                Stop-GameBetProcesses
                Start-Sleep -Seconds 2
            } else {
                Write-Warning "Cannot remove $Path : $($_.Exception.Message)"
                return $false
            }
        }
    }
    return $false
}

Stop-GameBetProcesses
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$stagingLeaf = Split-Path $staging -Leaf
Write-Host "`n[1/3] Compiling router.ts + building (output: $stagingLeaf)..."
npm run compile:router
if ($LASTEXITCODE -ne 0) { Write-Error "compile:router failed"; exit 1 }
npx electron-builder --config host/electron-builder.yml --win "--config.directories.output=../../$stagingLeaf"
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

Write-Host "`n[2/3] Copying data..."
if (Test-Path "..\gamebetdb") { Copy-Item "..\gamebetdb" "$unpacked\gamebetdb" -Recurse -Force }
if (Test-Path "storage")      { Copy-Item "storage"      "$unpacked\storage"   -Recurse -Force }
if (Test-Path ".env") {
    Copy-Item ".env" "$unpacked\.env" -Force
    Write-Host ".env copied (Supabase credentials included)."
} else {
    Write-Host ".env not found — Supabase features will be unavailable."
}
Write-Host "Data copied."

Write-Host "`n[3/3] Compressing..."
Remove-Item $zipPath -ErrorAction SilentlyContinue
Compress-Archive -Path "$unpacked\*" -DestinationPath $zipPath
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Set-Content -Path $latestPointer -Value $stagingLeaf -Encoding utf8
Write-Host "`nDone: $zipPath ($sizeMB MB)"
Write-Host "Unpacked: $unpacked"
Write-Host "Latest staging pointer: $latestPointer"
Write-Host "Extract and run GameBet.exe directly, no installation needed."
Write-Host "Old dist_electron_staging_* folders can be deleted manually when nothing holds app.asar."
