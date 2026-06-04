[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot\..

# stop running GameBet
Get-Process GameBet -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Stopping GameBet (PID $($_.Id))..."
    $_.Kill()
}
Start-Sleep -Seconds 2

# build
Write-Host "`n[1/3] Building..."
npm run electron:build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

# copy data into win-unpacked
Write-Host "`n[2/3] Copying data..."
$unpacked = "..\..\dist_electron\win-unpacked"
Copy-Item "..\gamebetdb" "$unpacked\gamebetdb" -Recurse -Force
Copy-Item "storage"      "$unpacked\storage"   -Recurse -Force
Write-Host "Data copied."

# create portable zip
Write-Host "`n[3/3] Compressing..."
$zipPath = "..\..\dist_electron\GameBet-portable.zip"
Remove-Item $zipPath -ErrorAction SilentlyContinue
Compress-Archive -Path "$unpacked\*" -DestinationPath $zipPath
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "`nDone: $zipPath ($sizeMB MB)"
Write-Host "Extract and run GameBet.exe directly, no installation needed."
