$ErrorActionPreference = "Stop"
$pg18 = "D:\Program Files\PostgreSQL\18"
$pgPw = "GamebetPg2026!"
$installer = "$env:TEMP\postgresql-18.4-1-windows-x64.exe"
$dataDir = "$pg18\data"

# Remove broken partial install (bin missing)
if ((Test-Path $pg18) -and -not (Test-Path "$pg18\bin\psql.exe")) {
  Write-Host "Removing incomplete $pg18 (keeping backup of data if any)..."
  $bak = "$pg18\data_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  if (Test-Path $dataDir) {
    Move-Item -LiteralPath $dataDir -Destination $bak -Force -ErrorAction SilentlyContinue
  }
  Get-ChildItem -LiteralPath $pg18 -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Downloading installer..."
if (-not (Test-Path $installer)) {
  Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64.exe" -OutFile $installer -UseBasicParsing
}

Write-Host "Installing PostgreSQL 18 to $pg18 ..."
$p = Start-Process -FilePath $installer -ArgumentList @(
  "--mode", "unattended",
  "--unattendedmodeui", "none",
  "--prefix", $pg18,
  "--datadir", $dataDir,
  "--servicename", "postgresql-x64-18",
  "--serverport", "5432",
  "--superpassword", $pgPw,
  "--install_runtimes", "0"
) -Wait -PassThru
Write-Host "Installer exit: $($p.ExitCode)"
if ($p.ExitCode -ne 0) { exit $p.ExitCode }

Start-Sleep -Seconds 8
Get-Service postgresql-x64-18 | Format-Table Name, Status

$psql = "$pg18\bin\psql.exe"
$env:PGPASSWORD = $pgPw
& $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -c "SELECT version();"
$exists = (& $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='gamebet'").Trim()
if ($exists -ne "1") {
  & $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -c "CREATE DATABASE gamebet;"
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$pg18\bin*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$pg18\bin", "User")
}

$envFile = "c:\Users\mints\Documents\gamebet\changmen\gamebet_backend\.env.postgresql.local"
@"
DATABASE_URL=postgresql://postgres:${pgPw}@127.0.0.1:5432/gamebet
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=${pgPw}
PGDATABASE=gamebet
"@ | Set-Content -Path $envFile -Encoding UTF8

Write-Host "OK. password=$pgPw database=gamebet env=$envFile"
