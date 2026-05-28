# Requires Administrator. Remove PG16 remnants, install/configure PG18 on D:
$ErrorActionPreference = "Stop"
$logFile = Join-Path $PSScriptRoot "setup-postgresql-18.log"
function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  $line | Tee-Object -FilePath $logFile -Append
}

$pgRoot = "D:\Program Files\PostgreSQL"
$pg16 = "$pgRoot\16"
$pg18 = "D:\PostgreSQL\18"
$pgPw = "GamebetPg2026!"
$installer = "$env:TEMP\postgresql-18.4-1-windows-x64.exe"
$dataDir = "$pg18\data"

function Stop-PgService($name) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $svc) { return }
  if ($svc.Status -eq "Running") {
    Log "Stopping service $name ..."
    try {
      Stop-Service -Name $name -Force -ErrorAction Stop
    } catch {
      & net.exe stop $name 2>&1 | Out-Null
    }
    Start-Sleep -Seconds 3
  }
  $sc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($sc) {
    Log "Deleting service $name ..."
    & sc.exe delete $name 2>&1 | Out-Null
    Start-Sleep -Seconds 2
  }
}

function Uninstall-PgDir($dir) {
  $exe = Join-Path $dir "uninstall-postgresql.exe"
  if (Test-Path $exe) {
    Log "Running uninstaller: $exe"
    $p = Start-Process -FilePath $exe -ArgumentList "--mode", "unattended" -Wait -PassThru
    Log "  uninstall exit $($p.ExitCode)"
  }
}

function Remove-PgTree($path) {
  if (-not (Test-Path $path)) { return }
  Log "Removing directory tree: $path"
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
}

Log "=== PostgreSQL 18 setup (admin) ==="

Stop-PgService "postgresql-x64-16"
Stop-PgService "postgresql-x64-18"

foreach ($dir in @($pg16, "$pgRoot\18", $pg18, "D:\PostgreSQL\16")) {
  Uninstall-PgDir $dir
}

Start-Sleep -Seconds 2
Remove-PgTree $pg16
Remove-PgTree "$pgRoot\18"
Remove-PgTree $pg18
Remove-PgTree "D:\PostgreSQL\16"

New-Item -ItemType Directory -Path $pg18 -Force | Out-Null

Log "=== Download installer if needed ==="
if (-not (Test-Path $installer)) {
  Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64.exe" -OutFile $installer -UseBasicParsing
}

Log "=== Install PostgreSQL 18 ==="
$installArgs = @(
  "--mode", "unattended",
  "--unattendedmodeui", "none",
  "--prefix", $pg18,
  "--datadir", $dataDir,
  "--servicename", "postgresql-x64-18",
  "--serverport", "5432",
  "--superaccount", "postgres",
  "--superpassword", $pgPw,
  "--create_shortcuts", "0"
)
$p = Start-Process -FilePath $installer -ArgumentList $installArgs -Wait -PassThru
Log "Installer exit code: $($p.ExitCode)"
if ($p.ExitCode -ne 0) {
  foreach ($instLog in @(
      (Join-Path $env:TEMP "install-postgresql.log"),
      "C:\Windows\Temp\install-postgresql.log"
    )) {
    if (Test-Path $instLog) {
      Log "--- tail $instLog ---"
      Get-Content $instLog -Tail 60 | ForEach-Object { Log $_ }
      Copy-Item $instLog (Join-Path $PSScriptRoot "install-postgresql-last.log") -Force
    }
  }
  throw "PG18 installer failed with exit $($p.ExitCode)"
}

Start-Sleep -Seconds 8
$psql = Join-Path $pg18 "bin\psql.exe"
if (-not (Test-Path $psql)) {
  throw "psql not found at $psql after install"
}

$svc = Get-Service "postgresql-x64-18" -ErrorAction Stop
Log "Service postgresql-x64-18: $($svc.Status)"
if ($svc.Status -ne "Running") {
  Start-Service "postgresql-x64-18"
  Start-Sleep -Seconds 5
  Log "Service after start: $((Get-Service 'postgresql-x64-18').Status)"
}

$env:PGPASSWORD = $pgPw
& $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -c "SELECT version();"
$exists = (& $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='gamebet'").Trim()
if ($exists -ne "1") {
  & $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -c "CREATE DATABASE gamebet;"
  Log "Created database gamebet"
} else {
  Log "Database gamebet already exists"
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$bin = Join-Path $pg18 "bin"
if ($userPath -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$bin", "User")
  $env:Path = "$env:Path;$bin"
  Log "Added $bin to user PATH"
}

$envFile = "c:\Users\mints\Documents\gamebet\changmen\gamebet_backend\.env.postgresql.local"
@"
# Local PostgreSQL 18 (do not commit if it contains secrets)
DATABASE_URL=postgresql://postgres:${pgPw}@127.0.0.1:5432/gamebet
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=${pgPw}
PGDATABASE=gamebet
"@ | Set-Content -Path $envFile -Encoding UTF8
Log "Wrote $envFile"

Log "=== Done ==="
Log "PostgreSQL 18: $pg18"
Log "postgres password: $pgPw"
Log "DATABASE_URL=postgresql://postgres:***@127.0.0.1:5432/gamebet"
